/**
 * Integration test for the sync API against the real database and real Clerk tokens.
 * Uses an isolated, throwaway workspace (never the team's) and cleans up after itself.
 *
 *   npx tsx --tsconfig tsconfig.node.json scripts/test-sync.ts
 */
import { readFileSync, existsSync } from 'node:fs'
import { createClerkClient } from '@clerk/backend'

for (const f of ['.env.local', '.env.development.local']) {
  if (!existsSync(f)) continue
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]!.replace(/^"|"$/g, '')
  }
}
const TEST_WS = `sbtest-${Date.now().toString(36)}`
process.env.WORKSPACE_ID = TEST_WS

const { GET: pull, POST: push } = await import('../api/sync.ts')
const { pool } = await import('../server/db.ts')

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! })
const user = await clerk.users.createUser({ emailAddress: [`sync-test-${Date.now()}@example.com`], skipPasswordRequirement: true, skipLegalChecks: true })
let failures = 0
const ok = (cond: unknown, label: string) => {
  console.log(`${cond ? '✓' : '✗'} ${label}`)
  if (!cond) failures++
}

const session = await clerk.sessions.createSession({ userId: user.id })
let cached = { jwt: '', at: 0 }
/** Session tokens live 60 s — mint a fresh one when it's getting old, like the browser does. */
async function token() {
  if (Date.now() - cached.at > 30_000) cached = { jwt: (await clerk.sessions.getToken(session.id)).jwt, at: Date.now() }
  return cached.jwt
}

try {
  const req = async (method: string, path: string, body?: unknown, auth: string | null | undefined = undefined) => {
    const a = auth === undefined ? await token() : auth
    return new Request(`http://localhost:5199${path}`, { method, headers: { 'content-type': 'application/json', ...(a ? { authorization: `Bearer ${a}` } : {}) }, body: body ? JSON.stringify(body) : undefined })
  }
  const doPush = async (ops: unknown[]) => {
    const r = await push(await req('POST', '/api/sync', { ops }))
    return { status: r.status, body: (await r.json()) as { seq: number; corrections: { c: string; id: string; d: Record<string, unknown>; del: boolean }[]; missing: { id: string }[]; error?: string } }
  }
  const pullAll = async (since = 0) => {
    const all: { c: string; id: string; d: Record<string, unknown> | null; del: boolean; v: number }[] = []
    let cursor = since
    let pages = 0
    for (;;) {
      const r = await pull(await req('GET', `/api/sync?since=${cursor}`))
      const b = (await r.json()) as { cursor: number; more: boolean; records: typeof all }
      all.push(...b.records)
      cursor = b.cursor
      pages++
      if (!b.more) break
    }
    return { all, cursor, pages }
  }

  // 1. auth
  ok((await pull(await req('GET', '/api/sync', undefined, null))).status === 401, 'rejects requests without a session')
  ok((await pull(await req('GET', '/api/sync', undefined, 'not-a-token'))).status === 401, 'rejects invalid tokens')

  // 2. seed a project + issue
  const project = { id: 'p1', key: 'TST', name: 'Test', issueCounter: 1 }
  const issue = { id: 'i1', key: 'TST-1', projectId: 'p1', summary: 'Original', priority: 'medium', labels: [] }
  let r = await doPush([
    { c: 'projects', id: 'p1', op: 'put', d: project },
    { c: 'issues', id: 'i1', op: 'put', d: issue },
  ])
  ok(r.status === 200 && r.body.seq === 2, `creates records and advances the version${r.status === 200 ? '' : ` (${r.status} ${JSON.stringify(r.body)})`}`)

  // 3. two people edit different fields of the same issue at the same time
  await Promise.all([
    doPush([{ c: 'issues', id: 'i1', op: 'patch', d: { summary: 'Renamed by A' } }]),
    doPush([{ c: 'issues', id: 'i1', op: 'patch', d: { priority: 'high' } }]),
  ])
  let state = await pullAll()
  const merged = state.all.filter((x) => x.id === 'i1').at(-1)!.d!
  ok(merged.summary === 'Renamed by A' && merged.priority === 'high' && merged.key === 'TST-1', 'concurrent edits to different fields both survive')

  // 4. two people create an issue with the same key at the same time
  const [a, b] = await Promise.all([
    doPush([{ c: 'issues', id: 'i2', op: 'put', d: { id: 'i2', key: 'TST-2', projectId: 'p1', summary: 'from A' } }, { c: 'projects', id: 'p1', op: 'patch', d: { issueCounter: 2 } }]),
    doPush([{ c: 'issues', id: 'i3', op: 'put', d: { id: 'i3', key: 'TST-2', projectId: 'p1', summary: 'from B' } }, { c: 'projects', id: 'p1', op: 'patch', d: { issueCounter: 2 } }]),
  ])
  state = await pullAll()
  const latest = new Map(state.all.map((x) => [x.id, x]))
  const keys = ['i2', 'i3'].map((id) => latest.get(id)!.d!.key)
  ok(new Set(keys).size === 2, `simultaneous creates get distinct keys (${keys.join(', ')})`)
  ok([a, b].some((x) => x.body.corrections.some((c) => c.c === 'issues')), 'the loser is told its new key')
  ok(Number(latest.get('p1')!.d!.issueCounter) >= 3, 'project counter moved past both keys')

  // 5. counters never go backwards
  await doPush([{ c: 'projects', id: 'p1', op: 'patch', d: { issueCounter: 1 } }])
  state = await pullAll()
  ok(Number(state.all.filter((x) => x.id === 'p1').at(-1)!.d!.issueCounter) >= 3, 'stale counter write does not roll back')

  // 6. soft delete keeps the data; a late edit doesn't resurrect it
  await doPush([{ c: 'issues', id: 'i2', op: 'delete' }])
  r = await doPush([{ c: 'issues', id: 'i2', op: 'patch', d: { summary: 'late edit' } }])
  ok(r.body.corrections.some((c) => c.id === 'i2' && c.del), 'edit after delete is reported back as deleted')
  const row = (await pool().query("select data, deleted from sb_records where workspace_id = $1 and id = 'i2'", [TEST_WS])).rows[0]
  ok(row.deleted === true && row.data?.summary === 'from A', 'deleted record keeps its data in the database (recoverable)')

  // 7. patch for a record the server never received
  r = await doPush([{ c: 'issues', id: 'ghost', op: 'patch', d: { summary: 'x' } }])
  ok(r.body.missing.some((m) => m.id === 'ghost'), 'unknown record patch is reported as missing (client resends in full)')

  // 8. oversized + invalid input
  r = await doPush([{ c: 'issues', id: 'big', op: 'put', d: { blob: 'x'.repeat(1_000_000) } }])
  ok(r.status === 413, 'oversized record is refused with 413 (client keeps it)')
  r = await doPush([{ c: 'secrets', id: 'x', op: 'put', d: {} }])
  ok(r.status === 400, 'unknown collection is refused')

  // 9. many parallel writers: every write lands exactly once, versions are unique
  const before = (await pullAll()).cursor
  await Promise.all(
    Array.from({ length: 10 }, (_, w) => doPush(Array.from({ length: 20 }, (_, k) => ({ c: 'comments', id: `w${w}-${k}`, op: 'put', d: { id: `w${w}-${k}`, body: `writer ${w} #${k}` } })))),
  )
  const after = await pullAll(before)
  const versions = after.all.map((x) => x.v)
  ok(after.all.length === 200 && new Set(versions).size === 200, `200 parallel writes all pulled once (${after.all.length})`)
  ok(versions.every((v, i) => i === 0 || v > versions[i - 1]!), 'pull order is strictly increasing')

  // 10. pagination over a large workspace
  for (let n = 0; n < 3; n++) await doPush(Array.from({ length: 400 }, (_, k) => ({ c: 'history', id: `h${n}-${k}`, op: 'put', d: { id: `h${n}-${k}`, text: 'x'.repeat(200) } })))
  const full = await pullAll(0)
  const live = new Set(full.all.map((x) => `${x.c}/${x.id}`))
  const dbCount = Number((await pool().query('select count(*) from sb_records where workspace_id = $1', [TEST_WS])).rows[0].count)
  ok(live.size === dbCount && full.pages > 1, `full pull returns every record (${live.size}/${dbCount}) across ${full.pages} pages`)
} catch (e) {
  failures++
  console.error('✗ test crashed:', e)
} finally {
  await pool().query('delete from sb_records where workspace_id = $1', [TEST_WS]).catch(() => {})
  await pool().query('delete from sb_workspaces where id = $1', [TEST_WS]).catch(() => {})
  await clerk.users.deleteUser(user.id).catch(() => {})
  await pool().end()
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed')
  process.exitCode = failures ? 1 : 0
}
