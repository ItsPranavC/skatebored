import { createHash } from 'node:crypto'
import pg from 'pg'
import { Composio } from '@composio/core'
import { waitUntil } from '@vercel/functions'
import { HttpError } from './auth.js'
import { ensureSchema, pool, WORKSPACE_ID } from './db.js'

/**
 * The team calendar lives in skatebored: team events (collection "events"), sprint
 * start/end dates and release dates. This module copies all of it one way into the
 * Google Calendar of every member who connected theirs through Composio, and keeps the
 * copies in step: new items are created, edits applied, removed items deleted.
 * Nobody's own Google events are ever read.
 *
 * Google is called through Composio's authenticated proxy (the raw Calendar API), which
 * supports all-day events. sb_calendar_relays remembers, per (item, member), the Google
 * event id and a hash of what was last written, so a run only calls Google for changes.
 */

export const TOOLKIT = 'googlecalendar'
/** Sprint and release dates are whole days in the team's timezone. */
const TEAM_TZ = process.env.TEAM_TIMEZONE || 'America/Chicago'
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
  _client ??= new Composio({ apiKey: need('COMPOSIO_API_KEY'), toolkitVersions: { [TOOLKIT]: need('COMPOSIO_GCAL_VERSION') } })
  return _client
}

export const calendarConfigured = () => !!(process.env.COMPOSIO_API_KEY && process.env.COMPOSIO_GCAL_VERSION && process.env.COMPOSIO_GCAL_AUTH_CONFIG_ID)

async function pooled<T>(items: T[], fn: (t: T) => Promise<void>) {
  let i = 0
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]!)
    }),
  )
}

/** The member's active Google Calendar connection, if any. */
export async function accountOf(clerkId: string): Promise<string | null> {
  const { items } = await composio().connectedAccounts.list({ userIds: [clerkId], toolkitSlugs: [TOOLKIT], limit: 20, orderBy: 'updated_at' })
  return (items as { id: string; status: string }[]).find((a) => a.status === 'ACTIVE')?.id ?? null
}
export const isConnected = async (clerkId: string) => !!(await accountOf(clerkId))

/** Clerk id → connected account id, for workspace members whose Google Calendar is connected. */
export async function connectedMembers(): Promise<Map<string, string>> {
  const { rows } = await pool().query<{ clerk_id: string }>(
    `select data->>'clerkId' as clerk_id from sb_records where workspace_id = $1 and collection = 'users' and not deleted and data->>'clerkId' is not null`,
    [WORKSPACE_ID],
  )
  const out = new Map<string, string>()
  // Listed accounts don't say which user they belong to, so ask per member (teams are small).
  await pooled(rows, async ({ clerk_id }) => {
    const id = await accountOf(clerk_id)
    if (id) out.set(clerk_id, id)
  })
  return out
}

// ───────────────────────────── what should be on everyone's calendar ─────────────────────────────

interface Item {
  /** Stable relay key, e.g. "ev:abc", "sprint-end:s-1", "release:v-1" */
  key: string
  body: Record<string, unknown>
}

function appUrl() {
  const host = process.env.APP_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL
  return host ? (host.startsWith('http') ? host : `https://${host}`) : ''
}
const footer = () => `From the skatebored team calendar${appUrl() ? ` · ${appUrl()}/calendar` : ''}`

/** The calendar day an instant falls on in the team's timezone, as YYYY-MM-DD. */
const teamDay = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: TEAM_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
const nextDay = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)

function allDay(key: string, title: string, iso: string, description: string): Item {
  const day = teamDay(iso)
  return {
    key,
    body: {
      summary: title,
      description: [description, footer()].filter(Boolean).join('\n\n'),
      start: { date: day },
      end: { date: nextDay(day) },
      transparency: 'transparent',
      extendedProperties: { private: { skatebored: key } },
    },
  }
}

/** Engineering sprint steps (mirrors src/lib/sprintPlan.ts). */
const STEPS: Record<string, [key: string, label: string][]> = {
  research: [
    ['research', 'Research'],
    ['alternatives', 'Alternatives'],
    ['solution', 'Solution'],
  ],
  implementation: [['implementation', 'Implementation']],
}

const valid = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v))

async function desiredItems(): Promise<Item[]> {
  const { rows } = await pool().query<{ collection: string; id: string; data: Record<string, unknown> }>(
    `select collection, id, data from sb_records where workspace_id = $1 and collection in ('events', 'sprints', 'projects') and not deleted and data is not null`,
    [WORKSPACE_ID],
  )
  const projectName = new Map(rows.filter((r) => r.collection === 'projects').map((r) => [r.id, String(r.data.name ?? '')]))
  const engineering = new Set(rows.filter((r) => r.collection === 'projects' && r.data.engineering).map((r) => r.id))
  const cutoff = Date.now() - 2 * 86_400_000
  const items: Item[] = []
  for (const { collection, id, data: d } of rows) {
    if (collection === 'events' && valid(d.start) && Date.parse(d.start) >= cutoff) {
      const minutes = Math.min(Math.max(Math.round(Number(d.durationMinutes)) || 30, 5), 24 * 60)
      const start = new Date(d.start)
      items.push({
        key: `ev:${id}`,
        body: {
          summary: String(d.title ?? '').slice(0, 300) || 'Team event',
          description: [String(d.description ?? '').slice(0, 7000), footer()].filter(Boolean).join('\n\n'),
          location: String(d.location ?? '').slice(0, 500) || undefined,
          start: { dateTime: start.toISOString() },
          end: { dateTime: new Date(start.getTime() + minutes * 60_000).toISOString() },
          extendedProperties: { private: { skatebored: `ev:${id}` } },
        },
      })
    }
    if (collection === 'sprints' && d.state !== 'closed') {
      const project = projectName.get(String(d.projectId)) ?? ''
      const goal = d.goal ? `Sprint goal: ${d.goal}` : ''
      if (valid(d.startDate) && Date.parse(d.startDate) >= cutoff) items.push(allDay(`sprint-start:${id}`, `${d.name} starts${project ? ` · ${project}` : ''}`, d.startDate, goal))
      if (valid(d.endDate) && Date.parse(d.endDate) >= cutoff) items.push(allDay(`sprint-end:${id}`, `${d.name} ends${project ? ` · ${project}` : ''}`, d.endDate, goal))
      // Engineering sprints: each step's presentation (30 min) and the implementation date.
      const steps = STEPS[String(d.kind)]
      if (steps && engineering.has(String(d.projectId)))
        for (const [key, label] of steps) {
          const step = (d.steps as Record<string, { docs?: string[]; presentAt?: string | null; date?: string | null }> | undefined)?.[key]
          const docs = (step?.docs ?? []).slice(0, 10).join('\n')
          if (valid(step?.presentAt) && Date.parse(step.presentAt) >= cutoff) {
            const start = new Date(step.presentAt)
            items.push({
              key: `sprint-present:${id}:${key}`,
              body: {
                summary: `${label} presentation · ${d.name}${project ? ` · ${project}` : ''}`,
                description: [docs && `Docs:\n${docs}`, footer()].filter(Boolean).join('\n\n'),
                start: { dateTime: start.toISOString() },
                end: { dateTime: new Date(start.getTime() + 30 * 60_000).toISOString() },
                extendedProperties: { private: { skatebored: `sprint-present:${id}:${key}` } },
              },
            })
          }
          if (valid(step?.date) && Date.parse(step.date) >= cutoff)
            items.push(allDay(`sprint-impl:${id}`, `${d.name} implementation${project ? ` · ${project}` : ''}`, step.date, docs && `Docs:\n${docs}`))
        }
    }
    if (collection === 'projects')
      for (const v of (d.versions as { id: string; name: string; description?: string; releaseDate: string | null; released: boolean; archived: boolean }[] | undefined) ?? [])
        if (!v.released && !v.archived && valid(v.releaseDate) && Date.parse(v.releaseDate) >= cutoff)
          items.push(allDay(`release:${v.id}`, `Release ${v.name} · ${d.name}`, v.releaseDate, v.description ?? ''))
  }
  return items
}

/** Google event ids must be base32hex (0-9, a-v); a hex digest with an "sb" prefix is. */
const googleIdFor = (key: string, member: string) => 'sb' + createHash('sha256').update(`${WORKSPACE_ID}\u0000${key}\u0000${member}`).digest('hex').slice(0, 40)

const hashOf = (body: Record<string, unknown>) => createHash('sha256').update(JSON.stringify(body)).digest('hex')

// ───────────────────────────── Google via Composio's proxy ─────────────────────────────

async function google(accountId: string, method: 'POST' | 'PUT' | 'DELETE', endpoint: string, body?: unknown) {
  const res = (await composio().tools.proxyExecute({
    endpoint,
    method,
    connectedAccountId: accountId,
    body,
    parameters: [{ in: 'query', name: 'sendUpdates', value: 'none' }],
  })) as { status: number; data: unknown }
  if (res.status >= 400) throw Object.assign(new Error(`Google ${method} ${endpoint} → ${res.status}: ${JSON.stringify(res.data).slice(0, 300)}`), { status: res.status })
  return res.data as { id?: string } | undefined
}

const gone = (e: unknown) => [404, 410].includes((e as { status?: number }).status ?? 0)

// ───────────────────────────── the relay ─────────────────────────────

export interface RelayResult {
  members: number
  created: number
  updated: number
  removed: number
  failed: number
  pending: boolean
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * One relay at a time per workspace, across all function instances. The lock is a
 * session advisory lock on a direct (unpooled) connection: Neon's pooled endpoint runs
 * PgBouncer in transaction mode, where session locks don't hold. Waiting is done by
 * polling, so a queued run never sits on a pooled connection the active run needs.
 */
async function withRelayLock<T>(fn: () => Promise<T>): Promise<T> {
  const key = `sb-calendar-relay:${WORKSPACE_ID}`
  for (let attempt = 0; ; attempt++) {
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL })
    await client.connect()
    try {
      const { rows } = await client.query<{ ok: boolean }>('select pg_try_advisory_lock(hashtext($1)) as ok', [key])
      if (rows[0]?.ok)
        try {
          return await fn()
        } finally {
          await client.query('select pg_advisory_unlock(hashtext($1))', [key]).catch(() => {})
        }
    } finally {
      await client.end().catch(() => {})
    }
    if (attempt >= 90) throw new Error('Another calendar relay is still running')
    await sleep(1000)
  }
}

/**
 * Brings every connected member's Google Calendar in line with the team calendar.
 * Idempotent and safe to call often.
 */
export async function relayTeamCalendar(): Promise<RelayResult> {
  await ensureSchema()
  return withRelayLock(async () => {
    const db = pool()
    const [members, items, relays] = await Promise.all([
      connectedMembers(),
      desiredItems(),
      db.query<{ event_id: string; clerk_id: string; google_event_id: string; content_hash: string }>(
        `select event_id, clerk_id, google_event_id, content_hash from sb_calendar_relays where workspace_id = $1`,
        [WORKSPACE_ID],
      ).then((r) => r.rows),
    ])
    const relayOf = new Map(relays.map((r) => [`${r.event_id}\u0000${r.clerk_id}`, r]))
    const wanted = new Set(items.map((i) => i.key))
    const save = (key: string, member: string, googleId: string, hash: string) =>
      db.query(
        `insert into sb_calendar_relays (workspace_id, event_id, clerk_id, google_event_id, content_hash) values ($1, $2, $3, $4, $5)
         on conflict (workspace_id, event_id, clerk_id) do update set google_event_id = excluded.google_event_id, content_hash = excluded.content_hash, updated_at = now()`,
        [WORKSPACE_ID, key, member, googleId, hash],
      )
    /**
     * Each copy gets an id derived from (workspace, item, member), so a create can never
     * run twice into two copies: Google answers 409 and we update the existing one instead
     * (which also restores it if the member had deleted it).
     */
    const create = async (account: string, member: string, item: Item) => {
      const id = googleIdFor(item.key, member)
      try {
        await google(account, 'POST', '/calendars/primary/events', { ...item.body, id })
      } catch (e) {
        if ((e as { status?: number }).status !== 409) throw e
        await google(account, 'PUT', `/calendars/primary/events/${id}`, { ...item.body, status: 'confirmed' })
      }
      return id
    }

    type Task = () => Promise<'created' | 'updated' | 'removed'>
    const tasks: Task[] = []
    for (const [member, account] of members)
      for (const item of items) {
        const r = relayOf.get(`${item.key}\u0000${member}`)
        const hash = hashOf(item.body)
        if (!r)
          tasks.push(async () => {
            await save(item.key, member, await create(account, member, item), hash)
            return 'created'
          })
        else if (r.content_hash !== hash)
          tasks.push(async () => {
            try {
              await google(account, 'PUT', `/calendars/primary/events/${encodeURIComponent(r.google_event_id)}`, item.body)
              await save(item.key, member, r.google_event_id, hash)
            } catch (e) {
              // They deleted our copy in Google; put it back with the new details.
              if (!gone(e)) throw e
              await save(item.key, member, await create(account, member, item), hash)
            }
            return 'updated'
          })
      }
    for (const r of relays) {
      if (wanted.has(r.event_id)) continue
      // No longer on the team calendar: take it off that member's calendar too (if we still can).
      tasks.push(async () => {
        const account = members.get(r.clerk_id)
        if (account)
          await google(account, 'DELETE', `/calendars/primary/events/${encodeURIComponent(r.google_event_id)}`).catch((e) => {
            if (!gone(e)) throw e
          })
        await db.query(`delete from sb_calendar_relays where workspace_id = $1 and event_id = $2 and clerk_id = $3`, [WORKSPACE_ID, r.event_id, r.clerk_id])
        return 'removed'
      })
    }

    const result: RelayResult = { members: members.size, created: 0, updated: 0, removed: 0, failed: 0, pending: tasks.length > MAX_CALLS }
    await pooled(tasks.slice(0, MAX_CALLS), async (t) => {
      try {
        result[await t()]++
      } catch (err) {
        result.failed++
        console.error('[calendar-relay]', (err as Error).message)
      }
    })
    if (result.created || result.updated || result.removed || result.failed) console.log('[calendar-relay]', JSON.stringify(result))
    return result
  })
}

let active: Promise<void> | null = null
let again = false

/**
 * Fire-and-forget relay after a response is sent (kept alive by waitUntil on Vercel).
 * Calls that arrive while this instance is already relaying fold into one follow-up run.
 */
export function scheduleRelay() {
  if (!calendarConfigured()) return
  if (active) {
    again = true
    waitUntil(active)
    return
  }
  active = (async () => {
    do {
      again = false
      const r = await relayTeamCalendar()
      if (r.pending) again = true
    } while (again)
  })()
    .catch((e) => console.error('[calendar-relay] run failed', e))
    .finally(() => (active = null))
  waitUntil(active)
}

/** Removes the team calendar from one member's Google Calendar (used when they disconnect). */
export async function unrelayMember(clerkId: string) {
  await ensureSchema()
  const account = await accountOf(clerkId)
  const { rows } = await pool().query<{ google_event_id: string }>(`select google_event_id from sb_calendar_relays where workspace_id = $1 and clerk_id = $2`, [WORKSPACE_ID, clerkId])
  if (account)
    await pooled(rows, async (r) => {
      await google(account, 'DELETE', `/calendars/primary/events/${encodeURIComponent(r.google_event_id)}`).catch(() => {})
    })
  await pool().query(`delete from sb_calendar_relays where workspace_id = $1 and clerk_id = $2`, [WORKSPACE_ID, clerkId])
}
