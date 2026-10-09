import { HttpError, json, requireUser } from './auth.js'
import { composio, connectedMembers, isConnected, relayTeamCalendar, scheduleRelay, TOOLKIT, unrelayMember } from './calendarRelay.js'

/**
 * Google Calendar via Composio, write-only. Each member links their own Google account
 * (Composio holds the OAuth tokens, keyed by the member's Clerk user id) so the shared
 * team calendar can be copied into it. This endpoint never reads anyone's Google events.
 */

const lastBackfill = new Map<string, number>()

/** /api/calendar — your connection, the team's sync coverage, connect / disconnect. */
export async function calendarApi(req: Request) {
  const { userId } = await requireUser(req)
  const url = new URL(req.url)

  if (req.method === 'GET') {
    const view = url.searchParams.get('view') ?? 'status'
    if (view === 'status') {
      const connected = await isConnected(userId)
      // A newly connected member gets the upcoming team events; throttled per member.
      if (connected && Date.now() - (lastBackfill.get(userId) ?? 0) > 60_000) {
        lastBackfill.set(userId, Date.now())
        scheduleRelay()
      }
      return json({ connected })
    }
    if (view === 'members') return json({ connectedClerkIds: [...(await connectedMembers())] })
    throw new HttpError(400, 'Unknown view')
  }

  const body = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>

  if (req.method === 'POST' && body.action === 'connect') {
    const authConfigId = process.env.COMPOSIO_GCAL_AUTH_CONFIG_ID
    if (!authConfigId) throw new HttpError(503, 'Google Calendar isn’t set up on the server yet (COMPOSIO_GCAL_AUTH_CONFIG_ID is missing)')
    // Back to this deployment's own calendar page — never a caller-supplied URL.
    const callbackUrl = `${url.origin}/calendar?connected=1`
    const request = await composio().connectedAccounts.link(userId, authConfigId, { callbackUrl, allowMultiple: true })
    if (!request.redirectUrl) throw new HttpError(502, 'Composio didn’t return a Google sign-in link')
    return json({ redirectUrl: request.redirectUrl })
  }

  if (req.method === 'POST' && body.action === 'sync') return json(await relayTeamCalendar())

  if (req.method === 'DELETE') {
    // Take the team events off their calendar first, while we still can.
    await unrelayMember(userId).catch((e) => console.error('[calendar] unrelay failed', e))
    const { items } = await composio().connectedAccounts.list({ userIds: [userId], toolkitSlugs: [TOOLKIT] })
    await Promise.all((items as { id: string }[]).map((a) => composio().connectedAccounts.delete(a.id)))
    return json({ ok: true })
  }

  throw new HttpError(405, 'Method not allowed')
}
