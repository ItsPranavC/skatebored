import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { HttpError } from './auth.js'
import { applyOps } from './sync.js'
import { createMeeting } from './meetings.js'
import {
  createEvent,
  createIssue,
  createProject,
  createSprint,
  deleteEvent,
  deleteIssue,
  deleteSprint,
  findIssue,
  findProjectByKey,
  findSprint,
  findUser,
  finishSprint,
  parseWhen,
  PRIORITIES,
  showWhen,
  startSprint,
  STEP_KEYS,
  TEAM_TZ,
  updateEvent,
  updateIssue,
  updateProject,
  updateSprint,
  type Actor,
  type StepInput,
  type StepKey,
} from './manage.js'
import { issueLine, type Issue, type Lookups, type Project, type Snapshot, type Sprint } from './workspace.js'

/**
 * MCP tools that let an agent do what its owner can do in the app: projects, sprints
 * (incl. engineering research / implementation plans), tasks, team calendar events and
 * meetings. Every write is recorded as the owner's, exactly like a change made in the UI.
 */

type Result = { content: { type: 'text'; text: string }[]; isError?: boolean }
interface Deps {
  data: () => Promise<{ s: Snapshot; L: Lookups }>
  actor: (L: Lookups) => Actor
  appUrl: string
  guard: <A>(fn: (a: A) => Promise<Result>) => (a: A) => Promise<Result>
}

const text = (t: string): Result => ({ content: [{ type: 'text', text: t }] })
const WHEN = `Dates: "YYYY-MM-DD" or "YYYY-MM-DD HH:mm" in team time (${TEAM_TZ}), or ISO with an offset.`
const READ = { readOnlyHint: true } as const
const DESTROY = { destructiveHint: true } as const

const step = z
  .object({
    docs: z.array(z.string()).optional().describe('Google Docs links for this step (replaces the list)'),
    add_docs: z.array(z.string()).optional().describe('Links to add, keeping the existing ones'),
    presentation: z.string().nullable().optional().describe('When this step is presented; null clears it'),
    implementation_date: z.string().nullable().optional().describe('Implementation step only: the day it gets implemented'),
  })
  .strict()
const steps = z
  .object({ research: step.optional(), alternatives: step.optional(), solution: step.optional(), implementation: step.optional() })
  .strict()
  .describe('Engineering sprints only. Research sprints: research, alternatives, solution. Implementation sprints: implementation.')

const teamName = (p: Project) => (p.engineering ? 'Engineering' : 'Other team')

function sprintBlock(s: Sprint, L: Lookups, withTasks = false) {
  const p = L.projects.get(s.projectId)!
  const tasks = [...L.issues.values()].filter((i) => i.sprintId === s.id && i.type !== 'subtask' && i.type !== 'epic')
  const done = tasks.filter((i) => L.status(i)?.category === 'done').length
  const state = s.state === 'active' ? 'running' : s.state === 'future' ? 'planned' : 'finished'
  const out = [
    `## ${s.name} [${state}]${p.engineering && s.kind ? ` · ${s.kind === 'research' ? 'Research' : 'Implementation'}` : ''}`,
    `id: ${s.id} · project ${p.key} · ${showWhen(s.startDate, false)} → ${showWhen(s.endDate, false)} · ${done}/${tasks.length} tasks done`,
  ]
  if (s.goal) out.push(`Goal: ${s.goal}`)
  if (p.engineering) {
    if (!s.kind) out.push('Type not set yet (research or implementation).')
    else
      for (const key of STEP_KEYS[s.kind]) {
        const st = s.steps?.[key]
        out.push(
          `- ${key}: ${key === 'implementation' ? `implementation date ${showWhen(st?.date, false)} · ` : ''}presentation ${showWhen(st?.presentAt)} · ${st?.docs?.length ? `docs: ${st.docs.join(', ')}` : 'no docs yet'}`,
        )
      }
  }
  if (withTasks && tasks.length) out.push(...tasks.map((i) => issueLine(i, L)))
  return out.join('\n')
}

/** Resolves an optional "project" argument to a project, or a sprint's project. */
const projectArg = (L: Lookups, key: string | undefined) => (key ? findProjectByKey(L, key) : undefined)

export function registerManageTools(server: McpServer, d: Deps) {
  const { guard } = d

  // ───────────────────────────── people & projects ─────────────────────────────

  server.registerTool(
    'list_people',
    { title: 'Team members', description: 'Everyone in the workspace: name, email, title and the projects they belong to. Use names or emails wherever a tool asks for a person.', annotations: READ },
    guard(async () => {
      const { L } = await d.data()
      const rows = [...L.users.values()]
        .filter((u) => u.active !== false)
        .map((u) => {
          const projects = [...L.projects.values()].filter((p) => p.memberIds.includes(u.id)).map((p) => p.key)
          return `- ${u.name} <${u.email}>${u.title ? ` — ${u.title}` : ''}${projects.length ? ` · ${projects.join(', ')}` : ''}`
        })
      return text(rows.join('\n') || 'No members yet.')
    }),
  )

  server.registerTool(
    'list_projects',
    { title: 'Projects', description: 'Every project: key, name, team (Engineering or Other team), lead, members, running and planned sprints, open tasks.', annotations: READ },
    guard(async () => {
      const { L } = await d.data()
      const rows = [...L.projects.values()].map((p) => {
        const sprints = [...L.sprints.values()].filter((s) => s.projectId === p.id)
        const open = [...L.issues.values()].filter((i) => i.projectId === p.id && i.type !== 'epic' && L.status(i)?.category !== 'done').length
        const names = (st: string) => sprints.filter((s) => s.state === st).map((s) => s.name).join(', ') || 'none'
        return [
          `## ${p.key} · ${p.name} (${teamName(p)})`,
          p.description ? p.description.trim().split('\n')[0]! : null,
          `Lead: ${L.userName(p.leadId)} · Members: ${p.memberIds.map((m) => L.userName(m)).join(', ')}`,
          `Running: ${names('active')} · Planned: ${names('future')} · Open tasks: ${open}`,
        ]
          .filter(Boolean)
          .join('\n')
      })
      return text(rows.join('\n\n') || 'No projects yet. Create one with create_project.')
    }),
  )

  server.registerTool(
    'create_project',
    {
      title: 'Create a project',
      description: 'Create a project (it starts with one planned sprint). Engineering projects categorise each sprint as research or implementation.',
      inputSchema: {
        name: z.string().min(1).max(120),
        key: z.string().describe('2–10 letters/digits, e.g. ENG. Prefix for task keys (ENG-1).'),
        team: z.enum(['engineering', 'other']).describe('engineering = sprints are research or implementation; other = plain sprints'),
        description: z.string().max(4000).optional(),
        lead: z.string().optional().describe('Person (name or email); defaults to your owner'),
      },
    },
    guard(async (a) => {
      const { L } = await d.data()
      const actor = d.actor(L)
      const lead = a.lead ? findUser(L, a.lead, actor.memberId).id : undefined
      const { project, sprint } = await createProject(L, actor, { name: a.name, key: a.key, description: a.description, engineering: a.team === 'engineering', leadId: lead })
      return text(`Created ${project.key} · ${project.name} (${teamName(project as Project)}), with ${sprint.name} planned.\n${d.appUrl}/projects/${project.key}/sprints`)
    }),
  )

  server.registerTool(
    'update_project',
    {
      title: 'Edit a project',
      description: 'Rename a project, change its description, team (engineering/other), lead or repo, and add or remove members.',
      inputSchema: {
        project: z.string().describe('Project key or name'),
        name: z.string().optional(),
        description: z.string().max(4000).optional(),
        team: z.enum(['engineering', 'other']).optional(),
        lead: z.string().optional().describe('Person (name or email)'),
        add_members: z.array(z.string()).optional().describe('People to add (names or emails)'),
        remove_members: z.array(z.string()).optional(),
        repo: z.string().nullable().optional().describe('GitHub "owner/name"; null clears it'),
      },
    },
    guard(async (a) => {
      const { L } = await d.data()
      const actor = d.actor(L)
      const p = findProjectByKey(L, a.project)
      const who = (xs?: string[]) => xs?.map((x) => findUser(L, x, actor.memberId).id)
      await updateProject(L, actor, p, {
        name: a.name,
        description: a.description,
        engineering: a.team === undefined ? undefined : a.team === 'engineering',
        leadId: a.lead ? findUser(L, a.lead, actor.memberId).id : undefined,
        addMemberIds: who(a.add_members),
        removeMemberIds: who(a.remove_members),
        repo: a.repo,
      })
      return text(`${p.key} · ${p.name} (${teamName(p)}) · lead ${L.userName(p.leadId)} · members: ${p.memberIds.map((m) => L.userName(m)).join(', ')}`)
    }),
  )

  // ───────────────────────────── sprints ─────────────────────────────

  server.registerTool(
    'list_sprints',
    {
      title: 'Sprints in a project',
      description: "A project's sprints (running, then planned): dates, goal, task progress and, for engineering projects, the type plus each step's docs and presentation time.",
      inputSchema: {
        project: z.string().describe('Project key or name'),
        include_finished: z.boolean().default(false),
        include_tasks: z.boolean().default(false).describe('List each sprint’s tasks too'),
      },
      annotations: READ,
    },
    guard(async (a) => {
      const { L } = await d.data()
      const p = findProjectByKey(L, a.project)
      const order = { active: 0, future: 1, closed: 2 } as const
      const sprints = [...L.sprints.values()]
        .filter((s) => s.projectId === p.id && (a.include_finished || s.state !== 'closed'))
        .sort((x, y) => order[x.state] - order[y.state] || x.order - y.order)
      return text(sprints.length ? `# ${p.key} sprints (${teamName(p)})\n\n${sprints.map((s) => sprintBlock(s, L, a.include_tasks)).join('\n\n')}` : `${p.key} has no open sprints. Create one with create_sprint.`)
    }),
  )

  server.registerTool(
    'create_sprint',
    {
      title: 'Create a sprint',
      description: `Plan a new sprint. In engineering projects "type" is required (research or implementation), and you can fill in each step's Google Docs and presentation time now or later with update_sprint. ${WHEN}`,
      inputSchema: {
        project: z.string().describe('Project key or name'),
        name: z.string().optional().describe('Defaults to "<KEY> Sprint <n>"'),
        goal: z.string().max(2000).optional(),
        start: z.string().optional(),
        end: z.string().optional(),
        type: z.enum(['research', 'implementation']).optional(),
        steps: steps.optional(),
      },
    },
    guard(async (a) => {
      const { L } = await d.data()
      const p = findProjectByKey(L, a.project)
      const sprint = await createSprint(L, d.actor(L), p, { name: a.name, goal: a.goal, start: a.start, end: a.end, kind: a.type, steps: a.steps as Partial<Record<StepKey, StepInput>> })
      L.sprints.set(sprint.id, sprint)
      return text(`Created (planned, not started):\n\n${sprintBlock(sprint, L)}`)
    }),
  )

  server.registerTool(
    'update_sprint',
    {
      title: 'Edit a sprint',
      description: `Change a sprint's name, goal, dates, type, or its steps' Google Docs, presentation times and implementation date. Only the fields you pass change. ${WHEN}`,
      inputSchema: {
        sprint: z.string().describe('Sprint name or id'),
        project: z.string().optional().describe('Project key, if the sprint name is ambiguous'),
        name: z.string().optional(),
        goal: z.string().max(2000).optional(),
        start: z.string().nullable().optional(),
        end: z.string().nullable().optional(),
        type: z.enum(['research', 'implementation']).optional(),
        steps: steps.optional(),
      },
    },
    guard(async (a) => {
      const { L } = await d.data()
      const sprint = findSprint(L, a.sprint, projectArg(L, a.project))
      await updateSprint(L, d.actor(L), sprint, { name: a.name, goal: a.goal, start: a.start, end: a.end, kind: a.type, steps: a.steps as Partial<Record<StepKey, StepInput>> })
      return text(`Updated:\n\n${sprintBlock(sprint, L)}`)
    }),
  )

  server.registerTool(
    'start_sprint',
    {
      title: 'Start a sprint',
      description: `Start a planned sprint. Several sprints can run at once. Uses the sprint's dates, or now → two weeks. ${WHEN}`,
      inputSchema: { sprint: z.string().describe('Sprint name or id'), project: z.string().optional(), start: z.string().optional(), end: z.string().optional() },
    },
    guard(async (a) => {
      const { L } = await d.data()
      const sprint = findSprint(L, a.sprint, projectArg(L, a.project))
      await startSprint(L, d.actor(L), sprint, { start: a.start, end: a.end })
      return text(`Started:\n\n${sprintBlock(sprint, L)}`)
    }),
  )

  server.registerTool(
    'finish_sprint',
    {
      title: 'Finish a sprint',
      description: 'Finish a running sprint. Unfinished tasks move to another open sprint (default: the next planned one) or to a new sprint ("new").',
      inputSchema: {
        sprint: z.string().describe('Sprint name or id'),
        project: z.string().optional(),
        move_unfinished_to: z.string().optional().describe('Open sprint name/id, or "new". Default: next planned sprint, else a new one.'),
      },
    },
    guard(async (a) => {
      const { L } = await d.data()
      const sprint = findSprint(L, a.sprint, projectArg(L, a.project))
      const p = L.projects.get(sprint.projectId)!
      const next = [...L.sprints.values()].filter((s) => s.projectId === p.id && s.state === 'future').sort((x, y) => x.order - y.order)[0]
      const to = a.move_unfinished_to?.trim().toLowerCase() === 'new' ? 'new' : a.move_unfinished_to ? findSprint(L, a.move_unfinished_to, p) : (next ?? 'new')
      const r = await finishSprint(L, d.actor(L), sprint, to)
      return text(`${sprint.name} finished: ${r.completed} done${r.moved ? `, ${r.moved} unfinished moved to ${r.target.name}` : ''}.`)
    }),
  )

  server.registerTool(
    'delete_sprint',
    {
      title: 'Delete a planned sprint',
      description: "Delete a sprint that hasn't started. Its tasks are kept (they end up in no sprint).",
      inputSchema: { sprint: z.string().describe('Sprint name or id'), project: z.string().optional() },
      annotations: DESTROY,
    },
    guard(async (a) => {
      const { L } = await d.data()
      const sprint = findSprint(L, a.sprint, projectArg(L, a.project))
      const n = await deleteSprint(L, d.actor(L), sprint)
      return text(`Deleted ${sprint.name}.${n ? ` ${n} task${n === 1 ? '' : 's'} are now in no sprint.` : ''}`)
    }),
  )

  // ───────────────────────────── tasks ─────────────────────────────

  const resolveStatus = (p: Project, name: string) => {
    const n = name.trim().toLowerCase()
    const s = p.statuses.find((x) => x.name.toLowerCase() === n) ?? p.statuses.find((x) => x.category === ({ 'to do': 'todo', todo: 'todo', 'in progress': 'inprogress', done: 'done' } as Record<string, string>)[n])
    if (!s) throw new HttpError(400, `No status "${name}" in ${p.key}. Use one of: ${p.statuses.map((x) => x.name).join(', ')}`)
    return s.id
  }
  const none = (v: string) => ['none', 'null', ''].includes(v.trim().toLowerCase())
  const epicOf = (L: Lookups, p: Project, key: string) => {
    const e = findIssue(L, key)
    if (e.type !== 'epic' || e.projectId !== p.id) throw new HttpError(400, `${e.key} isn't an epic in ${p.key}`)
    return e.id
  }

  server.registerTool(
    'create_task',
    {
      title: 'Create a task',
      description: `Create a task, bug, epic or sub-task. It goes into the project's running sprint unless you name a sprint (or "none"). ${WHEN}`,
      inputSchema: {
        project: z.string().describe('Project key or name'),
        summary: z.string().min(1).max(255),
        description: z.string().max(20000).optional(),
        type: z.enum(['task', 'bug', 'epic', 'subtask']).default('task'),
        priority: z.enum(PRIORITIES).default('medium'),
        assignee: z.string().optional().describe('Name, email or "me" (your owner)'),
        sprint: z.string().optional().describe('Sprint name/id, or "none"'),
        story_points: z.number().min(0).max(999).optional(),
        labels: z.array(z.string()).optional(),
        due_date: z.string().optional(),
        status: z.string().optional().describe('Status name; defaults to the first to-do status'),
        epic: z.string().optional().describe('Epic key, e.g. SKB-3'),
        parent: z.string().optional().describe('Parent task key (for sub-tasks)'),
      },
    },
    guard(async (a) => {
      const { L } = await d.data()
      const actor = d.actor(L)
      const p = findProjectByKey(L, a.project)
      const parent = a.parent ? findIssue(L, a.parent) : undefined
      if (parent && parent.projectId !== p.id) throw new HttpError(400, `${parent.key} is in another project`)
      const issue = await createIssue(L, actor, p, {
        summary: a.summary,
        description: a.description,
        type: parent ? 'subtask' : a.type,
        priority: a.priority,
        assigneeId: a.assignee && !none(a.assignee) ? findUser(L, a.assignee, actor.memberId).id : null,
        sprintId: a.sprint === undefined ? undefined : none(a.sprint) ? null : findSprint(L, a.sprint, p).id,
        storyPoints: a.story_points ?? null,
        labels: a.labels,
        dueDate: a.due_date ? parseWhen(a.due_date) : null,
        statusId: a.status ? resolveStatus(p, a.status) : undefined,
        epicId: a.epic ? epicOf(L, p, a.epic) : undefined,
        parentId: parent?.id ?? null,
      })
      L.issues.set(issue.id, issue)
      return text(`Created ${issueLine(issue, L).slice(2)}\n${d.appUrl}/browse/${issue.key}`)
    }),
  )

  server.registerTool(
    'update_task',
    {
      title: 'Edit a task',
      description: `Change any field of a task: summary, description, type, priority, assignee, sprint, story points, labels, due date, status, epic or flag. Only the fields you pass change. ${WHEN}`,
      inputSchema: {
        key: z.string().describe('Task key, e.g. SKB-12'),
        summary: z.string().min(1).max(255).optional(),
        description: z.string().max(20000).optional(),
        type: z.enum(['task', 'bug', 'epic']).optional(),
        priority: z.enum(PRIORITIES).optional(),
        assignee: z.string().optional().describe('Name, email, "me", or "none" to unassign'),
        sprint: z.string().optional().describe('Sprint name/id, or "none"'),
        story_points: z.number().min(0).max(999).nullable().optional(),
        labels: z.array(z.string()).optional().describe('Replaces all labels'),
        add_labels: z.array(z.string()).optional(),
        remove_labels: z.array(z.string()).optional(),
        due_date: z.string().nullable().optional(),
        status: z.string().optional(),
        epic: z.string().optional().describe('Epic key, or "none"'),
        flagged: z.boolean().optional().describe('Flag as an impediment'),
      },
    },
    guard(async (a) => {
      const { L } = await d.data()
      const actor = d.actor(L)
      const issue = findIssue(L, a.key)
      const p = L.projects.get(issue.projectId)!
      const patch: Partial<Issue> = {}
      if (a.summary !== undefined) patch.summary = a.summary.trim()
      if (a.description !== undefined) patch.description = a.description
      if (a.type !== undefined) {
        if (issue.type === 'subtask') throw new HttpError(400, 'Sub-tasks stay sub-tasks')
        patch.type = a.type
      }
      if (a.priority !== undefined) patch.priority = a.priority
      if (a.assignee !== undefined) patch.assigneeId = none(a.assignee) ? null : findUser(L, a.assignee, actor.memberId).id
      if (a.sprint !== undefined) {
        if (issue.type === 'subtask') throw new HttpError(400, 'Sub-tasks follow their parent’s sprint; move the parent instead')
        patch.sprintId = none(a.sprint) ? null : findSprint(L, a.sprint, p).id
      }
      if (a.story_points !== undefined) patch.storyPoints = a.story_points
      let labels = a.labels ?? [...issue.labels]
      if (a.add_labels) labels = [...new Set([...labels, ...a.add_labels])]
      if (a.remove_labels) labels = labels.filter((l) => !a.remove_labels!.includes(l))
      if (a.labels || a.add_labels || a.remove_labels) patch.labels = labels
      if (a.due_date !== undefined) patch.dueDate = a.due_date ? parseWhen(a.due_date) : null
      if (a.status !== undefined) patch.statusId = resolveStatus(p, a.status)
      if (a.epic !== undefined) patch.epicId = none(a.epic) ? null : epicOf(L, p, a.epic)
      if (a.flagged !== undefined) patch.flagged = a.flagged
      const changed = await updateIssue(L, actor, issue, patch)
      return text(changed ? `Updated ${issueLine(issue, L).slice(2)}` : `${issue.key} already looks like that; nothing changed.`)
    }),
  )

  server.registerTool(
    'delete_task',
    {
      title: 'Delete a task',
      description: 'Delete a task with its sub-tasks and comments. Only do this when your owner asks.',
      inputSchema: { key: z.string().describe('Task key, e.g. SKB-12') },
      annotations: DESTROY,
    },
    guard(async (a) => {
      const { L } = await d.data()
      const issue = findIssue(L, a.key)
      const n = await deleteIssue(L, d.actor(L), issue)
      return text(`Deleted ${issue.key}${n > 1 ? ` and ${n - 1} sub-task${n === 2 ? '' : 's'}` : ''}.`)
    }),
  )

  // ───────────────────────────── team calendar ─────────────────────────────

  server.registerTool(
    'list_events',
    {
      title: 'Team calendar',
      description: `Team events (with ids for editing) plus sprint dates and engineering presentations, between two dates. Defaults to the next 30 days. ${WHEN}`,
      inputSchema: { from: z.string().optional(), to: z.string().optional(), project: z.string().optional().describe('Only this project (key or name)') },
      annotations: READ,
    },
    guard(async (a) => {
      const { L } = await d.data()
      const p = projectArg(L, a.project)
      const from = Date.parse(a.from ? parseWhen(a.from, '00:00') : new Date(Date.now() - 86_400_000).toISOString())
      const to = Date.parse(a.to ? parseWhen(a.to, '23:59') : new Date(Date.now() + 30 * 86_400_000).toISOString())
      const inRange = (iso: string | null | undefined) => !!iso && Date.parse(iso) >= from && Date.parse(iso) <= to
      const events = [...L.events.values()]
        .filter((e) => inRange(e.start) && (!p || e.projectId === p.id))
        .sort((x, y) => x.start.localeCompare(y.start))
        .map((e) => `- ${showWhen(e.start)} · ${e.durationMinutes} min · ${e.title}${e.projectId ? ` · ${L.projects.get(e.projectId)?.key ?? ''}` : ''}${e.location ? ` · ${e.location}` : ''} · id: ${e.id}`)
      const derived: [string, string][] = []
      for (const s of L.sprints.values()) {
        const sp = L.projects.get(s.projectId)
        if (s.state === 'closed' || !sp || (p && sp.id !== p.id)) continue
        if (inRange(s.startDate)) derived.push([s.startDate!, `${showWhen(s.startDate, false)} · ${s.name} starts`])
        if (inRange(s.endDate)) derived.push([s.endDate!, `${showWhen(s.endDate, false)} · ${s.name} ends`])
        if (sp.engineering && s.kind)
          for (const key of STEP_KEYS[s.kind]) {
            const st = s.steps?.[key]
            if (inRange(st?.presentAt)) derived.push([st!.presentAt!, `${showWhen(st!.presentAt)} · ${key} presentation · ${s.name}`])
            if (inRange(st?.date)) derived.push([st!.date!, `${showWhen(st!.date, false)} · ${s.name} implementation`])
          }
      }
      derived.sort((x, y) => x[0].localeCompare(y[0]))
      const out = [`Team events (${showWhen(new Date(from).toISOString(), false)} → ${showWhen(new Date(to).toISOString(), false)}):`, ...(events.length ? events : ['- none'])]
      if (derived.length) out.push('', 'From sprints (change these with update_sprint):', ...derived.map(([, t]) => `- ${t}`))
      return text(out.join('\n'))
    }),
  )

  const eventSchema = {
    title: z.string().min(1).max(300),
    start: z.string().describe('Start time'),
    duration_minutes: z.number().int().min(5).max(1440).default(30),
    description: z.string().max(7000).optional(),
    location: z.string().max(500).optional().describe('Room or meeting link'),
    project: z.string().optional().describe('Project key or name, if it belongs to one'),
  }

  server.registerTool(
    'create_event',
    {
      title: 'Add a team calendar event',
      description: `Add an event to the shared team calendar. It's copied to every member's Google Calendar automatically. ${WHEN}`,
      inputSchema: eventSchema,
    },
    guard(async (a) => {
      const { L } = await d.data()
      const p = projectArg(L, a.project)
      const e = await createEvent(d.actor(L), { title: a.title, start: a.start, durationMinutes: a.duration_minutes, description: a.description, location: a.location, projectId: p?.id ?? null })
      return text(`Added "${e.title}" on ${showWhen(e.start)} for ${e.durationMinutes} min (id: ${e.id}).`)
    }),
  )

  server.registerTool(
    'update_event',
    {
      title: 'Edit a team calendar event',
      description: `Change a team event's title, time, length, description, location or project. Only the fields you pass change. Get ids from list_events. ${WHEN}`,
      inputSchema: {
        id: z.string().describe('Event id from list_events'),
        title: z.string().min(1).max(300).optional(),
        start: z.string().optional(),
        duration_minutes: z.number().int().min(5).max(1440).optional(),
        description: z.string().max(7000).optional(),
        location: z.string().max(500).optional(),
        project: z.string().optional().describe('Project key/name, or "none"'),
      },
    },
    guard(async (a) => {
      const { L } = await d.data()
      const e = L.events.get(a.id)
      if (!e) throw new HttpError(404, `No team event ${a.id}. Use list_events for ids.`)
      await updateEvent(d.actor(L), e, {
        title: a.title,
        start: a.start,
        durationMinutes: a.duration_minutes,
        description: a.description,
        location: a.location,
        projectId: a.project === undefined ? undefined : none(a.project) ? null : findProjectByKey(L, a.project).id,
      })
      return text(`Updated "${e.title}": ${showWhen(e.start)} for ${e.durationMinutes} min.`)
    }),
  )

  server.registerTool(
    'delete_event',
    {
      title: 'Delete a team calendar event',
      description: "Remove a team event (it's removed from members' Google Calendars too).",
      inputSchema: { id: z.string().describe('Event id from list_events') },
      annotations: DESTROY,
    },
    guard(async (a) => {
      const { L } = await d.data()
      const e = L.events.get(a.id)
      if (!e) throw new HttpError(404, `No team event ${a.id}. Use list_events for ids.`)
      await deleteEvent(d.actor(L), e)
      return text(`Deleted "${e.title}" (${showWhen(e.start)}).`)
    }),
  )

  // ───────────────────────────── meetings ─────────────────────────────

  server.registerTool(
    'list_meetings',
    {
      title: 'Meeting history',
      description: 'Past meetings, newest first, with how many suggested tasks are still waiting for review.',
      inputSchema: { project: z.string().optional(), limit: z.number().int().min(1).max(100).default(20) },
      annotations: READ,
    },
    guard(async (a) => {
      const { L } = await d.data()
      const p = projectArg(L, a.project)
      const list = [...L.meetings.values()]
        .filter((m) => !p || m.projectId === p.id)
        .sort((x, y) => y.date.localeCompare(x.date))
        .slice(0, a.limit)
      return text(
        list.length
          ? list.map((m) => `- ${showWhen(m.date, false)} · ${m.title}${m.projectId ? ` · ${L.projects.get(m.projectId)?.key ?? ''}` : ''} · ${(m.suggestions ?? []).filter((s) => !s.issueId && !s.dismissed).length} suggested tasks to review · id: ${m.id}`).join('\n')
          : 'No meetings yet.',
      )
    }),
  )

  server.registerTool(
    'get_meeting',
    {
      title: 'Meeting notes',
      description: 'One meeting: summary, key points, decisions, open questions, attendees, and suggested tasks (with ids for add_meeting_task / dismiss_meeting_task).',
      inputSchema: { id: z.string() },
      annotations: READ,
    },
    guard(async (a) => {
      const { L } = await d.data()
      const m = L.meetings.get(a.id)
      if (!m) throw new HttpError(404, `No meeting ${a.id}. Use list_meetings for ids.`)
      const list = (title: string, xs: string[]) => (xs?.length ? ['', `## ${title}`, ...xs.map((x) => `- ${x}`)] : [])
      const sug = (m.suggestions ?? []).map((s) => {
        const state = s.issueId ? `added as ${L.issues.get(s.issueId)?.key ?? 'a task'}` : s.dismissed ? 'dismissed' : 'waiting'
        return `- [${state}] ${s.summary} (${s.type}, ${s.priority}, ${L.userName(s.assigneeId)}, ${s.sprintId ? (L.sprints.get(s.sprintId)?.name ?? 'sprint') : 'no sprint'}) · id: ${s.id}${s.rationale ? `\n  “${s.rationale}”` : ''}`
      })
      return text(
        [
          `# ${m.title}`,
          `${showWhen(m.date, false)}${m.projectId ? ` · ${L.projects.get(m.projectId)?.key ?? ''}` : ''} · ${d.appUrl}/meetings/${m.id}`,
          '',
          m.summary,
          ...list('Key points', m.keyPoints),
          ...list('Decisions', m.decisions),
          ...list('Open questions', m.openQuestions),
          ...list('Attendees', m.attendees),
          ...(sug.length ? ['', '## Suggested tasks', ...sug] : []),
        ].join('\n'),
      )
    }),
  )

  server.registerTool(
    'create_meeting',
    {
      title: 'Add meeting notes from a transcript',
      description: 'Save a meeting from its transcript text. The team gets a summary, decisions, open questions and suggested tasks, like uploading it in the app.',
      inputSchema: {
        transcript: z.string().min(20).max(400_000),
        title: z.string().max(200).optional(),
        date: z.string().optional().describe('When it happened; defaults to now'),
        project: z.string().optional().describe('Project key or name'),
      },
    },
    guard(async (a) => {
      const { L } = await d.data()
      const actor = d.actor(L)
      const p = projectArg(L, a.project)
      const m = await createMeeting({ transcript: a.transcript, title: a.title, date: a.date ? parseWhen(a.date) : undefined, projectId: p?.id ?? null, fileName: 'agent-transcript.txt' }, actor.clerkId, actor.memberId)
      return text(`Saved "${m.title}" (id: ${m.id}) with ${m.suggestions.length} suggested task${m.suggestions.length === 1 ? '' : 's'}. Read it with get_meeting.\n${d.appUrl}/meetings/${m.id}`)
    }),
  )

  const suggestionOf = (L: Lookups, meetingId: string, suggestionId: string) => {
    const m = L.meetings.get(meetingId)
    if (!m) throw new HttpError(404, `No meeting ${meetingId}`)
    const s = (m.suggestions ?? []).find((x) => x.id === suggestionId)
    if (!s) throw new HttpError(404, `No suggested task ${suggestionId} in that meeting. Use get_meeting for ids.`)
    return { m, s }
  }

  server.registerTool(
    'add_meeting_task',
    {
      title: 'Turn a suggested task into a real task',
      description: 'Create the task a meeting suggested. You can override the project, sprint and assignee.',
      inputSchema: {
        meeting: z.string().describe('Meeting id'),
        suggestion: z.string().describe('Suggested task id from get_meeting'),
        project: z.string().optional().describe("Defaults to the meeting's project"),
        sprint: z.string().optional().describe('Sprint name/id, or "none"'),
        assignee: z.string().optional().describe('Name, email, "me" or "none"'),
      },
    },
    guard(async (a) => {
      const { L } = await d.data()
      const actor = d.actor(L)
      const { m, s } = suggestionOf(L, a.meeting, a.suggestion)
      if (s.issueId) throw new HttpError(409, `Already added as ${L.issues.get(s.issueId)?.key ?? 'a task'}`)
      const p = a.project ? findProjectByKey(L, a.project) : m.projectId ? L.projects.get(m.projectId) : s.sprintId ? L.projects.get(L.sprints.get(s.sprintId)?.projectId ?? '') : undefined
      if (!p) throw new HttpError(400, 'Which project? Pass "project".')
      const suggestedSprint = s.sprintId && L.sprints.get(s.sprintId)?.projectId === p.id ? s.sprintId : undefined
      const issue = await createIssue(L, actor, p, {
        summary: s.summary,
        description: [s.description, s.rationale ? `From the meeting “${m.title}”: “${s.rationale}”` : `From the meeting “${m.title}”.`].filter(Boolean).join('\n\n'),
        type: s.type,
        priority: s.priority,
        assigneeId: a.assignee ? (none(a.assignee) ? null : findUser(L, a.assignee, actor.memberId).id) : s.assigneeId,
        sprintId: a.sprint === undefined ? suggestedSprint : none(a.sprint) ? null : findSprint(L, a.sprint, p).id,
        storyPoints: s.storyPoints,
      })
      await applyOps([{ c: 'meetings', id: m.id, op: 'patch', d: { suggestions: m.suggestions.map((x) => (x.id === s.id ? { ...x, issueId: issue.id } : x)) } }], actor.clerkId)
      L.issues.set(issue.id, issue)
      return text(`Created ${issueLine(issue, L).slice(2)}\n${d.appUrl}/browse/${issue.key}`)
    }),
  )

  server.registerTool(
    'dismiss_meeting_task',
    {
      title: 'Dismiss a suggested task',
      description: "Mark a meeting's suggested task as not needed.",
      inputSchema: { meeting: z.string(), suggestion: z.string() },
    },
    guard(async (a) => {
      const { L } = await d.data()
      const { m, s } = suggestionOf(L, a.meeting, a.suggestion)
      await applyOps([{ c: 'meetings', id: m.id, op: 'patch', d: { suggestions: m.suggestions.map((x) => (x.id === s.id ? { ...x, dismissed: true } : x)) } }], d.actor(L).clerkId)
      return text(`Dismissed "${s.summary}".`)
    }),
  )

  server.registerTool(
    'update_meeting',
    {
      title: 'Edit a meeting',
      description: "Change a meeting's title, date or project.",
      inputSchema: { id: z.string(), title: z.string().min(1).max(200).optional(), date: z.string().optional(), project: z.string().optional().describe('Project key/name, or "none"') },
    },
    guard(async (a) => {
      const { L } = await d.data()
      const m = L.meetings.get(a.id)
      if (!m) throw new HttpError(404, `No meeting ${a.id}`)
      const patch: Record<string, unknown> = {}
      if (a.title !== undefined) patch.title = a.title.trim()
      if (a.date !== undefined) patch.date = parseWhen(a.date)
      if (a.project !== undefined) patch.projectId = none(a.project) ? null : findProjectByKey(L, a.project).id
      if (Object.keys(patch).length) await applyOps([{ c: 'meetings', id: m.id, op: 'patch', d: patch }], d.actor(L).clerkId)
      Object.assign(m, patch)
      return text(`Meeting "${m.title}" · ${showWhen(m.date, false)}${m.projectId ? ` · ${L.projects.get(m.projectId)?.key ?? ''}` : ''}`)
    }),
  )

  server.registerTool(
    'delete_meeting',
    {
      title: 'Delete a meeting',
      description: "Remove a meeting from the team's history. Tasks already created from it stay.",
      inputSchema: { id: z.string() },
      annotations: DESTROY,
    },
    guard(async (a) => {
      const { L } = await d.data()
      const m = L.meetings.get(a.id)
      if (!m) throw new HttpError(404, `No meeting ${a.id}`)
      await applyOps([{ c: 'meetings', id: m.id, op: 'delete' }], d.actor(L).clerkId)
      return text(`Deleted the meeting "${m.title}".`)
    }),
  )
}
