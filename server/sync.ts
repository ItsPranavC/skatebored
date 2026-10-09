import { HttpError, json, requireUser } from './auth.js'
import { ensureSchema, pool, WORKSPACE_ID } from './db.js'
import { scheduleRelay } from './calendarRelay.js'

/** Collections shared by the whole team. Per-person UI state (theme, recents…) never leaves the browser. */
export const COLLECTIONS = ['users', 'projects', 'sprints', 'issues', 'comments', 'history', 'worklogs', 'notifications', 'filters', 'dashboards', 'events'] as const
const COLLECTION_SET = new Set<string>(COLLECTIONS)

/** Per-record ceiling. Attachments live in Blob storage, so real records are a few KB. */
export const MAX_RECORD_BYTES = 900_000
const MAX_OPS = 400
const PULL_ROWS = 500
/** Stay well under Vercel's 4.5 MB response limit. */
const PULL_BYTES = 2_500_000

export interface Op {
  c: string
  id: string
  op: 'put' | 'patch' | 'delete'
  /** Full record for put; changed fields for patch. */
  d?: Record<string, unknown>
}

export interface WireRecord {
  c: string
  id: string
  d: Record<string, unknown> | null
  del: boolean
  v: number
}

type Row = { collection: string; id: string; data: Record<string, unknown> | null; deleted: boolean; version: string | number }
const toWire = (r: Row): WireRecord => ({ c: r.collection, id: r.id, d: r.data, del: r.deleted, v: Number(r.version) })

// ───────────────────────────── pull ─────────────────────────────

export async function pull(req: Request) {
  await requireUser(req)
  await ensureSchema()
  const since = Math.max(0, Number(new URL(req.url).searchParams.get('since') ?? 0) || 0)
  const { rows } = await pool().query<Row>(
    'select collection, id, data, deleted, version from sb_records where workspace_id = $1 and version > $2 order by version limit $3',
    [WORKSPACE_ID, since, PULL_ROWS],
  )
  const ws = (await pool().query<{ seq: string }>('select seq from sb_workspaces where id = $1', [WORKSPACE_ID])).rows[0]
  const out: WireRecord[] = []
  let bytes = 0
  for (const r of rows) {
    const size = JSON.stringify(r.data ?? null).length
    if (out.length && bytes + size > PULL_BYTES) break
    out.push(toWire(r))
    bytes += size
  }
  const more = out.length < rows.length || rows.length === PULL_ROWS
  return json({ seq: Number(ws?.seq ?? 0), cursor: out.length ? out[out.length - 1]!.v : since, more, records: out })
}

// ───────────────────────────── push ─────────────────────────────

export function validate(body: unknown): Op[] {
  const ops = (body as { ops?: unknown })?.ops
  if (!Array.isArray(ops)) throw new HttpError(400, 'Expected { ops: [] }')
  if (ops.length > MAX_OPS) throw new HttpError(413, `Send at most ${MAX_OPS} changes per request`)
  for (const o of ops as Op[]) {
    if (!o || !COLLECTION_SET.has(o.c)) throw new HttpError(400, `Unknown collection "${o?.c}"`)
    if (typeof o.id !== 'string' || !o.id || o.id.length > 128) throw new HttpError(400, 'Invalid record id')
    if (!['put', 'patch', 'delete'].includes(o.op)) throw new HttpError(400, `Invalid op "${o.op}"`)
    if (o.op !== 'delete' && (typeof o.d !== 'object' || o.d === null || Array.isArray(o.d))) throw new HttpError(400, `Missing data for ${o.c}/${o.id}`)
    if (o.d && JSON.stringify(o.d).length > MAX_RECORD_BYTES) throw new HttpError(413, `${o.c}/${o.id} is too large to save (over ${Math.round(MAX_RECORD_BYTES / 1000)} KB)`)
  }
  return ops as Op[]
}

/** POST /api/sync — authenticated wrapper around applyOps. */
export async function push(req: Request) {
  const { userId } = await requireUser(req)
  const ops = validate(await req.json().catch(() => null))
  return json(await applyOps(ops, userId))
}

/** Applies a batch atomically. Writers are serialised by locking the workspace row. */
export async function applyOps(ops: Op[], userId: string) {
  await ensureSchema()
  if (!ops.length) return { seq: null as number | null, corrections: [] as WireRecord[], missing: [] as { c: string; id: string }[] }

  const db = await pool().connect()
  const corrections: WireRecord[] = []
  const missing: { c: string; id: string }[] = []
  try {
    await db.query('begin')
    const { rows } = await db.query<{ seq: string }>('select seq from sb_workspaces where id = $1 for update', [WORKSPACE_ID])
    let v = Number(rows[0]!.seq)

    type Cur = { c: string; id: string; data: Record<string, unknown> | null; deleted: boolean }
    const k = (c: string, id: string) => `${c}\u0000${id}`
    const state = new Map<string, Cur>()
    /** Records to write, in the order they were last touched (that order becomes their version order). */
    const dirty = new Set<string>()
    const corrected = new Set<string>()
    const touch = (cur: Cur) => {
      state.set(k(cur.c, cur.id), cur)
      dirty.delete(k(cur.c, cur.id))
      dirty.add(k(cur.c, cur.id))
    }

    // 1 · one read for every record this batch touches (+ projects of new issues)
    const wanted = new Map<string, { c: string; id: string }>()
    for (const o of ops) {
      wanted.set(k(o.c, o.id), { c: o.c, id: o.id })
      if (o.c === 'issues' && typeof o.d?.projectId === 'string') wanted.set(k('projects', o.d.projectId), { c: 'projects', id: o.d.projectId })
    }
    const want = [...wanted.values()]
    const existingRows = await db.query<{ collection: string; id: string; data: Record<string, unknown> | null; deleted: boolean }>(
      `select collection, id, data, deleted from sb_records
       where workspace_id = $1 and (collection, id) in (select * from unnest($2::text[], $3::text[]))`,
      [WORKSPACE_ID, want.map((w) => w.c), want.map((w) => w.id)],
    )
    for (const r of existingRows.rows) state.set(k(r.collection, r.id), { c: r.collection, id: r.id, data: r.data, deleted: r.deleted })

    // 2 · who currently owns each issue key mentioned in this batch
    const keyOwner = new Map<string, string>()
    const batchKeys = ops.filter((o) => o.c === 'issues' && typeof o.d?.key === 'string').map((o) => o.d!.key as string)
    if (batchKeys.length) {
      const owners = await db.query<{ id: string; key: string }>(
        `select id, data->>'key' as key from sb_records
         where workspace_id = $1 and collection = 'issues' and not deleted and data->>'key' = any($2::text[])`,
        [WORKSPACE_ID, batchKeys],
      )
      for (const r of owners.rows) keyOwner.set(r.key, r.id)
    }
    const maxByProject = new Map<string, number>()
    const numberOf = (key: string) => Number(key.match(/-(\d+)$/)?.[1] ?? 0)
    const nextNumber = async (projectId: string) => {
      if (!maxByProject.has(projectId)) {
        const m = await db.query<{ n: number | null }>(
          `select max((substring(data->>'key' from '-([0-9]+)$'))::int) as n from sb_records
           where workspace_id = $1 and collection = 'issues' and data->>'projectId' = $2`,
          [WORKSPACE_ID, projectId],
        )
        maxByProject.set(projectId, Number(m.rows[0]?.n ?? 0))
      }
      const project = state.get(k('projects', projectId))
      const n = Math.max(maxByProject.get(projectId)!, Number(project?.data?.issueCounter ?? 0)) + 1
      maxByProject.set(projectId, n)
      return n
    }

    /** Keeps issue keys unique even when two people create issues at the same moment. */
    const ensureUniqueKey = async (id: string, data: Record<string, unknown>) => {
      const key = data.key
      const projectId = data.projectId
      if (typeof key !== 'string' || typeof projectId !== 'string') return false
      const owner = keyOwner.get(key)
      if (!owner || owner === id) {
        keyOwner.set(key, id)
        if (maxByProject.has(projectId)) maxByProject.set(projectId, Math.max(maxByProject.get(projectId)!, numberOf(key)))
        return false
      }
      const next = await nextNumber(projectId)
      data.key = `${key.replace(/-\d+$/, '')}-${next}`
      keyOwner.set(data.key as string, id)
      const project = state.get(k('projects', projectId))
      if (project?.data) {
        touch({ ...project, data: { ...project.data, issueCounter: Math.max(next, Number(project.data.issueCounter ?? 0)) } })
        corrected.add(k('projects', projectId))
      }
      return true
    }

    // 3 · apply every op in memory
    for (const o of ops) {
      const existing = state.get(k(o.c, o.id))
      if (o.op === 'delete') {
        // Soft delete: keep the last data so it can be restored.
        touch({ c: o.c, id: o.id, data: existing?.data ?? o.d ?? null, deleted: true })
        continue
      }
      let data: Record<string, unknown>
      if (o.op === 'patch') {
        if (!existing) {
          missing.push({ c: o.c, id: o.id })
          continue
        }
        if (existing.deleted) {
          // Someone deleted it meanwhile — tell the client instead of resurrecting it.
          corrections.push({ c: o.c, id: o.id, d: existing.data, del: true, v })
          continue
        }
        data = { ...(existing.data ?? {}), ...o.d }
      } else {
        data = { ...o.d }
      }
      let changed = false
      // Counters only move forward, whoever writes last.
      if (o.c === 'projects' && existing?.data && typeof data.issueCounter === 'number') {
        const prev = Number(existing.data.issueCounter ?? 0)
        if (prev > data.issueCounter) {
          data.issueCounter = prev
          changed = true
        }
      }
      if (o.c === 'issues' && (o.op === 'put' || 'key' in (o.d ?? {}))) changed = (await ensureUniqueKey(o.id, data)) || changed
      touch({ c: o.c, id: o.id, data, deleted: false })
      // Only echo records the server changed; everything else reaches other clients via pull.
      if (changed) corrected.add(k(o.c, o.id))
    }

    // 4 · one write for the whole batch
    const writes = [...dirty].map((key) => ({ ...state.get(key)!, v: ++v }))
    if (writes.length)
      await db.query(
        `insert into sb_records (workspace_id, collection, id, data, deleted, version, updated_at, updated_by)
         select $1, t.c, t.i, t.d::jsonb, t.del, t.ver, now(), $7
         from unnest($2::text[], $3::text[], $4::text[], $5::boolean[], $6::bigint[]) as t(c, i, d, del, ver)
         on conflict (workspace_id, collection, id)
         do update set data = excluded.data, deleted = excluded.deleted, version = excluded.version, updated_at = now(), updated_by = excluded.updated_by`,
        [
          WORKSPACE_ID,
          writes.map((w) => w.c),
          writes.map((w) => w.id),
          writes.map((w) => (w.data === null ? null : JSON.stringify(w.data))),
          writes.map((w) => w.deleted),
          writes.map((w) => w.v),
          userId,
        ],
      )
    for (const w of writes) if (corrected.has(k(w.c, w.id))) corrections.push({ c: w.c, id: w.id, d: w.data, del: w.deleted, v: w.v })

    await db.query('update sb_workspaces set seq = $2 where id = $1', [WORKSPACE_ID, v])
    await db.query('commit')
    // Team calendar changed (events, sprint dates, releases): copy it to members' Google Calendars once the response is out.
    if (ops.some((o) => o.c === 'events' || o.c === 'sprints' || (o.c === 'projects' && (o.op !== 'patch' || 'versions' in (o.d ?? {}))))) scheduleRelay()
    return { seq: v as number | null, corrections, missing }
  } catch (e) {
    await db.query('rollback').catch(() => {})
    throw e
  } finally {
    db.release()
  }
}

export async function status(req: Request) {
  await requireUser(req)
  await ensureSchema()
  const ws = (await pool().query<{ seq: string }>('select seq from sb_workspaces where id = $1', [WORKSPACE_ID])).rows[0]
  const { rows: counts } = await pool().query(
    `select collection, count(*) filter (where not deleted)::int as live, count(*) filter (where deleted)::int as deleted
     from sb_records where workspace_id = $1 group by collection order by collection`,
    [WORKSPACE_ID],
  )
  return json({ workspace: WORKSPACE_ID, seq: Number(ws?.seq ?? 0), counts })
}

