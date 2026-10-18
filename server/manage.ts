import { randomBytes } from 'node:crypto'
import { HttpError } from './auth.js'
import { pool, WORKSPACE_ID } from './db.js'
import { applyOps, type Op } from './sync.js'
import type { Issue, Lookups, Project, Sprint, TeamEvent, User } from './workspace.js'

/**
 * Everything the app lets a member do to projects, sprints, tasks and team events, as
 * server-side operations for agents. Each one mirrors the matching store action in
 * src/store/store.ts (same record shapes, history entries and notifications) and is
 * written through applyOps, so it syncs to every open browser like a change made in the UI.
 */

export interface Actor {
  memberId: string
  clerkId: string
}

const uid = (prefix: string) => prefix + randomBytes(5).toString('hex') + Date.now().toString(36).slice(-4)
const now = () => new Date().toISOString()
const EPIC_COLORS = ['#f04c4c', '#f2a93b', '#5cc47e', '#6ea0ff', '#b48cff', '#ff7ab6', '#38c6c6', '#c9a27e']
const PRIORITIES = ['highest', 'high', 'medium', 'low', 'lowest'] as const

// ───────────────────────────── time ─────────────────────────────

export const TEAM_TZ = process.env.TEAM_TIMEZONE || 'America/Chicago'

/** Milliseconds the team's timezone is ahead of UTC at instant `ms`. */
function tzOffset(ms: number) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: TEAM_TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(ms)
      .map((p) => [p.type, p.value]),
  )
  return Date.UTC(+parts.year!, +parts.month! - 1, +parts.day!, +parts.hour!, +parts.minute!, +parts.second!) - (ms - (ms % 1000))
}

/**
 * Parses a date or date-time. Explicit offsets ("Z", "-05:00") are respected; anything
 * else ("2026-10-20 15:00", "2026-10-20") is wall-clock time in the team's timezone.
 * A bare date becomes `defaultTime` (HH:mm) that day.
 */
export function parseWhen(input: string, defaultTime = '12:00'): string {
  const t = input.trim()
  if (/(z|[+-]\d\d:?\d\d)$/i.test(t) && /\d{4}-\d{2}-\d{2}T/i.test(t)) {
    const ms = Date.parse(t)
    if (!Number.isNaN(ms)) return new Date(ms).toISOString()
  }
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2}))?(?::\d{2}(?:\.\d+)?)?$/)
  if (!m) throw new HttpError(400, `Couldn't read the date "${input}". Use YYYY-MM-DD or YYYY-MM-DD HH:mm (team time, ${TEAM_TZ}), or a full ISO time with offset.`)
  const [dh, dm] = defaultTime.split(':')
  const wall = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +(m[4] ?? dh!), +(m[5] ?? dm!))
  let ms = wall - tzOffset(wall)
  ms = wall - tzOffset(ms) // second pass settles DST edges
  return new Date(ms).toISOString()
}

/** "Tue 20 Oct 2026, 15:00 (America/Chicago)" */
export function showWhen(iso: string | null | undefined, withTime = true) {
  if (!iso) return 'not set'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const v = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: TEAM_TZ, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  )
  const date = `${v.weekday} ${v.day} ${v.month} ${v.year}`
  return withTime ? `${date}, ${v.hour}:${v.minute} (${TEAM_TZ})` : date
}

// ───────────────────────────── finding things by name ─────────────────────────────

export function findProjectByKey(L: Lookups, key: string): Project {
  const p = [...L.projects.values()].find((x) => x.key.toUpperCase() === key.trim().toUpperCase() || x.name.toLowerCase() === key.trim().toLowerCase())
  if (!p) throw new HttpError(404, `No project "${key}". Projects: ${[...L.projects.values()].map((x) => `${x.key} (${x.name})`).join(', ') || 'none yet'}`)
  return p
}

/** A member by "me", id, email, full name, or an unambiguous part of the name. */
export function findUser(L: Lookups, q: string, me: string): User {
  const s = q.trim().toLowerCase()
  const users = [...L.users.values()].filter((u) => u.active !== false)
  if (s === 'me' || s === 'myself') return L.users.get(me)!
  const exact = users.find((u) => u.id === q || u.email.toLowerCase() === s || u.name.toLowerCase() === s)
  if (exact) return exact
  const partial = users.filter((u) => u.name.toLowerCase().split(/\s+/).includes(s) || u.name.toLowerCase().includes(s))
  if (partial.length === 1) return partial[0]!
  throw new HttpError(
    404,
    partial.length ? `"${q}" matches ${partial.map((u) => u.name).join(', ')}. Be more specific.` : `No team member "${q}". Members: ${users.map((u) => `${u.name} <${u.email}>`).join(', ')}`,
  )
}

/** A sprint by id or name, optionally within one project. */
export function findSprint(L: Lookups, q: string, project?: Project): Sprint {
  const s = q.trim().toLowerCase()
  const pool = [...L.sprints.values()].filter((x) => !project || x.projectId === project.id)
  const hit = pool.find((x) => x.id === q) ?? pool.filter((x) => x.name.toLowerCase() === s)
  if (!Array.isArray(hit)) return hit
  if (hit.length === 1) return hit[0]!
  if (hit.length > 1) throw new HttpError(409, `Several sprints are called "${q}". Pass the project too, or the sprint id: ${hit.map((x) => `${x.id} (${L.projects.get(x.projectId)?.key})`).join(', ')}`)
  const near = pool.filter((x) => x.name.toLowerCase().includes(s))
  if (near.length === 1) return near[0]!
  throw new HttpError(404, `No sprint "${q}"${project ? ` in ${project.key}` : ''}. Sprints: ${pool.filter((x) => x.state !== 'closed').map((x) => x.name).join(', ') || 'none'}`)
}

export function findIssue(L: Lookups, key: string): Issue {
  const i = L.byKey.get(key.trim().toUpperCase())
  if (!i) throw new HttpError(404, `No task ${key}`)
  return i
}

const runningOrNext = (L: Lookups, projectId: string) => {
  const open = [...L.sprints.values()].filter((s) => s.projectId === projectId && s.state !== 'closed').sort((a, b) => a.order - b.order)
  return open.find((s) => s.state === 'active') ?? open[0] ?? null
}

// ───────────────────────────── projects ─────────────────────────────

export async function createProject(
  L: Lookups,
  actor: Actor,
  input: { name: string; key: string; description?: string; engineering: boolean; leadId?: string },
): Promise<{ project: Project; sprint: Sprint }> {
  const key = input.key.trim().toUpperCase()
  if (!/^[A-Z][A-Z0-9]{1,9}$/.test(key)) throw new HttpError(400, 'Project keys are 2–10 letters or digits, starting with a letter (e.g. ENG)')
  if ([...L.projects.values()].some((p) => p.key.toUpperCase() === key)) throw new HttpError(409, `The key ${key} is already used`)
  const name = input.name.trim()
  if (!name) throw new HttpError(400, 'Project name is required')
  const statuses = [
    { id: `${key}-todo`, name: 'To Do', category: 'todo' as const },
    { id: `${key}-prog`, name: 'In Progress', category: 'inprogress' as const },
    { id: `${key}-review`, name: 'In Review', category: 'inprogress' as const },
    { id: `${key}-done`, name: 'Done', category: 'done' as const },
  ]
  const leadId = input.leadId ?? actor.memberId
  const project = {
    id: uid('p-'),
    key,
    name,
    description: input.description ?? '',
    type: 'scrum',
    category: 'Software',
    leadId,
    color: EPIC_COLORS[L.projects.size % EPIC_COLORS.length]!,
    icon: '🛹',
    memberIds: [...new Set([actor.memberId, leadId])],
    statuses,
    columns: statuses.map((st) => ({ id: uid('col-'), name: st.name, statusIds: [st.id], wipLimit: null })),
    components: [],
    versions: [],
    issueCounter: 0,
    starred: false,
    estimation: 'points' as const,
    engineering: input.engineering,
    createdAt: now(),
  }
  const sprint = newSprint(project, [], {})
  await applyOps(
    [
      { c: 'projects', id: project.id, op: 'put', d: project },
      { c: 'sprints', id: sprint.id, op: 'put', d: sprint as unknown as Record<string, unknown> },
    ],
    actor.clerkId,
  )
  return { project, sprint }
}

export async function updateProject(
  L: Lookups,
  actor: Actor,
  p: Project,
  patch: { name?: string; description?: string; engineering?: boolean; leadId?: string; addMemberIds?: string[]; removeMemberIds?: string[]; repo?: string | null },
) {
  const d: Record<string, unknown> = {}
  if (patch.name !== undefined) {
    if (!patch.name.trim()) throw new HttpError(400, 'Project name is required')
    d.name = patch.name.trim()
  }
  if (patch.description !== undefined) d.description = patch.description
  if (patch.engineering !== undefined) d.engineering = patch.engineering
  if (patch.repo !== undefined) d.repo = patch.repo
  let members = [...p.memberIds]
  if (patch.addMemberIds?.length) members = [...new Set([...members, ...patch.addMemberIds])]
  if (patch.removeMemberIds?.length) {
    const lead = patch.leadId ?? p.leadId
    if (patch.removeMemberIds.includes(lead)) throw new HttpError(400, `${L.userName(lead)} leads ${p.key}; make someone else lead first`)
    members = members.filter((m) => !patch.removeMemberIds!.includes(m))
  }
  if (patch.leadId !== undefined) {
    d.leadId = patch.leadId
    if (!members.includes(patch.leadId)) members.push(patch.leadId)
  }
  if (members.join() !== p.memberIds.join()) d.memberIds = members
  if (!Object.keys(d).length) return p
  await applyOps([{ c: 'projects', id: p.id, op: 'patch', d }], actor.clerkId)
  return Object.assign(p, d)
}

// ───────────────────────────── sprints ─────────────────────────────

export type SprintKind = 'research' | 'implementation'
export type StepKey = 'research' | 'alternatives' | 'solution' | 'implementation'
export interface StepInput {
  docs?: string[]
  add_docs?: string[]
  presentation?: string | null
  implementation_date?: string | null
}
export const STEP_KEYS: Record<SprintKind, StepKey[]> = { research: ['research', 'alternatives', 'solution'], implementation: ['implementation'] }

const cleanDocs = (docs: string[]) => docs.map((d) => d.trim()).filter(Boolean).map((d) => (/^[a-z]+:\/\//i.test(d) ? d : `https://${d}`))

function newSprint(project: { id: string; key: string }, existing: Sprint[], patch: Partial<Sprint>): Sprint {
  const lastNum = existing.reduce((m, sp) => Math.max(m, parseInt(sp.name.match(/(\d+)\s*$/)?.[1] ?? '0', 10)), 0)
  return {
    id: uid('s-'),
    projectId: project.id,
    name: `${project.key} Sprint ${lastNum + 1}`,
    goal: '',
    state: 'future',
    startDate: null,
    endDate: null,
    completedAt: null,
    committedIssueIds: [],
    committedPoints: 0,
    completedIssueIds: [],
    completedPoints: 0,
    incompleteIssueIds: [],
    order: existing.reduce((m, sp) => Math.max(m, sp.order), 0) + 1,
    ...patch,
  } as Sprint
}

/** Applies step changes for this sprint's kind; unknown steps are rejected so nothing is silently dropped. */
function mergeSteps(kind: SprintKind | null | undefined, current: Sprint['steps'], steps: Partial<Record<StepKey, StepInput>> | undefined) {
  if (!steps || !Object.keys(steps).length) return undefined
  if (!kind) throw new HttpError(400, 'Set the sprint type (research or implementation) before adding steps')
  const allowed = STEP_KEYS[kind]
  const out: NonNullable<Sprint['steps']> = { ...(current ?? {}) }
  for (const [key, st] of Object.entries(steps) as [StepKey, StepInput][]) {
    if (!allowed.includes(key)) throw new HttpError(400, `${kind === 'research' ? 'Research' : 'Implementation'} sprints have these steps: ${allowed.join(', ')}`)
    if (key !== 'implementation' && st.implementation_date !== undefined) throw new HttpError(400, 'Only the implementation step has an implementation date')
    const prev = { docs: [] as string[], presentAt: null as string | null, date: null as string | null, ...out[key] }
    const next = { ...prev }
    if (st.docs !== undefined) next.docs = cleanDocs(st.docs)
    if (st.add_docs?.length) next.docs = [...new Set([...(next.docs ?? []), ...cleanDocs(st.add_docs)])]
    if (st.presentation !== undefined) next.presentAt = st.presentation ? parseWhen(st.presentation, '15:00') : null
    if (st.implementation_date !== undefined) next.date = st.implementation_date ? parseWhen(st.implementation_date) : null
    out[key] = next
  }
  return out
}

function checkDates(start: string | null | undefined, end: string | null | undefined) {
  if (start && end && Date.parse(end) <= Date.parse(start)) throw new HttpError(400, 'The end must be after the start')
}

export async function createSprint(
  L: Lookups,
  actor: Actor,
  p: Project,
  input: { name?: string; goal?: string; start?: string; end?: string; kind?: SprintKind; steps?: Partial<Record<StepKey, StepInput>> },
) {
  if (p.engineering && !input.kind) throw new HttpError(400, `${p.key} is an engineering project: say whether the sprint is "research" or "implementation"`)
  if (!p.engineering && (input.kind || input.steps)) throw new HttpError(400, `${p.key} isn't an engineering project, so its sprints have no type or steps. Turn engineering on with update_project first.`)
  const startDate = input.start ? parseWhen(input.start, '09:00') : null
  const endDate = input.end ? parseWhen(input.end, '17:00') : null
  checkDates(startDate, endDate)
  const existing = [...L.sprints.values()].filter((s) => s.projectId === p.id)
  const sprint = newSprint(p, existing, {
    ...(input.name?.trim() ? { name: input.name.trim() } : {}),
    goal: input.goal?.trim() ?? '',
    startDate,
    endDate,
    ...(p.engineering ? { kind: input.kind ?? null, steps: mergeSteps(input.kind, {}, input.steps) ?? {} } : {}),
  })
  await applyOps([{ c: 'sprints', id: sprint.id, op: 'put', d: sprint as unknown as Record<string, unknown> }], actor.clerkId)
  return sprint
}

export async function updateSprint(
  L: Lookups,
  actor: Actor,
  sprint: Sprint,
  patch: { name?: string; goal?: string; start?: string | null; end?: string | null; kind?: SprintKind; steps?: Partial<Record<StepKey, StepInput>> },
) {
  const p = L.projects.get(sprint.projectId)!
  const d: Record<string, unknown> = {}
  if (patch.name !== undefined) {
    if (!patch.name.trim()) throw new HttpError(400, 'Sprint name is required')
    d.name = patch.name.trim()
  }
  if (patch.goal !== undefined) d.goal = patch.goal.trim()
  if (patch.start !== undefined) d.startDate = patch.start ? parseWhen(patch.start, '09:00') : null
  if (patch.end !== undefined) d.endDate = patch.end ? parseWhen(patch.end, '17:00') : null
  const start = (d.startDate as string | null | undefined) ?? (patch.start === undefined ? sprint.startDate : null)
  const end = (d.endDate as string | null | undefined) ?? (patch.end === undefined ? sprint.endDate : null)
  if (sprint.state === 'active' && (!start || !end)) throw new HttpError(400, 'Running sprints need a start and an end')
  checkDates(start, end)
  if ((patch.kind || patch.steps) && !p.engineering) throw new HttpError(400, `${p.key} isn't an engineering project, so its sprints have no type or steps. Turn engineering on with update_project first.`)
  if (patch.kind) d.kind = patch.kind
  const steps = mergeSteps((d.kind as SprintKind | undefined) ?? sprint.kind, sprint.steps, patch.steps)
  if (steps) d.steps = steps
  if (!Object.keys(d).length) return sprint
  await applyOps([{ c: 'sprints', id: sprint.id, op: 'patch', d }], actor.clerkId)
  return Object.assign(sprint, d)
}

export async function startSprint(L: Lookups, actor: Actor, sprint: Sprint, opts: { start?: string; end?: string }) {
  if (sprint.state !== 'future') throw new HttpError(409, `${sprint.name} is ${sprint.state === 'active' ? 'already running' : 'finished'}`)
  const nowMs = Date.now()
  const startDate = opts.start ? parseWhen(opts.start, '09:00') : sprint.startDate && Date.parse(sprint.startDate) <= nowMs + 86_400_000 ? sprint.startDate : new Date(nowMs).toISOString()
  const endDate = opts.end ? parseWhen(opts.end, '17:00') : sprint.endDate && Date.parse(sprint.endDate) > Date.parse(startDate) ? sprint.endDate : new Date(Date.parse(startDate) + 14 * 86_400_000).toISOString()
  checkDates(startDate, endDate)
  const issues = [...L.issues.values()].filter((i) => i.sprintId === sprint.id && i.type !== 'subtask')
  const d = {
    state: 'active',
    startDate,
    endDate,
    committedIssueIds: issues.map((i) => i.id),
    committedPoints: issues.reduce((n, i) => n + (i.storyPoints ?? 0), 0),
  }
  await applyOps([{ c: 'sprints', id: sprint.id, op: 'patch', d }], actor.clerkId)
  return Object.assign(sprint, d)
}

/** Closes a running sprint; unfinished tasks move to `moveTo` (another open sprint, or a new one). */
export async function finishSprint(L: Lookups, actor: Actor, sprint: Sprint, moveTo: Sprint | 'new') {
  if (sprint.state !== 'active') throw new HttpError(409, `${sprint.name} isn't running`)
  const p = L.projects.get(sprint.projectId)!
  const doneIds = new Set(p.statuses.filter((s) => s.category === 'done').map((s) => s.id))
  const inSprint = [...L.issues.values()].filter((i) => i.sprintId === sprint.id && i.type !== 'subtask')
  const completed = inSprint.filter((i) => doneIds.has(i.statusId))
  const incomplete = inSprint.filter((i) => !doneIds.has(i.statusId))
  const ops: Op[] = [
    {
      c: 'sprints',
      id: sprint.id,
      op: 'patch',
      d: {
        state: 'closed',
        completedAt: now(),
        completedIssueIds: completed.map((i) => i.id),
        completedPoints: completed.reduce((n, i) => n + (i.storyPoints ?? 0), 0),
        incompleteIssueIds: incomplete.map((i) => i.id),
      },
    },
  ]
  let target: Sprint
  if (moveTo === 'new') {
    target = newSprint(p, [...L.sprints.values()].filter((s) => s.projectId === p.id), p.engineering ? { kind: sprint.kind ?? null, steps: {} } : {})
    ops.push({ c: 'sprints', id: target.id, op: 'put', d: target as unknown as Record<string, unknown> })
  } else {
    if (moveTo.id === sprint.id || moveTo.state === 'closed' || moveTo.projectId !== p.id) throw new HttpError(400, `Unfinished tasks can move to another open ${p.key} sprint, or "new"`)
    target = moveTo
  }
  if (incomplete.length) {
    L.sprints.set(target.id, target)
    ops.push(...issueOps(L, actor, incomplete, { sprintId: target.id }))
  }
  await applyOps(ops, actor.clerkId)
  sprint.state = 'closed'
  return { completed: completed.length, moved: incomplete.length, target }
}

export async function deleteSprint(L: Lookups, actor: Actor, sprint: Sprint) {
  if (sprint.state !== 'future') throw new HttpError(409, 'Only planned sprints can be deleted (finish a running sprint instead)')
  const tasks = [...L.issues.values()].filter((i) => i.sprintId === sprint.id)
  await applyOps(
    [{ c: 'sprints', id: sprint.id, op: 'delete' }, ...tasks.map((i) => ({ c: 'issues', id: i.id, op: 'patch' as const, d: { sprintId: null, updatedAt: now() } }))],
    actor.clerkId,
  )
  return tasks.length
}

// ───────────────────────────── tasks ─────────────────────────────

const FIELD_LABEL: Partial<Record<keyof Issue, string>> = {
  statusId: 'status',
  assigneeId: 'assignee',
  reporterId: 'reporter',
  sprintId: 'Sprint',
  epicId: 'Epic Link',
  parentId: 'Parent',
  priority: 'priority',
  type: 'issuetype',
  summary: 'summary',
  description: 'description',
  storyPoints: 'Story Points',
  labels: 'labels',
  dueDate: 'duedate',
  flagged: 'Flagged',
}
const PRIORITY_LABEL: Record<string, string> = { highest: 'Highest', high: 'High', medium: 'Medium', low: 'Low', lowest: 'Lowest' }
const TYPE_LABEL: Record<string, string> = { epic: 'Epic', task: 'Task', bug: 'Bug', subtask: 'Sub-task' }
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/** History text for a field value, as the app writes it. */
function describe(L: Lookups, issue: Issue, field: keyof Issue, value: unknown): string | null {
  if (value == null || value === '') return null
  const p = L.projects.get(issue.projectId)
  switch (field) {
    case 'statusId':
      return p?.statuses.find((x) => x.id === value)?.name ?? String(value)
    case 'assigneeId':
    case 'reporterId':
      return L.users.get(String(value))?.name ?? String(value)
    case 'sprintId':
      return L.sprints.get(String(value))?.name ?? String(value)
    case 'epicId':
    case 'parentId':
      return L.issues.get(String(value))?.key ?? String(value)
    case 'priority':
      return PRIORITY_LABEL[String(value)] ?? String(value)
    case 'type':
      return TYPE_LABEL[String(value)] ?? String(value)
    case 'labels':
      return (value as string[]).join(', ') || null
    case 'dueDate':
      return showWhen(String(value), false)
    case 'flagged':
      return value ? 'Impediment' : null
    default:
      return String(value)
  }
}

function notifyOps(issue: Issue, actorId: string, text: string, only?: string[]): Op[] {
  const targets = new Set(only ?? [...(issue.watcherIds ?? []), ...(issue.assigneeId ? [issue.assigneeId] : []), issue.reporterId])
  targets.delete(actorId)
  return [...targets].map((userId) => {
    const id = uid('n')
    return { c: 'notifications', id, op: 'put' as const, d: { id, userId, actorId, issueId: issue.id, text, read: false, createdAt: now() } }
  })
}

/** Patch ops (+ history and notifications) for tasks; sub-tasks follow their parent's sprint. */
function issueOps(L: Lookups, actor: Actor, issues: Issue[], patch: Partial<Issue>): Op[] {
  const ops: Op[] = []
  const ts = now()
  for (const issue of issues) {
    const changed = (Object.keys(patch) as (keyof Issue)[]).filter((k) => !same(issue[k], patch[k]))
    if (!changed.length) continue
    const d: Record<string, unknown> = { updatedAt: ts }
    for (const k of changed) d[k] = patch[k]
    for (const k of changed) {
      const field = FIELD_LABEL[k]
      if (!field) continue
      const id = uid('h')
      ops.push({ c: 'history', id, op: 'put', d: { id, issueId: issue.id, userId: actor.memberId, field, from: describe(L, issue, k, issue[k]), to: describe(L, issue, k, patch[k]), createdAt: ts } })
    }
    if (changed.includes('statusId')) {
      const cat = L.projects.get(issue.projectId)?.statuses.find((x) => x.id === patch.statusId)?.category
      d.resolvedAt = cat === 'done' ? ts : null
    }
    const next = { ...issue, ...d } as Issue
    if (changed.includes('assigneeId') && patch.assigneeId) ops.push(...notifyOps(next, actor.memberId, 'assigned you to', [patch.assigneeId]))
    else if (changed.includes('statusId')) ops.push(...notifyOps(next, actor.memberId, 'changed the status of'))
    else if (changed.some((k) => FIELD_LABEL[k])) ops.push(...notifyOps(next, actor.memberId, 'updated'))
    ops.unshift({ c: 'issues', id: issue.id, op: 'patch', d })
    if (changed.includes('sprintId'))
      for (const sub of [...L.issues.values()].filter((i) => i.parentId === issue.id && i.sprintId !== patch.sprintId))
        ops.push({ c: 'issues', id: sub.id, op: 'patch', d: { sprintId: patch.sprintId ?? null, updatedAt: ts } })
    Object.assign(issue, d)
  }
  return ops
}

export async function updateIssue(L: Lookups, actor: Actor, issue: Issue, patch: Partial<Issue>) {
  const ops = issueOps(L, actor, [issue], patch)
  if (ops.length) await applyOps(ops, actor.clerkId)
  return ops.length > 0
}

export interface TaskInput {
  summary: string
  description?: string
  type?: Issue['type']
  priority?: Issue['priority']
  assigneeId?: string | null
  sprintId?: string | null
  storyPoints?: number | null
  labels?: string[]
  dueDate?: string | null
  statusId?: string
  epicId?: string | null
  parentId?: string | null
}

export async function createIssue(L: Lookups, actor: Actor, p: Project, input: TaskInput) {
  const summary = input.summary.trim()
  if (!summary) throw new HttpError(400, 'A task needs a summary')
  if (summary.length > 255) throw new HttpError(400, 'Summaries are up to 255 characters; put the rest in the description')
  const type = input.type ?? (input.parentId ? 'subtask' : 'task')
  const parent = input.parentId ? L.issues.get(input.parentId) : undefined
  if (type === 'subtask' && !parent) throw new HttpError(400, 'Sub-tasks need a parent task')
  const n = p.issueCounter + 1
  const ts = now()
  const maxRank = [...L.issues.values()].reduce((m, i) => Math.max(m, i.rank), 0)
  const statusId = input.statusId ?? p.statuses.find((st) => st.category === 'todo')?.id ?? p.statuses[0]!.id
  const sprintId = type === 'epic' ? null : parent ? parent.sprintId : input.sprintId !== undefined ? input.sprintId : (runningOrNext(L, p.id)?.id ?? null)
  const issue = {
    id: uid('i-'),
    key: `${p.key}-${n}`,
    projectId: p.id,
    type,
    summary,
    description: input.description ?? '',
    statusId,
    priority: input.priority ?? 'medium',
    assigneeId: input.assigneeId ?? null,
    reporterId: actor.memberId,
    storyPoints: input.storyPoints ?? null,
    labels: input.labels ?? [],
    sprintId,
    epicId: input.epicId !== undefined ? input.epicId : (parent?.epicId ?? null),
    parentId: parent?.id ?? null,
    componentIds: [],
    fixVersionIds: [],
    dueDate: input.dueDate ?? null,
    startDate: null,
    color: type === 'epic' ? EPIC_COLORS[n % EPIC_COLORS.length]! : null,
    originalEstimate: null,
    timeSpent: 0,
    rank: maxRank + 1000,
    watcherIds: [actor.memberId],
    links: [],
    attachments: [],
    flagged: false,
    createdAt: ts,
    updatedAt: ts,
    resolvedAt: p.statuses.find((st) => st.id === statusId)?.category === 'done' ? ts : null,
  }
  const hid = uid('h')
  const ops: Op[] = [
    { c: 'issues', id: issue.id, op: 'put', d: issue },
    { c: 'history', id: hid, op: 'put', d: { id: hid, issueId: issue.id, userId: actor.memberId, field: 'created', from: null, to: null, createdAt: ts } },
    { c: 'projects', id: p.id, op: 'patch', d: { issueCounter: n } },
    ...(issue.assigneeId && issue.assigneeId !== actor.memberId ? notifyOps(issue as Issue, actor.memberId, 'assigned you to') : []),
  ]
  await applyOps(ops, actor.clerkId)
  // The server renumbers the key if someone else took it at the same moment.
  const { rows } = await pool().query<{ key: string }>(`select data->>'key' as key from sb_records where workspace_id = $1 and collection = 'issues' and id = $2`, [WORKSPACE_ID, issue.id])
  issue.key = rows[0]?.key ?? issue.key
  p.issueCounter = Math.max(p.issueCounter, n)
  return issue as Issue
}

/** Deletes a task with its sub-tasks and comments, and unlinks anything pointing at them (as the app does). */
export async function deleteIssue(L: Lookups, actor: Actor, issue: Issue) {
  const doomed = new Set([issue.id, ...[...L.issues.values()].filter((i) => i.parentId === issue.id).map((i) => i.id)])
  const ops: Op[] = [...doomed].map((id) => ({ c: 'issues', id, op: 'delete' as const }))
  for (const i of L.issues.values()) {
    if (doomed.has(i.id)) continue
    const epicGone = i.epicId && doomed.has(i.epicId)
    const links = (i.links ?? []).filter((l) => !doomed.has(l.issueId))
    if (epicGone || links.length !== (i.links ?? []).length) ops.push({ c: 'issues', id: i.id, op: 'patch', d: { ...(epicGone ? { epicId: null } : {}), links } })
  }
  const { rows } = await pool().query<{ id: string }>(
    `select id from sb_records where workspace_id = $1 and collection = 'comments' and not deleted and data->>'issueId' = any($2::text[])`,
    [WORKSPACE_ID, [...doomed]],
  )
  ops.push(...rows.map((r) => ({ c: 'comments', id: r.id, op: 'delete' as const })))
  await applyOps(ops, actor.clerkId)
  return doomed.size
}

// ───────────────────────────── team calendar ─────────────────────────────

const clampMinutes = (m: number) => Math.min(Math.max(Math.round(m), 5), 24 * 60)

export async function createEvent(actor: Actor, input: { title: string; start: string; durationMinutes?: number; description?: string; location?: string; projectId?: string | null }) {
  const title = input.title.trim()
  if (!title) throw new HttpError(400, 'An event needs a title')
  const ts = now()
  const e: TeamEvent = {
    id: uid('ev'),
    title: title.slice(0, 300),
    description: input.description ?? '',
    location: input.location ?? '',
    start: parseWhen(input.start, '09:00'),
    durationMinutes: clampMinutes(input.durationMinutes ?? 30),
    projectId: input.projectId ?? null,
    createdById: actor.memberId,
    createdAt: ts,
    updatedAt: ts,
  }
  await applyOps([{ c: 'events', id: e.id, op: 'put', d: e as unknown as Record<string, unknown> }], actor.clerkId)
  return e
}

export async function updateEvent(
  actor: Actor,
  e: TeamEvent,
  patch: { title?: string; start?: string; durationMinutes?: number; description?: string; location?: string; projectId?: string | null },
) {
  const d: Record<string, unknown> = {}
  if (patch.title !== undefined) {
    if (!patch.title.trim()) throw new HttpError(400, 'An event needs a title')
    d.title = patch.title.trim().slice(0, 300)
  }
  if (patch.start !== undefined) d.start = parseWhen(patch.start, '09:00')
  if (patch.durationMinutes !== undefined) d.durationMinutes = clampMinutes(patch.durationMinutes)
  if (patch.description !== undefined) d.description = patch.description
  if (patch.location !== undefined) d.location = patch.location
  if (patch.projectId !== undefined) d.projectId = patch.projectId
  if (!Object.keys(d).length) return e
  d.updatedAt = now()
  await applyOps([{ c: 'events', id: e.id, op: 'patch', d }], actor.clerkId)
  return Object.assign(e, d)
}

export async function deleteEvent(actor: Actor, e: TeamEvent) {
  await applyOps([{ c: 'events', id: e.id, op: 'delete' }], actor.clerkId)
}

export { PRIORITIES }
