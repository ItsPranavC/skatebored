import { createHash, randomBytes } from 'node:crypto'
import { waitUntil } from '@vercel/functions'
import { HttpError, json, requireUser } from './auth.js'
import { ensureSchema, pool, WORKSPACE_ID } from './db.js'

/**
 * Personal agent tokens. Each token belongs to the workspace member who created it
 * (the agent's owner) and carries one "current task" slot the owner can fill from
 * the app, so an agent always knows whose behalf it acts on and what to work on.
 * Only a SHA-256 of the token is stored; the token itself is shown once.
 */

const TOKEN_PREFIX = 'sbk_'
const hash = (token: string) => createHash('sha256').update(token).digest('hex')

export interface AgentRow {
  id: string
  owner_user_id: string
  owner_clerk_id: string
  name: string
  token_hint: string
  current_issue_id: string | null
  created_at: string
  last_used_at: string | null
}

const toClient = (a: AgentRow) => ({
  id: a.id,
  name: a.name,
  tokenHint: a.token_hint,
  currentIssueId: a.current_issue_id,
  createdAt: a.created_at,
  lastUsedAt: a.last_used_at,
})

/** The caller's workspace member record (created by the app on first sign-in). */
async function memberIdOf(clerkId: string) {
  const { rows } = await pool().query<{ id: string }>(
    `select id from sb_records where workspace_id = $1 and collection = 'users' and not deleted and data->>'clerkId' = $2 limit 1`,
    [WORKSPACE_ID, clerkId],
  )
  if (!rows[0]) throw new HttpError(409, 'Open the workspace once so your member profile exists, then try again')
  return rows[0].id
}

async function issueExists(issueId: string) {
  const { rowCount } = await pool().query(`select 1 from sb_records where workspace_id = $1 and collection = 'issues' and id = $2 and not deleted`, [WORKSPACE_ID, issueId])
  return !!rowCount
}

const COLS = 'id, owner_user_id, owner_clerk_id, name, token_hint, current_issue_id, created_at, last_used_at'

/** /api/agents — manage your own agents (Clerk session required). */
export async function agentsApi(req: Request) {
  const { userId } = await requireUser(req)
  await ensureSchema()
  const db = pool()
  const mine = async () =>
    (await db.query<AgentRow>(`select ${COLS} from sb_agents where workspace_id = $1 and owner_clerk_id = $2 and revoked_at is null order by created_at`, [WORKSPACE_ID, userId])).rows

  if (req.method === 'GET') return json({ agents: (await mine()).map(toClient) })

  const body = ((await req.json().catch(() => null)) ?? {}) as { id?: unknown; name?: unknown; currentIssueId?: unknown }

  if (req.method === 'POST') {
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 60) : ''
    if (!name) throw new HttpError(400, 'Give the agent a name, e.g. "Claude Code – laptop"')
    if ((await mine()).length >= 20) throw new HttpError(400, 'You can have at most 20 agents. Revoke one first.')
    const memberId = await memberIdOf(userId)
    const token = TOKEN_PREFIX + randomBytes(32).toString('base64url')
    const id = 'ag_' + randomBytes(8).toString('hex')
    const { rows } = await db.query<AgentRow>(
      `insert into sb_agents (id, workspace_id, owner_user_id, owner_clerk_id, name, token_hash, token_hint)
       values ($1, $2, $3, $4, $5, $6, $7) returning ${COLS}`,
      [id, WORKSPACE_ID, memberId, userId, name, hash(token), token.slice(-4)],
    )
    return json({ agent: toClient(rows[0]!), token }, 201)
  }

  const id = typeof body.id === 'string' ? body.id : (new URL(req.url).searchParams.get('id') ?? '')
  const owned = (await mine()).find((a) => a.id === id)
  if (!owned) throw new HttpError(404, 'Agent not found')

  if (req.method === 'PATCH') {
    const sets: string[] = []
    const vals: unknown[] = []
    if ('currentIssueId' in body) {
      const v = body.currentIssueId
      if (v !== null && (typeof v !== 'string' || !(await issueExists(v)))) throw new HttpError(400, 'That issue doesn’t exist')
      vals.push(v)
      sets.push(`current_issue_id = $${vals.length + 1}`)
    }
    if (typeof body.name === 'string' && body.name.trim()) {
      vals.push(body.name.trim().slice(0, 60))
      sets.push(`name = $${vals.length + 1}`)
    }
    if (!sets.length) return json({ agent: toClient(owned) })
    const { rows } = await db.query<AgentRow>(`update sb_agents set ${sets.join(', ')} where id = $1 returning ${COLS}`, [id, ...vals])
    return json({ agent: toClient(rows[0]!) })
  }

  if (req.method === 'DELETE') {
    await db.query('update sb_agents set revoked_at = now() where id = $1', [id])
    return json({ ok: true })
  }
  throw new HttpError(405, 'Method not allowed')
}

/** Authenticates an MCP request by its `Authorization: Bearer sbk_…` agent token. */
export async function requireAgent(req: Request): Promise<AgentRow> {
  const header = req.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token.startsWith(TOKEN_PREFIX)) throw new HttpError(401, 'Missing agent token. Create one in skatebored → Settings → Agents & MCP.')
  await ensureSchema()
  const { rows } = await pool().query<AgentRow>(`select ${COLS} from sb_agents where token_hash = $1 and workspace_id = $2 and revoked_at is null`, [hash(token), WORKSPACE_ID])
  const agent = rows[0]
  if (!agent) throw new HttpError(401, 'This agent token is invalid or was revoked')
  // Cheap "last seen" — at most one write a minute per agent.
  waitUntil(
    pool().query(`update sb_agents set last_used_at = now() where id = $1 and (last_used_at is null or last_used_at < now() - interval '1 minute')`, [agent.id]).catch(() => {}),
  )
  return agent
}

export async function setCurrentIssue(agentId: string, issueId: string | null) {
  await pool().query('update sb_agents set current_issue_id = $2 where id = $1', [agentId, issueId])
}
