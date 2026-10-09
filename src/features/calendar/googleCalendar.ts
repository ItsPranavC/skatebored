import { create } from 'zustand'
import { authedFetch } from '@/sync/engine'

/**
 * Your Google Calendar connection (server: server/calendar.ts). It's write-only: the
 * shared team calendar is copied into it, and nothing is ever read back out of it.
 */

export type ConnStatus = 'unknown' | 'connected' | 'disconnected' | 'unavailable'

const call = async (method: string, query = '', body?: unknown) =>
  (await authedFetch(`/api/calendar${query}`, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })).json()

interface CalState {
  status: ConnStatus
  /** Clerk ids of members whose Google Calendar receives the team calendar. */
  connectedClerkIds: string[] | null
  error: string | null
  checkStatus: () => Promise<ConnStatus>
  loadMembers: () => Promise<void>
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  /** Push the team calendar out to everyone's Google Calendar now. */
  syncNow: () => Promise<{ created: number; updated: number; removed: number; failed: number }>
}

export const useGoogleCalendar = create<CalState>((set, get) => ({
  status: 'unknown',
  connectedClerkIds: null,
  error: null,
  checkStatus: async () => {
    try {
      const r = (await call('GET', '?view=status')) as { connected: boolean }
      const status: ConnStatus = r.connected ? 'connected' : 'disconnected'
      set({ status, error: null })
      return status
    } catch (e) {
      // 503 = the server has no Composio keys yet; don't nag people about something they can't fix.
      const status: ConnStatus = (e as { status?: number }).status === 503 ? 'unavailable' : get().status
      set({ status, error: (e as Error).message })
      return status
    }
  },
  loadMembers: async () => {
    try {
      const r = (await call('GET', '?view=members')) as { connectedClerkIds: string[] }
      set({ connectedClerkIds: r.connectedClerkIds })
    } catch {
      /* coverage is informational only */
    }
  },
  connect: async () => {
    const { redirectUrl } = (await call('POST', '', { action: 'connect' })) as { redirectUrl: string }
    window.location.assign(redirectUrl)
  },
  disconnect: async () => {
    await call('DELETE')
    set({ status: 'disconnected' })
    void get().loadMembers()
  },
  syncNow: async () => call('POST', '', { action: 'sync' }),
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
