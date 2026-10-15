import { randomBytes } from 'node:crypto'
import { ensureSchema, pool, WORKSPACE_ID } from './db.js'
import { applyOps, type Op } from './sync.js'
import {
  AUTHORING_LABEL,
  ALL_TASK_FIELDS,
  CANDIDATE_STATUS_LABEL,
  CATEGORY_LABEL,
  MODULE_SECTIONS,
  OPERATIONS_FLOW,
  REFERENCE_KIND_LABEL,
  styleInfo,
  taskGroups,
  trackLabel,
  type WorkStyle,
  type WorkTrack,
} from './work.js'

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
  defaultTrack?: WorkTrack | null
  defaultWorkStyle?: WorkStyle | null
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
  track?: WorkTrack | null
  workStyle?: WorkStyle | null
  moduleId?: string | null
  brief?: Record<string, string>
  suggestions?: Record<string, BriefSuggestion>
  references?: WorkReference[]
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
}
export interface BriefSuggestion {
  text: string
  by: string
  createdAt: string
}
export interface WorkReference {
  id: string
  title: string
  location: string
  kind: string
  citation?: string
  note?: string
  question?: string
  accessIssue?: string | null
}
export interface WorkModule {
  id: string
  projectId: string
  name: string
  summary: string
  ownerId: string | null
  defaultWorkStyle: WorkStyle | null
  updatesLiveIn: string
  brief: Record<string, string>
  references: WorkReference[]
  criteria: { id: string; name: string; kind: 'requirement' | 'preference'; threshold: string }[]
  candidates: { id: string; name: string; baseline: boolean; status: string; reason: string }[]
  tests: { id: string; question: string; result: string }[]
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
  modules: WorkModule[]
}

/** Loads the collections the agent tools need (comments are fetched per issue). */
export async function loadSnapshot(): Promise<Snapshot> {
  await ensureSchema()
  const { rows } = await pool().query<{ collection: keyof Snapshot; data: never }>(
    `select collection, data from sb_records
     where workspace_id = $1 and not deleted and collection in ('users', 'projects', 'sprints', 'issues', 'modules')`,
    [WORKSPACE_ID],
  )
  const s: Snapshot = { users: [], projects: [], sprints: [], issues: [], modules: [] }
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
  const modules = new Map(s.modules.map((m) => [m.id, m]))
  const userName = (id: string | null | undefined) => (id ? (users.get(id)?.name ?? 'Unknown') : 'Unassigned')
  const status = (i: Issue) => projects.get(i.projectId)?.statuses.find((x) => x.id === i.statusId)
  return { users, projects, sprints, issues, byKey, modules, userName, status }
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

/** "Operations", "Technical/Research-led", or '' when unclassified — for compact lists. */
export function workTypeShort(i: Pick<Issue, 'track' | 'workStyle'>) {
  if (!i.track) return ''
  const st = i.track === 'technical' ? styleInfo(i.workStyle) : undefined
  return st ? `${trackLabel(i.track)}/${st.label}` : trackLabel(i.track)
}

/** "Technical · Research-led (Research heavy)", "Operations" or "Unclassified". */
export function workTypeLong(i: Pick<Issue, 'track' | 'workStyle'>) {
  if (i.track !== 'technical') return trackLabel(i.track)
  const st = styleInfo(i.workStyle)
  return st ? `Technical · ${st.label} (${CATEGORY_LABEL[st.category]})` : 'Technical · work style not chosen'
}

/** One line per issue, for lists. */
export function issueLine(i: Issue, L: Lookups) {
  const pts = i.storyPoints != null ? ` · ${i.storyPoints} pts` : ''
  const sprint = i.sprintId ? L.sprints.get(i.sprintId)?.name : 'Backlog'
  const work = workTypeShort(i)
  return `- ${i.key} [${L.status(i)?.name ?? '—'}] ${i.summary} (${i.type}, ${i.priority}${pts}, ${L.userName(i.assigneeId)}, ${sprint}${work ? `, ${work}` : ''}${i.flagged ? ', FLAGGED' : ''})`
}

/** Multi-line text as an indented continuation of a list item. */
const block = (t: string) => t.trim().replace(/\n/g, '\n  ')
const filled = (v: string | undefined): v is string => !!v && v.trim().length > 0

/** The task brief for the issue's current work style: every field, its authoring mode, and what's written. */
export function renderTaskBrief(i: Issue): string[] {
  const out: string[] = ['', '## Task brief', '']
  const brief = i.brief ?? {}
  const groups = taskGroups(i)
  const st = i.track === 'technical' ? styleInfo(i.workStyle) : undefined
  const flow = i.track === 'operations' ? OPERATIONS_FLOW : st
  if (flow) out.push(`Expected flow: ${flow.flow.join(' → ')}`, `Required output: ${flow.output}`)
  if (!groups.length) {
    out.push(i.track === 'technical' ? 'No work style chosen yet, so there are no brief prompts. Ask your owner to pick one.' : 'Unclassified — no task brief. Your owner can classify it as Operations or Technical.')
  } else {
    out.push(
      '[Handwrite] fields are written only by a person — never draft, fill or suggest text for them. [Use AI] fields may get a suggestion via suggest_brief_text; it is shown to the human next to their draft and never replaces it.',
    )
    if (i.track === 'operations') out.push('Operations work: no research prompts.')
    for (const g of groups) {
      out.push('', `### ${g.title}`, '')
      for (const f of g.fields) {
        out.push(`- ${f.label} [${AUTHORING_LABEL[f.authoring]}]: ${filled(brief[f.id]) ? block(brief[f.id]!) : '(empty)'}`)
        const sug = i.suggestions?.[f.id]
        if (sug) out.push(`  Pending suggestion from ${sug.by} (${sug.createdAt.slice(0, 10)}): ${block(sug.text)}`)
      }
    }
  }
  const current = new Set(groups.flatMap((g) => g.fields.map((f) => f.id)))
  const earlier = Object.entries(brief).filter(([id, v]) => !current.has(id) && filled(v))
  if (earlier.length) {
    out.push('', '### Written under an earlier work style', '')
    for (const [id, v] of earlier) out.push(`- ${ALL_TASK_FIELDS.get(id)?.label ?? id}: ${block(v)}`)
  }
  return out
}

function referenceLines(refs: WorkReference[] | undefined) {
  return (refs ?? []).map(
    (r) =>
      `- ${r.title || '(untitled)'} (${REFERENCE_KIND_LABEL[r.kind] ?? r.kind}) — ${r.location || 'no location'}` +
      (r.citation ? ` · ${r.citation}` : '') +
      (r.question ? ` · Answers: ${r.question}` : '') +
      (r.accessIssue ? ` · ACCESS ISSUE: ${r.accessIssue}` : ''),
  )
}

export const moduleUrl = (m: WorkModule, L: Lookups, appUrl: string) => `${appUrl}/projects/${L.projects.get(m.projectId)?.key ?? m.projectId}/modules/${m.id}`

/** A module brief: filled fields by section, references, comparison and decision. */
export function renderModule(m: WorkModule, L: Lookups, appUrl: string, opts: { heading?: string; linkedTasks?: boolean } = {}) {
  const out: string[] = [opts.heading ?? `# Module: ${m.name}`, '']
  out.push(`Link: ${moduleUrl(m, L, appUrl)}`)
  out.push(`Owner: ${L.userName(m.ownerId)}${m.defaultWorkStyle ? ` · New tasks start as ${styleInfo(m.defaultWorkStyle)?.label}` : ''}`)
  if (m.updatesLiveIn?.trim()) out.push(`Updates live in: ${m.updatesLiveIn.trim()}`)
  if (m.summary?.trim()) out.push('', m.summary.trim())
  const brief = m.brief ?? {}
  let any = false
  for (const sec of MODULE_SECTIONS) {
    const fields = sec.fields.filter((f) => filled(brief[f.id]))
    if (!fields.length) continue
    any = true
    out.push('', `### ${sec.title}`, '')
    for (const f of fields) out.push(`- ${f.label} [${AUTHORING_LABEL[f.authoring]}]: ${block(brief[f.id]!)}`)
  }
  if (!any) out.push('', '_The module brief is empty so far._')
  if (m.references?.length) out.push('', '### References', '', ...referenceLines(m.references))
  if (m.criteria?.length || m.candidates?.length) {
    out.push('', '### Comparison', '')
    if (m.criteria?.length) out.push(`Criteria: ${m.criteria.map((c) => `${c.name} (${c.kind}${c.threshold ? `: ${c.threshold}` : ''})`).join('; ')}`)
    for (const c of m.candidates ?? [])
      out.push(`- ${c.name}${c.baseline ? ' (current approach)' : ''} — ${CANDIDATE_STATUS_LABEL[c.status] ?? c.status}${c.reason ? `: ${c.reason.trim().replace(/\s+/g, ' ').slice(0, 300)}` : ''}`)
  }
  if (m.tests?.length) out.push('', `### Tests (${m.tests.length})`, '', ...m.tests.map((t) => `- ${t.question}${t.result ? ` → ${t.result.trim().replace(/\s+/g, ' ').slice(0, 300)}` : ' (no result yet)'}`))
  if (!filled(brief.chosen)) out.push('', 'Decision: not recorded yet (the module owner records it).')
  if (opts.linkedTasks) {
    const tasks = sortTasks([...L.issues.values()].filter((i) => i.moduleId === m.id), L)
    out.push('', `### Linked tasks (${tasks.length})`, '', ...(tasks.length ? tasks.map((i) => issueLine(i, L)) : ['- none']))
  }
  return out.join('\n')
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
  out.push(`Work type: ${workTypeLong(i)}`)
  if (sprint) out.push(`Sprint: ${sprint.name} (${sprint.state}${sprint.endDate ? `, ends ${day(sprint.endDate)}` : ''})${sprint.goal ? ` · Goal: ${sprint.goal}` : ''}`)
  else out.push('Sprint: none (backlog)')
  if (i.dueDate) out.push(`Due: ${day(i.dueDate)}`)
  if (i.labels.length) out.push(`Labels: ${i.labels.join(', ')}`)
  out.push(`Suggested branch: ${branchName(i)} · Commit messages: start with "${i.key}: "`)

  out.push('', '## Description', '', i.description.trim() || '_No description. Ask your owner for acceptance criteria if anything is unclear._')
  out.push(...renderTaskBrief(i))
  if (i.references?.length) out.push('', '## References', '', ...referenceLines(i.references))
  const mod = i.moduleId ? L.modules.get(i.moduleId) : undefined
  if (mod) out.push('', renderModule(mod, L, appUrl, { heading: `## Module brief: ${mod.name}` }).replace(/^### /gm, '#### '))

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

/** Stores an agent's suggestion for a Use AI brief field. Never touches the brief itself. */
export async function suggestBrief(i: Issue, field: string, suggestion: BriefSuggestion, actor: { clerkId: string }) {
  const d = { suggestions: { ...(i.suggestions ?? {}), [field]: suggestion }, updatedAt: now() }
  await applyOps([{ c: 'issues', id: i.id, op: 'patch', d }], actor.clerkId)
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
