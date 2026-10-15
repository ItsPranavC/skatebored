/**
 * Cloud sync for the workspace store.
 *
 *  - Every local change is diffed per record (not per workspace) and queued in an
 *    outbox that survives reloads. Edits are sent as field-level patches, so two people
 *    editing different fields of the same issue never overwrite each other.
 *  - The outbox flushes in small batches; failed requests retry with backoff and
 *    nothing is dropped. Records the server can't take are kept and surfaced.
 *  - Remote changes are pulled with a version cursor that is persisted *with* the cached
 *    data (same localStorage write), so a cache can never claim to be newer than it is.
 *  - First connection: an empty cloud is seeded from this browser; otherwise the cloud
 *    wins, records that only exist here are uploaded, and the old local copy is backed up.
 */
import { create } from 'zustand'
import { useStore, type State } from '@/store/store'
import { buildSeed } from '@/data/seed'
import { uid } from '@/lib/utils'

export const SYNCED = ['users', 'projects', 'sprints', 'issues', 'comments', 'history', 'worklogs', 'notifications', 'filters', 'dashboards', 'events', 'meetings', 'modules'] as const
export type Collection = (typeof SYNCED)[number]
type Rec = { id: string } & Record<string, unknown>

interface Op {
  c: Collection
  id: string
  op: 'put' | 'patch' | 'delete'
  d?: Record<string, unknown>
  /** bumps every time the queued op changes, so an in-flight copy can't erase a newer one */
  rev: number
}
interface WireRecord {
  c: Collection
  id: string
  d: Rec | null
  del: boolean
  v: number
}

// ───────────────────────────── status (for the UI) ─────────────────────────────

export type SyncPhase = 'connecting' | 'synced' | 'saving' | 'offline' | 'error'
interface SyncStatus {
  phase: SyncPhase
  pending: number
  lastSyncedAt: string | null
  error: string | null
  rejected: { c: string; id: string; reason: string }[]
}
export const useSyncStatus = create<SyncStatus>(() => ({ phase: 'connecting', pending: 0, lastSyncedAt: null, error: null, rejected: [] }))

// ───────────────────────────── module state ─────────────────────────────

const TAB = uid('tab')
const OUTBOX_KEY = (tab: string) => `skatebored-outbox:${tab}`
const HEARTBEAT_KEY = (tab: string) => `skatebored-tab:${tab}`
const MAX_BATCH_OPS = 300
const MAX_BATCH_BYTES = 2_000_000

let getToken: () => Promise<string | null> = async () => null
let started = false
let applyingRemote = false
let outbox = new Map<string, Op>()
let rev = 0
let flushTimer: ReturnType<typeof setTimeout> | null = null
let pollTimer: ReturnType<typeof setTimeout> | null = null
let flushing: Promise<void> | null = null
let pulling: Promise<void> | null = null
let backoff = 0
let channel: BroadcastChannel | null = null

const keyOf = (c: string, id: string) => `${c}/${id}`

let saveQueued = false
/** Persists the outbox once per burst of changes (bulk edits queue hundreds of ops at once). */
function saveOutbox() {
  if (saveQueued) return
  saveQueued = true
  queueMicrotask(() => {
    saveQueued = false
    try {
      if (outbox.size) localStorage.setItem(OUTBOX_KEY(TAB), JSON.stringify([...outbox.values()]))
      else localStorage.removeItem(OUTBOX_KEY(TAB))
    } catch {
      /* storage full/blocked: the in-memory outbox still flushes */
    }
    useSyncStatus.setState({ pending: outbox.size })
  })
}

/** Takes over outboxes left by tabs that closed before flushing. */
function adoptOrphanOutboxes() {
  try {
    const now = Date.now()
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k?.startsWith('skatebored-outbox:')) continue
      const tab = k.slice('skatebored-outbox:'.length)
      if (tab === TAB) continue
      const beat = Number(localStorage.getItem(HEARTBEAT_KEY(tab)) ?? 0)
      if (now - beat < 15_000) continue // that tab is alive and will flush its own
      const ops = JSON.parse(localStorage.getItem(k) ?? '[]') as Op[]
      for (const o of ops) if (!outbox.has(keyOf(o.c, o.id))) outbox.set(keyOf(o.c, o.id), { ...o, rev: ++rev })
      localStorage.removeItem(k)
      localStorage.removeItem(HEARTBEAT_KEY(tab))
      i = -1 // indices shifted
    }
  } catch {
    /* ignore */
  }
  saveOutbox()
}

function heartbeat() {
  try {
    localStorage.setItem(HEARTBEAT_KEY(TAB), String(Date.now()))
  } catch {
    /* ignore */
  }
}

// ───────────────────────────── outbox ─────────────────────────────

function enqueue(c: Collection, id: string, op: Op['op'], d?: Record<string, unknown>) {
  const k = keyOf(c, id)
  const prev = outbox.get(k)
  let next: Op
  if (op === 'delete') next = { c, id, op: 'delete', rev: ++rev }
  // Created (or re-created) and not yet confirmed → always send the full current record.
  else if (op === 'put' || prev?.op === 'put' || prev?.op === 'delete') next = { c, id, op: 'put', d: currentRecord(c, id) ?? d, rev: ++rev }
  // Edits accumulate field by field until they're sent.
  else next = { c, id, op: 'patch', d: { ...prev?.d, ...d }, rev: ++rev }
  outbox.set(k, next)
  saveOutbox()
  scheduleFlush()
}

function currentRecord(c: Collection, id: string): Rec | undefined {
  return (useStore.getState()[c] as unknown as Rec[]).find((r) => r.id === id)
}

/** Diffs two store snapshots and queues per-record operations. */
function capture(next: State, prev: State) {
  if (applyingRemote) return
  for (const c of SYNCED) {
    const a = prev[c] as unknown as Rec[]
    const b = next[c] as unknown as Rec[]
    if (a === b) continue
    const before = new Map(a.map((r) => [r.id, r]))
    for (const r of b) {
      const old = before.get(r.id)
      before.delete(r.id)
      if (!old) enqueue(c, r.id, 'put', r)
      else if (old !== r) {
        const changed: Record<string, unknown> = {}
        for (const f of new Set([...Object.keys(old), ...Object.keys(r)])) {
          if (old[f] !== r[f] && JSON.stringify(old[f]) !== JSON.stringify(r[f])) changed[f] = r[f] === undefined ? null : r[f]
        }
        if (Object.keys(changed).length) enqueue(c, r.id, 'patch', changed)
      }
    }
    for (const id of before.keys()) enqueue(c, id, 'delete')
  }
}

// ───────────────────────────── network ─────────────────────────────

class HttpErr extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function authedFetch(input: string, init: RequestInit = {}) {
  const token = await getToken()
  if (!token) throw new HttpErr(401, 'Not signed in')
  const res = await fetch(input, { ...init, headers: { ...(init.headers ?? {}), authorization: `Bearer ${token}` } })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new HttpErr(res.status, body.error ?? `HTTP ${res.status}`)
  }
  return res
}

function scheduleFlush(delay = 350) {
  if (!started) return
  if (flushTimer) clearTimeout(flushTimer)
  flushTimer = setTimeout(() => void flush(), delay)
}

function schedulePoll() {
  if (pollTimer) clearTimeout(pollTimer)
  if (!started) return
  pollTimer = setTimeout(() => void syncNow(), document.visibilityState === 'visible' ? 5_000 : 30_000)
}

/** Pushes the outbox in batches. Ops are only removed once the server confirmed them. */
export function flush(): Promise<void> {
  if (flushing) return flushing
  flushing = (async () => {
    while (outbox.size) {
      const batch: Op[] = []
      let bytes = 0
      for (const o of outbox.values()) {
        const size = JSON.stringify(o.d ?? null).length
        if (batch.length && (batch.length >= MAX_BATCH_OPS || bytes + size > MAX_BATCH_BYTES)) break
        batch.push(o)
        bytes += size
      }
      useSyncStatus.setState({ phase: 'saving' })
      try {
        const res = await authedFetch('/api/sync', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ops: batch.map(({ c, id, op, d }) => ({ c, id, op, d })) }),
        })
        const out = (await res.json()) as { corrections: WireRecord[]; missing: { c: Collection; id: string }[] }
        for (const o of batch) if (outbox.get(keyOf(o.c, o.id))?.rev === o.rev) outbox.delete(keyOf(o.c, o.id))
        // Server never saw these records — resend them in full.
        for (const m of out.missing) if (currentRecord(m.c, m.id)) enqueue(m.c, m.id, 'put')
        if (out.corrections.length) applyRemote(out.corrections, false)
        saveOutbox()
        backoff = 0
        channel?.postMessage('changed')
      } catch (e) {
        const err = e as HttpErr
        if (err.status === 413 || err.status === 400) {
          // Bisect so one bad record can't block everything else.
          if (batch.length > 1) {
            await pushIndividually(batch)
            continue
          }
          const o = batch[0]!
          outbox.delete(keyOf(o.c, o.id))
          useSyncStatus.setState((s) => ({ rejected: [...s.rejected, { c: o.c, id: o.id, reason: err.message }] }))
          saveOutbox()
          keepRejected(o, err.message)
          continue
        }
        backoff = Math.min(30_000, backoff ? backoff * 2 : 2_000)
        useSyncStatus.setState({ phase: err.status === 0 || !navigator.onLine || err instanceof TypeError ? 'offline' : 'error', error: err.message })
        setTimeout(() => scheduleFlush(0), backoff)
        return
      }
    }
    useSyncStatus.setState({ phase: 'synced', error: null, lastSyncedAt: new Date().toISOString() })
  })().finally(() => {
    flushing = null
  })
  return flushing
}

async function pushIndividually(batch: Op[]) {
  for (const o of batch) {
    try {
      await authedFetch('/api/sync', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ops: [{ c: o.c, id: o.id, op: o.op, d: o.d }] }) })
      if (outbox.get(keyOf(o.c, o.id))?.rev === o.rev) outbox.delete(keyOf(o.c, o.id))
    } catch (e) {
      const err = e as HttpErr
      if (err.status !== 413 && err.status !== 400) throw e
      outbox.delete(keyOf(o.c, o.id))
      useSyncStatus.setState((s) => ({ rejected: [...s.rejected, { c: o.c, id: o.id, reason: err.message }] }))
      keepRejected(o, err.message)
    }
  }
  saveOutbox()
}

/** Rejected changes are never thrown away — they're parked locally for download. */
function keepRejected(o: Op, reason: string) {
  try {
    const key = 'skatebored-rejected'
    const prev = JSON.parse(localStorage.getItem(key) ?? '[]') as unknown[]
    localStorage.setItem(key, JSON.stringify([...prev, { ...o, reason, at: new Date().toISOString() }]))
  } catch {
    /* ignore */
  }
}

/** Applies server records to the store without re-queuing them. Pending local edits win. */
function applyRemote(records: WireRecord[], respectPending = true, cursor?: number) {
  if (!records.length && cursor === undefined) return
  applyingRemote = true
  try {
    useStore.setState((s) => {
      const patch: Partial<State> = {}
      const grouped = new Map<Collection, WireRecord[]>()
      for (const r of records) {
        if (!SYNCED.includes(r.c)) continue
        if (respectPending && outbox.has(keyOf(r.c, r.id))) continue
        grouped.set(r.c, [...(grouped.get(r.c) ?? []), r])
      }
      for (const [c, recs] of grouped) {
        const list = [...(s[c] as unknown as Rec[])]
        const index = new Map(list.map((r, i) => [r.id, i]))
        const drop = new Set<string>()
        for (const r of recs) {
          const i = index.get(r.id)
          if (r.del || !r.d) {
            if (i !== undefined) drop.add(r.id)
          } else if (i !== undefined) list[i] = { ...r.d, id: r.id }
          else {
            index.set(r.id, list.length)
            list.push({ ...r.d, id: r.id })
          }
        }
        ;(patch as Record<string, unknown>)[c] = drop.size ? list.filter((r) => !drop.has(r.id)) : list
      }
      if (cursor !== undefined) patch.syncCursor = cursor
      return patch
    })
  } finally {
    applyingRemote = false
  }
}

async function pullAll(since: number) {
  const all: WireRecord[] = []
  let cursor = since
  let seq = 0
  for (;;) {
    const res = await authedFetch(`/api/sync?since=${cursor}`)
    const page = (await res.json()) as { seq: number; cursor: number; more: boolean; records: WireRecord[] }
    all.push(...page.records)
    cursor = page.cursor
    seq = page.seq
    if (!page.more) break
  }
  return { records: all, cursor, seq }
}

/** Pull remote changes (after flushing local ones). */
export function syncNow(): Promise<void> {
  if (pulling) return pulling
  pulling = (async () => {
    try {
      await flush()
      const since = useStore.getState().syncCursor ?? 0
      const { records, cursor } = await pullAll(since)
      applyRemote(records, true, cursor)
      if (!outbox.size) useSyncStatus.setState({ phase: 'synced', error: null, lastSyncedAt: new Date().toISOString() })
    } catch (e) {
      const err = e as HttpErr
      useSyncStatus.setState({ phase: err instanceof TypeError || !navigator.onLine ? 'offline' : 'error', error: err.message })
    } finally {
      pulling = null
      schedulePoll()
    }
  })()
  return pulling
}

// ───────────────────────────── bootstrap ─────────────────────────────

const SYNC_WS_KEY = 'skatebored-sync-workspace'

function backupLocal(reason: string) {
  const s = useStore.getState()
  const snapshot = Object.fromEntries(SYNCED.map((c) => [c, s[c]]))
  const payload = JSON.stringify({ reason, at: new Date().toISOString(), data: snapshot })
  try {
    localStorage.setItem(`skatebored-backup:${Date.now()}`, payload)
  } catch {
    // Too big for storage — keep it in memory for a manual download this session.
    ;(window as unknown as { __skateboredBackup?: string }).__skateboredBackup = payload
  }
}

/**
 * First contact with the cloud for this browser:
 *   empty cloud  → upload everything here (migrates the current local workspace)
 *   cloud exists → adopt it, upload records that exist only here, back up the old local copy
 */
async function bootstrap() {
  const s = useStore.getState()
  const known = s.syncCursor != null && localStorage.getItem(SYNC_WS_KEY) === 'skatebored'
  if (known) {
    // Returning browser: show the cached workspace immediately and catch up in the background.
    void syncNow()
    return
  }
  const { records, cursor, seq } = await pullAll(0)
  if (seq === 0 && records.length === 0) {
    // Seed the cloud from this browser.
    applyingRemote = true
    useStore.setState({ syncCursor: 0 })
    applyingRemote = false
    for (const c of SYNCED) for (const r of useStore.getState()[c] as unknown as Rec[]) enqueue(c, r.id, 'put', r)
    await flush()
  } else {
    const seedIds = new Map(SYNCED.map((c) => [c, new Set((buildSeed()[c] as unknown as Rec[]).map((r) => r.id))]))
    const remote = new Set(records.map((r) => keyOf(r.c, r.id)))
    const localOnly: [Collection, Rec][] = []
    for (const c of SYNCED)
      for (const r of s[c] as unknown as Rec[]) if (!remote.has(keyOf(c, r.id)) && !seedIds.get(c)!.has(r.id)) localOnly.push([c, r])
    backupLocal('Replaced by the cloud workspace on first sync')
    // Replace cached collections with the cloud's.
    applyingRemote = true
    useStore.setState(Object.fromEntries(SYNCED.map((c) => [c, []])) as Partial<State>)
    applyingRemote = false
    applyRemote(records, false, cursor)
    // Work created here that the cloud has never seen is uploaded, not dropped.
    if (localOnly.length) {
      applyingRemote = true
      useStore.setState((st) => Object.fromEntries(SYNCED.map((c) => [c, [...(st[c] as unknown as Rec[]), ...localOnly.filter(([lc]) => lc === c).map(([, r]) => r)]])) as Partial<State>)
      applyingRemote = false
      for (const [c, r] of localOnly) enqueue(c, r.id, 'put', r)
      await flush()
    }
  }
  localStorage.setItem(SYNC_WS_KEY, 'skatebored')
  await syncNow()
}

// ───────────────────────────── lifecycle ─────────────────────────────

let unsubscribe: (() => void) | null = null
let beatTimer: ReturnType<typeof setInterval> | null = null

export async function startSync(tokenGetter: () => Promise<string | null>) {
  getToken = tokenGetter
  if (started) return
  started = true
  heartbeat()
  beatTimer = setInterval(heartbeat, 5_000)
  try {
    outbox = new Map((JSON.parse(localStorage.getItem(OUTBOX_KEY(TAB)) ?? '[]') as Op[]).map((o) => [keyOf(o.c, o.id), o]))
  } catch {
    outbox = new Map()
  }
  adoptOrphanOutboxes()
  unsubscribe = useStore.subscribe(capture)
  channel = 'BroadcastChannel' in window ? new BroadcastChannel('skatebored-sync') : null
  if (channel) channel.onmessage = () => void syncNow()
  window.addEventListener('focus', onFocus)
  window.addEventListener('online', onFocus)
  window.addEventListener('beforeunload', onUnload)
  await bootstrap()
}

export function stopSync() {
  started = false
  unsubscribe?.()
  unsubscribe = null
  channel?.close()
  channel = null
  if (pollTimer) clearTimeout(pollTimer)
  if (flushTimer) clearTimeout(flushTimer)
  if (beatTimer) clearInterval(beatTimer)
  window.removeEventListener('focus', onFocus)
  window.removeEventListener('online', onFocus)
  window.removeEventListener('beforeunload', onUnload)
}

/** Sign-out on a shared machine: flush, then drop the cached company data. */
export async function signOutCleanup() {
  await flush().catch(() => {})
  if (outbox.size) return false
  stopSync()
  try {
    localStorage.removeItem('skatebored-scrum')
    localStorage.removeItem(SYNC_WS_KEY)
    localStorage.removeItem(OUTBOX_KEY(TAB))
    localStorage.removeItem(HEARTBEAT_KEY(TAB))
  } catch {
    /* ignore */
  }
  return true
}

const onFocus = () => void syncNow()
function onUnload(e: BeforeUnloadEvent) {
  if (outbox.size) {
    e.preventDefault()
    e.returnValue = ''
  }
}

/** For tests and the status popover. */
export const _internals = { pending: () => [...outbox.values()] }
