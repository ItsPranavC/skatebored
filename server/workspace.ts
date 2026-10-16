import { randomBytes } from 'node:crypto'
import { ensureSchema, pool, WORKSPACE_ID } from './db.js'
import { applyOps, type Op } from './sync.js'

/**
 * Server-side read model of the shared workspace, for the MCP server.
 * Shapes mirror src/types.ts (the server can't import from src/, so only the
 * fields used here are declared).
 */

export interface Status {
  id: string
  name: string
  category: 'todo' | 'inprogress' | 'done'
}
export interface User {
  id: string
  name: string
  email: string
  title: string
  active: boolean
  clerkId?: string | null
}
export interface Project {
  id: string
  key: string
  name: string
  description: string
  leadId: string
  memberIds: string[]
  statuses: Status[]
  repo?: string | null
  estimation: 'points' | 'count'
}
export interface Sprint {
  id: string
  projectId: string
  name: string
  goal: string
  state: 'future' | 'active' | 'closed'
  startDate: string | null
  endDate: string | null
  order: number
}
export interface Issue {
  id: string
  key: string
  projectId: string
  type: 'epic' | 'task' | 'bug' | 'subtask'
  summary: string
  description: string
  statusId: string
  priority: 'highest' | 'high' | 'medium' | 'low' | 'lowest'
  assigneeId: string | null
  reporterId: string
  storyPoints: number | null
  labels: string[]
  sprintId: string | null
  epicId: string | null
  parentId: string | null
  dueDate: string | null
  rank: number
  watcherIds: string[]
  links: { id: string; type: string; issueId: string }[]
  attachments: { name: string }[]
  flagged: boolean
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
}
export interface Comment {
  id: string
  issueId: string
  authorId: string
  body: string
  createdAt: string
}

export interface Snapshot {
  users: User[]
  projects: Project[]
  sprints: Sprint[]
  issues: Issue[]
}

/** Loads the collections the agent tools need (comments are fetched per issue). */
export async function loadSnapshot(): Promise<Snapshot> {
  await ensureSchema()
  const { rows } = await pool().query<{ collection: keyof Snapshot; data: never }>(
    `select collection, data from sb_records
     where workspace_id = $1 and not deleted and collection in ('users', 'projects', 'sprints', 'issues')`,
    [WORKSPACE_ID],
  )
  const s: Snapshot = { users: [], projects: [], sprints: [], issues: [] }
  for (const r of rows) s[r.collection].push(r.data)
  return s
}

export async function commentsFor(issueId: string, limit = 10): Promise<Comment[]> {
  const { rows } = await pool().query<{ data: Comment }>(
    `select data from sb_records
     where workspace_id = $1 and collection = 'comments' and not deleted and data->>'issueId' = $2
     order by data->>'createdAt' desc limit $3`,
    [WORKSPACE_ID, issueId, limit],
  )
  return rows.map((r) => r.data).reverse()
}

// ───────────────────────────── lookups ─────────────────────────────

export const PRIORITY_ORDER = ['highest', 'high', 'medium', 'low', 'lowest'] as const

export function lookups(s: Snapshot) {
  const users = new Map(s.users.map((u) => [u.id, u]))
  const projects = new Map(s.projects.map((p) => [p.id, p]))
  const sprints = new Map(s.sprints.map((x) => [x.id, x]))
  const issues = new Map(s.issues.map((i) => [i.id, i]))
  const byKey = new Map(s.issues.map((i) => [i.key.toUpperCase(), i]))
  const userName = (id: string | null | undefined) => (id ? (users.get(id)?.name ?? 'Unknown') : 'Unassigned')
  const status = (i: Issue) => projects.get(i.projectId)?.statuses.find((x) => x.id === i.statusId)
  return { users, projects, sprints, issues, byKey, userName, status }
}
export type Lookups = ReturnType<typeof lookups>

/** Open work first: in progress → to do → done, then priority, then board rank. */
export function sortTasks(list: Issue[], L: Lookups) {
  const cat = { inprogress: 0, todo: 1, done: 2 } as const
  return [...list].sort(
    (a, b) =>
      cat[L.status(a)?.category ?? 'todo'] - cat[L.status(b)?.category ?? 'todo'] ||
      PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority) ||
      a.rank - b.rank,
  )
}

export function branchName(issue: Issue) {
  const slug = issue.summary
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 6)
    .join('-')
  return `${issue.key}-${slug}`.slice(0, 60).replace(/-+$/, '')
}

// ───────────────────────────── rendering ─────────────────────────────

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : '—')

/** One line per issue, for lists. */
export function issueLine(i: Issue, L: Lookups) {
  const pts = i.storyPoints != null ? ` · ${i.storyPoints} pts` : ''
  const sprint = i.sprintId ? L.sprints.get(i.sprintId)?.name : 'Backlog'
  return `- ${i.key} [${L.status(i)?.name ?? '—'}] ${i.summary} (${i.type}, ${i.priority}${pts}, ${L.userName(i.assigneeId)}, ${sprint}${i.flagged ? ', FLAGGED' : ''})`
}

/** The full brief an agent needs to work on one issue. */
export async function renderIssue(i: Issue, L: Lookups, appUrl: string, opts: { comments?: number } = {}) {
  const p = L.projects.get(i.projectId)
  const sprint = i.sprintId ? L.sprints.get(i.sprintId) : undefined
  const epic = i.epicId ? L.issues.get(i.epicId) : undefined
  const parent = i.parentId ? L.issues.get(i.parentId) : undefined
  const all = [...L.issues.values()]
  const subtasks = all.filter((x) => x.parentId === i.id)
  const children = i.type === 'epic' ? all.filter((x) => x.epicId === i.id && x.type !== 'subtask') : []
  const out: string[] = []

  out.push(`# ${i.key}: ${i.summary}`, '')
  out.push(`Link: ${appUrl}/browse/${i.key}`)
  out.push(
    `Type: ${i.type} · Status: ${L.status(i)?.name ?? '—'} · Priority: ${i.priority}` +
      (i.storyPoints != null ? ` · Story points: ${i.storyPoints}` : '') +
      (i.flagged ? ' · FLAGGED (impeded)' : ''),
  )
  out.push(`Assignee: ${L.userName(i.assigneeId)} · Reporter: ${L.userName(i.reporterId)}`)
  out.push(`Project: ${p ? `${p.name} (${p.key})` : '—'}${p?.repo ? ` · Repo: https://github.com/${p.repo}` : ''}`)
  if (sprint) out.push(`Sprint: ${sprint.name} (${sprint.state}${sprint.endDate ? `, ends ${day(sprint.endDate)}` : ''})${sprint.goal ? ` · Goal: ${sprint.goal}` : ''}`)
  else out.push('Sprint: none (backlog)')
  if (i.dueDate) out.push(`Due: ${day(i.dueDate)}`)
  if (i.labels.length) out.push(`Labels: ${i.labels.join(', ')}`)
  out.push(`Suggested branch: ${branchName(i)} · Commit messages: start with "${i.key}: "`)

  out.push('', '## Description', '', i.description.trim() || '_No description. Ask your owner for acceptance criteria if anything is unclear._')

  if (epic) out.push('', '## Epic', '', `${epic.key}: ${epic.summary}`, ...(epic.description.trim() ? ['', epic.description.trim().slice(0, 1500)] : []))
  if (parent) out.push('', '## Parent issue', '', `${parent.key}: ${parent.summary} [${L.status(parent)?.name ?? '—'}]`)
  if (subtasks.length) out.push('', '## Sub-tasks', '', ...sortTasks(subtasks, L).map((x) => issueLine(x, L)))
  if (children.length) out.push('', '## Issues in this epic', '', ...sortTasks(children, L).map((x) => issueLine(x, L)))
  if (i.links.length) {
    out.push('', '## Linked issues', '')
    for (const l of i.links) {
      const o = L.issues.get(l.issueId)
      if (o) out.push(`- ${l.type} ${o.key}: ${o.summary} [${L.status(o)?.name ?? '—'}]`)
    }
  }
  if (i.attachments.length) out.push('', '## Attachments', '', ...i.attachments.map((a) => `- ${a.name} (open the issue link to download)`))

  const comments = await commentsFor(i.id, opts.comments ?? 10)
  if (comments.length) {
    out.push('', '## Recent comments (oldest first)', '')
    for (const c of comments) out.push(`- ${L.userName(c.authorId)}, ${day(c.createdAt)}: ${c.body.trim().replace(/\n+/g, ' ').slice(0, 800)}`)
  }

  if (p) out.push('', '## Workflow', '', `Statuses in ${p.key}: ${p.statuses.map((x) => x.name).join(' → ')}. Change status with update_task_status.`)
  return out.join('\n')
}

// ───────────────────────────── writes ─────────────────────────────

const uid = (prefix: string) => prefix + randomBytes(5).toString('hex') + Date.now().toString(36).slice(-4)
const now = () => new Date().toISOString()

/**
 * Changes an issue the way the app does: field patch + history entries, resolution
 * tracking on status changes. Written through applyOps, so every open browser picks
 * it up on its next pull.
 */
export async function patchIssue(i: Issue, patch: Partial<Pick<Issue, 'statusId' | 'assigneeId'>>, actor: { memberId: string; clerkId: string }, L: Lookups) {
  const ts = now()
  const d: Record<string, unknown> = { ...patch, updatedAt: ts }
  const ops: Op[] = []
  const hist = (field: string, from: string | null, to: string | null) =>
    ops.push({ c: 'history', id: uid('h'), op: 'put', d: { id: '', issueId: i.id, userId: actor.memberId, field, from, to, createdAt: ts } })
  const p = L.projects.get(i.projectId)
  if (patch.statusId && patch.statusId !== i.statusId) {
    const to = p?.statuses.find((x) => x.id === patch.statusId)
    d.resolvedAt = to?.category === 'done' ? ts : null
    hist('status', L.status(i)?.name ?? null, to?.name ?? null)
  }
  if (patch.assigneeId !== undefined && patch.assigneeId !== i.assigneeId) hist('assignee', i.assigneeId ? L.userName(i.assigneeId) : null, patch.assigneeId ? L.userName(patch.assigneeId) : null)
  for (const o of ops) o.d!.id = o.id
  ops.unshift({ c: 'issues', id: i.id, op: 'patch', d })
  await applyOps(ops, actor.clerkId)
  Object.assign(i, d)
}

/** Adds a comment as the owner, the way the app does (the commenter starts watching the issue). */
export async function addComment(i: Issue, body: string, actor: { memberId: string; clerkId: string }) {
  const ts = now()
  const id = uid('c')
  const ops: Op[] = [
    { c: 'comments', id, op: 'put', d: { id, issueId: i.id, authorId: actor.memberId, body, createdAt: ts, updatedAt: null } },
    { c: 'issues', id: i.id, op: 'patch', d: { updatedAt: ts, watcherIds: Array.from(new Set([...(i.watcherIds ?? []), actor.memberId])) } },
  ]
  await applyOps(ops, actor.clerkId)
  return id
}
