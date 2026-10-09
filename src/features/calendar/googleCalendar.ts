import { create } from 'zustand'
import { authedFetch } from '@/sync/engine'

/** Your Google Calendar, connected through Composio (server: server/calendar.ts). */
export interface GCalEvent {
  id: string
  title: string
  description: string
  location: string
  htmlLink: string | null
  meetLink: string | null
  allDay: boolean
  start: string
  end: string | null
  attendees: number
  response: 'accepted' | 'declined' | 'tentative' | 'needsAction' | null
}

export type ConnStatus = 'unknown' | 'connected' | 'disconnected' | 'unavailable'

const call = async (method: string, query = '', body?: unknown) =>
  (await authedFetch(`/api/calendar${query}`, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })).json()

interface CalState {
  status: ConnStatus
  connectedAt: string | null
  events: GCalEvent[]
  range: { from: string; to: string } | null
  syncedAt: string | null
  syncing: boolean
  error: string | null
  checkStatus: () => Promise<ConnStatus>
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  sync: (from?: Date, to?: Date) => Promise<void>
  /** `start` is local wall-clock time, e.g. 2026-10-09T09:00:00; sent with this browser's timezone. */
  addEvent: (e: { title: string; description?: string; start: string; durationMinutes?: number }) => Promise<void>
}

export const useGoogleCalendar = create<CalState>((set, get) => ({
  status: 'unknown',
  connectedAt: null,
  events: [],
  range: null,
  syncedAt: null,
  syncing: false,
  error: null,
  checkStatus: async () => {
    try {
      const r = (await call('GET', '?view=status')) as { connected: boolean; connectedAt: string | null }
      const status: ConnStatus = r.connected ? 'connected' : 'disconnected'
      set({ status, connectedAt: r.connectedAt, error: null })
      return status
    } catch (e) {
      // 503 = the server has no Composio keys yet; don't nag people about something they can't fix.
      const status: ConnStatus = (e as { status?: number }).status === 503 ? 'unavailable' : get().status
      set({ status, error: (e as Error).message })
      return status
    }
  },
  connect: async () => {
    const { redirectUrl } = (await call('POST', '', { action: 'connect' })) as { redirectUrl: string }
    window.location.assign(redirectUrl)
  },
  disconnect: async () => {
    await call('DELETE')
    set({ status: 'disconnected', connectedAt: null, events: [], syncedAt: null })
  },
  sync: async (from, to) => {
    const range = from && to ? { from: from.toISOString(), to: to.toISOString() } : get().range
    if (!range || get().status !== 'connected') return
    set({ syncing: true, range })
    try {
      const r = (await call('GET', `?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`)) as { events: GCalEvent[]; syncedAt: string }
      // Ignore a slow response for a range the user has already navigated away from.
      if (get().range?.from === range.from) set({ events: r.events, syncedAt: r.syncedAt, error: null })
    } catch (e) {
      if ((e as { status?: number }).status === 409) set({ status: 'disconnected' })
      set({ error: (e as Error).message })
    } finally {
      set({ syncing: false })
    }
  },
  addEvent: async (event) => {
    await call('POST', '', { action: 'create', event: { ...event, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } })
    await get().sync()
  },
}))

const DISMISS_KEY = (userId: string) => `sb:gcal-prompt-dismissed:${userId}`
export function promptDismissed(userId: string) {
  try {
    return localStorage.getItem(DISMISS_KEY(userId)) === '1'
  } catch {
    return false
  }
}
export function dismissPrompt(userId: string) {
  try {
    localStorage.setItem(DISMISS_KEY(userId), '1')
  } catch {
    /* private mode — the prompt simply shows again next session */
  }
}
