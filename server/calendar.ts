import { Composio } from '@composio/core'
import { HttpError, json, requireUser } from './auth.js'

/**
 * Google Calendar via Composio. Each workspace member links their own Google account;
 * Composio holds and refreshes the OAuth tokens, keyed by the member's Clerk user id,
 * so nobody can read or write anyone else's calendar through this endpoint.
 */

const TOOLKIT = 'googlecalendar'

function need(name: string) {
  const v = process.env[name]
  if (!v) throw new HttpError(503, `Google Calendar isn’t set up on the server yet (${name} is missing)`)
  return v
}

let _client: Composio | null = null
function composio() {
  _client ??= new Composio({
    apiKey: need('COMPOSIO_API_KEY'),
    // Tool calls are pinned to a toolkit version so a Composio release can't change behaviour under us.
    toolkitVersions: { [TOOLKIT]: need('COMPOSIO_GCAL_VERSION') },
  })
  return _client
}

type Account = { id: string; status: string; createdAt: string; data?: Record<string, unknown> }

async function accountOf(userId: string): Promise<Account | null> {
  const { items } = await composio().connectedAccounts.list({ userIds: [userId], toolkitSlugs: [TOOLKIT], orderBy: 'updated_at' })
  const list = items as Account[]
  return list.find((a) => a.status === 'ACTIVE') ?? list[0] ?? null
}

async function run<T>(userId: string, slug: string, args: Record<string, unknown>): Promise<T> {
  const res = (await composio().tools.execute(slug, { userId, arguments: args })) as { successful: boolean; data: unknown; error?: string | null }
  if (!res.successful) {
    console.error(`[calendar] ${slug} failed`, res.error)
    throw new HttpError(502, 'Google Calendar didn’t accept that request — try reconnecting it')
  }
  return res.data as T
}

/** Composio wraps Google's payload differently across tool versions; find the event list wherever it is. */
function itemsOf(data: unknown): GEvent[] {
  if (!data || typeof data !== 'object') return []
  const d = data as Record<string, unknown>
  for (const key of ['items', 'events']) if (Array.isArray(d[key])) return d[key] as GEvent[]
  for (const key of ['response_data', 'data']) if (d[key]) return itemsOf(d[key])
  return []
}

interface GEvent {
  id: string
  status?: string
  summary?: string
  description?: string
  location?: string
  htmlLink?: string
  hangoutLink?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
  attendees?: { email?: string; self?: boolean; responseStatus?: string }[]
  organizer?: { email?: string; self?: boolean }
}

const toClient = (e: GEvent) => {
  const me = e.attendees?.find((a) => a.self)
  return {
    id: e.id,
    title: e.summary || '(No title)',
    description: e.description ?? '',
    location: e.location ?? '',
    htmlLink: e.htmlLink ?? null,
    meetLink: e.hangoutLink ?? null,
    allDay: !e.start?.dateTime,
    start: e.start?.dateTime ?? e.start?.date ?? null,
    end: e.end?.dateTime ?? e.end?.date ?? null,
    attendees: e.attendees?.length ?? 0,
    response: me?.responseStatus ?? (e.organizer?.self ? 'accepted' : null),
  }
}

function validZone(tz: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

const isoParam =(v: string | null, name: string) => {
  if (!v || Number.isNaN(Date.parse(v))) throw new HttpError(400, `${name} must be an ISO date`)
  return new Date(v).toISOString()
}

/** /api/calendar — your Google Calendar connection and events (Clerk session required). */
export async function calendarApi(req: Request) {
  const { userId } = await requireUser(req)
  const url = new URL(req.url)

  if (req.method === 'GET') {
    const account = await accountOf(userId)
    const connected = account?.status === 'ACTIVE'
    if (url.searchParams.get('view') === 'status') return json({ connected, status: account?.status ?? null, connectedAt: connected ? account!.createdAt : null })
    if (!connected) throw new HttpError(409, 'Connect your Google Calendar first')
    const timeMin = isoParam(url.searchParams.get('from'), 'from')
    const timeMax = isoParam(url.searchParams.get('to'), 'to')
    if (Date.parse(timeMax) - Date.parse(timeMin) > 100 * 86_400_000) throw new HttpError(400, 'Ask for at most 100 days at a time')
    const data = await run<unknown>(userId, 'GOOGLECALENDAR_EVENTS_LIST', {
      calendarId: 'primary',
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 250,
    })
    const events = itemsOf(data)
      .filter((e) => e.status !== 'cancelled' && (e.start?.dateTime || e.start?.date))
      .map(toClient)
    return json({ events, syncedAt: new Date().toISOString() })
  }

  const body = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>

  if (req.method === 'POST' && body.action === 'connect') {
    // Back to this deployment's own calendar page — never a caller-supplied URL.
    const callbackUrl = `${url.origin}/calendar?connected=1`
    const request = await composio().connectedAccounts.link(userId, need('COMPOSIO_GCAL_AUTH_CONFIG_ID'), { callbackUrl, allowMultiple: true })
    if (!request.redirectUrl) throw new HttpError(502, 'Composio didn’t return a Google sign-in link')
    return json({ redirectUrl: request.redirectUrl })
  }

  if (req.method === 'POST' && body.action === 'create') {
    const e = (body.event ?? {}) as { title?: unknown; description?: unknown; start?: unknown; timezone?: unknown; durationMinutes?: unknown }
    const title = typeof e.title === 'string' ? e.title.trim().slice(0, 300) : ''
    if (!title) throw new HttpError(400, 'Give the event a title')
    // Wall-clock time in the member's own timezone, e.g. "2026-10-09T09:00:00" + "America/Chicago".
    if (typeof e.start !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(e.start)) throw new HttpError(400, 'start must look like 2026-10-09T09:00:00')
    const timezone = typeof e.timezone === 'string' && validZone(e.timezone) ? e.timezone : 'UTC'
    const account = await accountOf(userId)
    if (account?.status !== 'ACTIVE') throw new HttpError(409, 'Connect your Google Calendar first')
    const duration = typeof e.durationMinutes === 'number' && e.durationMinutes > 0 ? Math.min(Math.round(e.durationMinutes), 24 * 60) : 30
    const data = await run<unknown>(userId, 'GOOGLECALENDAR_CREATE_EVENT', {
      calendar_id: 'primary',
      summary: title,
      description: typeof e.description === 'string' ? e.description.slice(0, 8000) : '',
      start_datetime: e.start,
      timezone,
      event_duration_hour: Math.floor(duration / 60),
      event_duration_minutes: duration % 60,
      // A reminder about work, not a meeting: no Meet link, and it doesn't block the member's time.
      create_meeting_room: false,
      transparency: 'transparent',
    })
    return json({ ok: true, event: data }, 201)
  }

  if (req.method === 'DELETE') {
    const { items } = await composio().connectedAccounts.list({ userIds: [userId], toolkitSlugs: [TOOLKIT] })
    await Promise.all((items as Account[]).map((a) => composio().connectedAccounts.delete(a.id)))
    return json({ ok: true })
  }

  throw new HttpError(405, 'Method not allowed')
}
