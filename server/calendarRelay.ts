import { createHash } from 'node:crypto'
import { Composio } from '@composio/core'
import { waitUntil } from '@vercel/functions'
import { HttpError } from './auth.js'
import { ensureSchema, pool, WORKSPACE_ID } from './db.js'

/**
 * The team calendar lives in skatebored (collection "events"). This module copies it
 * one way into the Google Calendar of every member who connected theirs through
 * Composio, and keeps those copies in step: new events are created, edits are applied,
 * deleted events are removed. Nobody's own Google events are ever read.
 *
 * sb_calendar_relays remembers, per (event, member), the Google event id and a hash of
 * what was last written, so a run only calls Google for what actually changed.
 */

export const TOOLKIT = 'googlecalendar'
/** Google calls per run; anything left over is picked up by the next run. */
const MAX_CALLS = 150
const CONCURRENCY = 4

function need(name: string) {
  const v = process.env[name]
  if (!v) throw new HttpError(503, `Google Calendar isn’t set up on the server yet (${name} is missing)`)
  return v
}

let _client: Composio | null = null
export function composio() {
  _client ??= new Composio({
    apiKey: need('COMPOSIO_API_KEY'),
    // Tool calls are pinned to a toolkit version so a Composio release can't change behaviour under us.
    toolkitVersions: { [TOOLKIT]: need('COMPOSIO_GCAL_VERSION') },
  })
  return _client
}

export const calendarConfigured = () => !!(process.env.COMPOSIO_API_KEY && process.env.COMPOSIO_GCAL_VERSION && process.env.COMPOSIO_GCAL_AUTH_CONFIG_ID)

export interface TeamEventData {
  title: string
  description?: string
  location?: string
  start: string
  durationMinutes: number
}

/** Clerk ids of workspace members whose Google Calendar is connected and active. */
export async function connectedMembers(): Promise<Set<string>> {
  const { rows } = await pool().query<{ clerk_id: string }>(
    `select data->>'clerkId' as clerk_id from sb_records where workspace_id = $1 and collection = 'users' and not deleted and data->>'clerkId' is not null`,
    [WORKSPACE_ID],
  )
  const out = new Set<string>()
  // Listed items don't say which user they belong to, so ask per member (teams are small).
  await pooled(rows, async ({ clerk_id }) => {
    if (await isConnected(clerk_id)) out.add(clerk_id)
  })
  return out
}

export async function isConnected(clerkId: string) {
  const { items } = await composio().connectedAccounts.list({ userIds: [clerkId], toolkitSlugs: [TOOLKIT], limit: 20 })
  return (items as { status: string }[]).some((a) => a.status === 'ACTIVE')
}

const hashOf = (e: TeamEventData) => createHash('sha256').update(JSON.stringify([e.title, e.description ?? '', e.location ?? '', e.start, e.durationMinutes])).digest('hex')

function appUrl() {
  const host = process.env.APP_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL
  return host ? (host.startsWith('http') ? host : `https://${host}`) : ''
}

function googleArgs(e: TeamEventData) {
  const minutes = Math.min(Math.max(Math.round(e.durationMinutes) || 30, 5), 24 * 60)
  const link = appUrl()
  return {
    calendar_id: 'primary',
    summary: e.title.slice(0, 300),
    description: [e.description?.slice(0, 7000), `Team event from skatebored${link ? ` · ${link}/calendar` : ''}`].filter(Boolean).join('\n\n'),
    location: e.location?.slice(0, 500) || undefined,
    // An explicit UTC instant; Google shows it in each member's own timezone.
    start_datetime: new Date(e.start).toISOString().slice(0, 19) + 'Z',
    timezone: 'UTC',
    event_duration_hour: Math.floor(minutes / 60),
    event_duration_minutes: minutes % 60,
    create_meeting_room: false,
    send_updates: 'none',
  }
}

async function run(userId: string, slug: string, args: Record<string, unknown>) {
  const res = (await composio().tools.execute(slug, { userId, arguments: args })) as { successful: boolean; data: unknown; error?: string | null }
  if (!res.successful) throw new Error(`${slug}: ${res.error ?? 'failed'}`)
  return res.data
}

/** Composio wraps Google's payload differently across tool versions; find the event id wherever it is. */
function idOf(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  if (typeof d.id === 'string') return d.id
  for (const key of ['response_data', 'data', 'event']) {
    const found = idOf(d[key])
    if (found) return found
  }
  return null
}

async function pooled<T>(items: T[], fn: (t: T) => Promise<void>) {
  let i = 0
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]!)
  }))
}

export interface RelayResult {
  members: number
  created: number
  updated: number
  removed: number
  failed: number
  pending: boolean
}

/**
 * Brings every connected member's Google Calendar in line with the team calendar.
 * Idempotent and safe to call often; concurrent runs queue behind one advisory lock.
 */
export async function relayTeamCalendar(): Promise<RelayResult> {
  await ensureSchema()
  const lock = await pool().connect()
  try {
    await lock.query('select pg_advisory_lock(hashtext($1))', [`sb-calendar-relay:${WORKSPACE_ID}`])
    const db = pool()
    const connected = await connectedMembers()
    // Only upcoming events (and today's) are pushed; history stays in skatebored.
    const { rows: events } = await db.query<{ id: string; data: TeamEventData | null; deleted: boolean }>(
      `select id, data, deleted from sb_records where workspace_id = $1 and collection = 'events'`,
      [WORKSPACE_ID],
    )
    const { rows: relays } = await db.query<{ event_id: string; clerk_id: string; google_event_id: string; content_hash: string }>(
      `select event_id, clerk_id, google_event_id, content_hash from sb_calendar_relays where workspace_id = $1`,
      [WORKSPACE_ID],
    )
    const relayOf = new Map(relays.map((r) => [`${r.event_id}\u0000${r.clerk_id}`, r]))
    const live = new Map(events.filter((e) => !e.deleted && e.data && !Number.isNaN(Date.parse(e.data.start))).map((e) => [e.id, e.data!]))
    const cutoff = Date.now() - 86_400_000

    type Task = () => Promise<'created' | 'updated' | 'removed'>
    const tasks: Task[] = []
    for (const member of connected)
      for (const [eventId, e] of live) {
        if (Date.parse(e.start) < cutoff) continue
        const r = relayOf.get(`${eventId}\u0000${member}`)
        const hash = hashOf(e)
        if (!r)
          tasks.push(async () => {
            const googleId = idOf(await run(member, 'GOOGLECALENDAR_CREATE_EVENT', googleArgs(e)))
            if (!googleId) throw new Error('Google returned no event id')
            await db.query(
              `insert into sb_calendar_relays (workspace_id, event_id, clerk_id, google_event_id, content_hash) values ($1, $2, $3, $4, $5)
               on conflict (workspace_id, event_id, clerk_id) do update set google_event_id = excluded.google_event_id, content_hash = excluded.content_hash, updated_at = now()`,
              [WORKSPACE_ID, eventId, member, googleId, hash],
            )
            return 'created'
          })
        else if (r.content_hash !== hash)
          tasks.push(async () => {
            await run(member, 'GOOGLECALENDAR_UPDATE_EVENT', { ...googleArgs(e), event_id: r.google_event_id })
            await db.query(`update sb_calendar_relays set content_hash = $4, updated_at = now() where workspace_id = $1 and event_id = $2 and clerk_id = $3`, [WORKSPACE_ID, eventId, member, hash])
            return 'updated'
          })
      }
    for (const r of relays) {
      if (live.has(r.event_id)) continue
      // The team event was deleted: take it off that member's calendar too (if we still can).
      tasks.push(async () => {
        if (connected.has(r.clerk_id)) await run(r.clerk_id, 'GOOGLECALENDAR_DELETE_EVENT', { calendar_id: 'primary', event_id: r.google_event_id, send_updates: 'none' }).catch((err: Error) => {
          // Already gone from Google (the member deleted it) is fine.
          if (!/404|410|not ?found|deleted/i.test(err.message)) throw err
        })
        await db.query(`delete from sb_calendar_relays where workspace_id = $1 and event_id = $2 and clerk_id = $3`, [WORKSPACE_ID, r.event_id, r.clerk_id])
        return 'removed'
      })
    }

    const result: RelayResult = { members: connected.size, created: 0, updated: 0, removed: 0, failed: 0, pending: tasks.length > MAX_CALLS }
    await pooled(tasks.slice(0, MAX_CALLS), async (t) => {
      try {
        result[await t()]++
      } catch (err) {
        result.failed++
        console.error('[calendar-relay]', (err as Error).message)
      }
    })
    if (result.created || result.updated || result.removed || result.failed) console.log('[calendar-relay]', result)
    return result
  } finally {
    await lock.query('select pg_advisory_unlock(hashtext($1))', [`sb-calendar-relay:${WORKSPACE_ID}`]).catch(() => {})
    lock.release()
  }
}

/** Fire-and-forget relay after a response is sent (kept alive by waitUntil on Vercel). */
export function scheduleRelay() {
  if (!calendarConfigured()) return
  waitUntil(relayTeamCalendar().then((r) => (r.pending ? relayTeamCalendar() : r)).catch((e) => console.error('[calendar-relay] run failed', e)))
}

/** Removes the copies of team events from one member's Google Calendar (used when they disconnect). */
export async function unrelayMember(clerkId: string) {
  await ensureSchema()
  const { rows } = await pool().query<{ event_id: string; google_event_id: string }>(
    `select event_id, google_event_id from sb_calendar_relays where workspace_id = $1 and clerk_id = $2`,
    [WORKSPACE_ID, clerkId],
  )
  await pooled(rows, async (r) => {
    await run(clerkId, 'GOOGLECALENDAR_DELETE_EVENT', { calendar_id: 'primary', event_id: r.google_event_id, send_updates: 'none' }).catch(() => {})
  })
  await pool().query(`delete from sb_calendar_relays where workspace_id = $1 and clerk_id = $2`, [WORKSPACE_ID, clerkId])
}
