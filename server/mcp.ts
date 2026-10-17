import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { z } from 'zod'
import { HttpError } from './auth.js'
import { requireAgent, setCurrentIssue, type AgentRow } from './agents.js'
import { waitUntil } from '@vercel/functions'
import { docLine, docsOverview, docStats, docsConfigured, ensureFreshDocs, getDoc, listDocs, searchDocs } from './docs.js'
import { addComment, issueLine, loadSnapshot, lookups, patchIssue, renderIssue, sortTasks, sprintPlanLines, type Issue, type Lookups, type Project, type Snapshot } from './workspace.js'

/**
 * skatebored MCP server (Streamable HTTP, stateless: one server per request).
 * Every request is authenticated by a personal agent token, so each agent knows
 * its owner, works only as that owner, and has one current task.
 */

const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] })
const fail = (t: string) => ({ content: [{ type: 'text' as const, text: t }], isError: true })

interface Ctx {
  agent: AgentRow
  appUrl: string
  /** Lazily loaded, refreshed after writes. */
  data: () => Promise<{ s: Snapshot; L: Lookups }>
  owner: (L: Lookups) => { memberId: string; clerkId: string; name: string; email: string; title: string }
}

function findProject(L: Lookups, key: string | undefined, fallback?: Issue | null): Project | undefined {
  if (key) return [...L.projects.values()].find((p) => p.key.toUpperCase() === key.toUpperCase())
  if (fallback) return L.projects.get(fallback.projectId)
  const all = [...L.projects.values()]
  return all.length === 1 ? all[0] : undefined
}

function resolveStatus(p: Project, name: string) {
  const n = name.trim().toLowerCase()
  return (
    p.statuses.find((s) => s.name.toLowerCase() === n) ??
    p.statuses.find((s) => s.category === ({ 'to do': 'todo', todo: 'todo', 'in progress': 'inprogress', done: 'done' } as Record<string, string>)[n])
  )
}

/** Turns a task summary into an OR query, so related docs match on any meaningful word. */
const relatedQuery = (i: Issue) =>
  [...new Set(`${i.summary} ${i.labels.join(' ')}`.toLowerCase().match(/[a-z0-9]{4,}/g) ?? [])].slice(0, 12).join(' or ')

async function relatedDocs(i: Issue) {
  if (!docsConfigured()) return ''
  const q = relatedQuery(i)
  const hits = q ? await searchDocs(q, 4).catch(() => []) : []
  return hits.length ? `\n\n## Possibly related team docs\n\nRead with get_doc if relevant:\n${hits.map((d) => `- ${d.path} · id: ${d.id}`).join('\n')}` : ''
}

function build(ctx: Ctx, intro: string) {
  const server = new McpServer({ name: 'skatebored', version: '1.0.0' }, { instructions: intro })

  /** Resolves an issue key, defaulting to this agent's current task. */
  const target = async (key: string | undefined) => {
    const { L } = await ctx.data()
    const id = key ? L.byKey.get(key.trim().toUpperCase())?.id : ctx.agent.current_issue_id
    const issue = id ? L.issues.get(id) : undefined
    if (!issue) throw new HttpError(404, key ? `No issue ${key}` : 'You have no current task. Call list_my_tasks, then start_task with a key (or ask your owner to hand you one).')
    return { issue, L }
  }
  const guard = <A>(fn: (a: A) => Promise<ReturnType<typeof text>>) => async (a: A) => {
    try {
      return await fn(a)
    } catch (e) {
      if (e instanceof HttpError) return fail(e.message)
      console.error('[mcp] tool failed', e)
      return fail('Something went wrong on the skatebored server. Try again.')
    }
  }

  server.registerTool(
    'whoami',
    {
      title: 'Who am I working for',
      description: 'Your identity: agent name, the human owner you act for, your current task, and the projects your owner belongs to. Call this first in a new session.',
      annotations: { readOnlyHint: true },
    },
    guard(async () => {
      const { L } = await ctx.data()
      const o = ctx.owner(L)
      const cur = ctx.agent.current_issue_id ? L.issues.get(ctx.agent.current_issue_id) : undefined
      const projects = [...L.projects.values()].filter((p) => p.memberIds.includes(o.memberId))
      return text(
        [
          `Agent: ${ctx.agent.name}`,
          `Owner: ${o.name} <${o.email}>${o.title ? ` — ${o.title}` : ''}`,
          `You act on behalf of ${o.name}. Status changes and comments you make are recorded as ${o.name}'s, labelled with your agent name.`,
          `Current task: ${cur ? `${cur.key} — ${cur.summary} [${L.status(cur)?.name}]` : 'none (use list_my_tasks, then start_task)'}`,
          `Projects: ${projects.map((p) => `${p.key} (${p.name})`).join(', ') || 'none'}`,
          `Workspace: ${ctx.appUrl}`,
        ].join('\n'),
      )
    }),
  )

  server.registerTool(
    'get_current_task',
    {
      title: 'Get my current task',
      description: 'The specific task your owner handed you (or you started), with everything needed to do it: description, acceptance criteria, sprint goal, epic, sub-tasks, linked issues, recent comments, branch name and workflow.',
      annotations: { readOnlyHint: true },
    },
    guard(async () => {
      const { L } = await ctx.data()
      const cur = ctx.agent.current_issue_id ? L.issues.get(ctx.agent.current_issue_id) : undefined
      if (!cur) {
        const o = ctx.owner(L)
        const mine = sortTasks([...L.issues.values()].filter((i) => i.assigneeId === o.memberId && L.status(i)?.category !== 'done' && i.type !== 'epic'), L).slice(0, 10)
        return text(
          `No task has been handed to you yet.\n\n${o.name}'s open tasks:\n${mine.map((i) => issueLine(i, L)).join('\n') || '- none'}\n\nAsk ${o.name} which to take, or call start_task with a key.`,
        )
      }
      return text(`This is your current task, assigned by ${ctx.owner(L).name}.\n\n${await renderIssue(cur, L, ctx.appUrl)}${await relatedDocs(cur)}`)
    }),
  )

  server.registerTool(
    'list_my_tasks',
    {
      title: "List my owner's tasks",
      description: "Issues assigned to your owner, open work first (in progress, then to do), sorted by priority and board rank. Defaults to the active sprint.",
      inputSchema: {
        scope: z.enum(['active_sprint', 'all_open', 'all']).default('active_sprint').describe('active_sprint = open issues in active sprints; all_open = every open issue incl. backlog; all = include done'),
        project: z.string().optional().describe('Project key, e.g. SKB'),
      },
      annotations: { readOnlyHint: true },
    },
    guard(async ({ scope, project }) => {
      const { L } = await ctx.data()
      const o = ctx.owner(L)
      const p = project ? findProject(L, project) : undefined
      if (project && !p) return fail(`No project ${project}`)
      const list = [...L.issues.values()].filter(
        (i) =>
          i.assigneeId === o.memberId &&
          i.type !== 'epic' &&
          (!p || i.projectId === p.id) &&
          (scope === 'all' || L.status(i)?.category !== 'done') &&
          (scope !== 'active_sprint' || (i.sprintId && L.sprints.get(i.sprintId)?.state === 'active')),
      )
      const cur = ctx.agent.current_issue_id
      return text(
        list.length
          ? `${o.name}'s tasks (${scope.replace('_', ' ')}):\n${sortTasks(list, L)
              .map((i) => issueLine(i, L) + (i.id === cur ? '  ← your current task' : ''))
              .join('\n')}`
          : `${o.name} has no ${scope === 'all' ? '' : 'open '}tasks${scope === 'active_sprint' ? ' in the active sprint' : ''}. Try scope "all_open", or search_issues for unassigned work.`,
      )
    }),
  )

  server.registerTool(
    'get_issue',
    {
      title: 'Get an issue',
      description: 'Full context for any issue by key (e.g. SKB-12): description, epic, sub-tasks, links, comments and workflow.',
      inputSchema: { key: z.string().describe('Issue key, e.g. SKB-12') },
      annotations: { readOnlyHint: true },
    },
    guard(async ({ key }) => {
      const { issue, L } = await target(key)
      return text(await renderIssue(issue, L, ctx.appUrl))
    }),
  )

  server.registerTool(
    'get_project_context',
    {
      title: 'Get project context',
      description: 'What the project is and where it stands: description, repo, workflow, active sprint goal and progress, epics, and the team (who owns what). Defaults to the project of your current task.',
      inputSchema: { project: z.string().optional().describe('Project key, e.g. SKB') },
      annotations: { readOnlyHint: true },
    },
    guard(async ({ project }) => {
      const { L } = await ctx.data()
      const cur = ctx.agent.current_issue_id ? L.issues.get(ctx.agent.current_issue_id) : null
      const p = findProject(L, project, cur)
      if (!p) return fail(project ? `No project ${project}` : `Several projects exist; pass one of: ${[...L.projects.values()].map((x) => x.key).join(', ')}`)
      const issues = [...L.issues.values()].filter((i) => i.projectId === p.id)
      const sprints = [...L.sprints.values()].filter((s) => s.projectId === p.id)
      const active = sprints.filter((s) => s.state === 'active')
      const cat = (i: Issue) => L.status(i)?.category
      const pts = (l: Issue[]) => l.reduce((n, i) => n + (i.storyPoints ?? 0), 0)
      const out = [`# ${p.name} (${p.key})`, '', p.description.trim() || '_No description._', '']
      out.push(`Lead: ${L.userName(p.leadId)}${p.repo ? ` · Repo: https://github.com/${p.repo}` : ''}`)
      out.push(`Workflow: ${p.statuses.map((s) => s.name).join(' → ')}`)
      for (const s of active) {
        const work = issues.filter((i) => i.sprintId === s.id && i.type !== 'epic')
        const done = work.filter((i) => cat(i) === 'done')
        out.push('', `## Active sprint: ${s.name}`, '')
        if (s.goal) out.push(`Goal: ${s.goal}`)
        out.push(`Dates: ${s.startDate?.slice(0, 10) ?? '—'} → ${s.endDate?.slice(0, 10) ?? '—'}`)
        if (p.engineering) out.push(...sprintPlanLines(s))
        out.push(`Progress: ${done.length}/${work.length} issues done${p.estimation === 'points' ? `, ${pts(done)}/${pts(work)} points` : ''}`)
        out.push('', ...sortTasks(work, L).map((i) => issueLine(i, L)))
      }
      if (!active.length) out.push('', 'No active sprint.')
      const next = sprints.filter((s) => s.state === 'future').sort((a, b) => a.order - b.order)[0]
      if (next) out.push('', `Next sprint: ${next.name} (${issues.filter((i) => i.sprintId === next.id).length} issues planned)${next.goal ? ` · Goal: ${next.goal}` : ''}`)
      const epics = issues.filter((i) => i.type === 'epic')
      if (epics.length) {
        out.push('', '## Epics', '')
        for (const e of epics) {
          const kids = issues.filter((i) => i.epicId === e.id)
          out.push(`- ${e.key} ${e.summary} [${L.status(e)?.name}] — ${kids.filter((k) => cat(k) === 'done').length}/${kids.length} done`)
        }
      }
      out.push('', '## Team', '')
      for (const id of p.memberIds) {
        const u = L.users.get(id)
        if (!u) continue
        const open = issues.filter((i) => i.assigneeId === id && cat(i) !== 'done' && i.type !== 'epic').length
        out.push(`- ${u.name}${u.title ? ` (${u.title})` : ''}: ${open} open issue${open === 1 ? '' : 's'}`)
      }
      return text(out.join('\n'))
    }),
  )

  server.registerTool(
    'search_issues',
    {
      title: 'Search issues',
      description: 'Find issues by text and filters. Use it to find related work or unassigned tasks.',
      inputSchema: {
        text: z.string().optional().describe('Words to match in key, summary or description'),
        project: z.string().optional(),
        status: z.enum(['open', 'todo', 'inprogress', 'done', 'any']).default('open'),
        assignee: z.enum(['owner', 'unassigned', 'anyone']).default('anyone'),
        sprint: z.enum(['active', 'backlog', 'any']).default('any'),
        type: z.enum(['epic', 'task', 'bug', 'subtask']).optional(),
        limit: z.number().int().min(1).max(100).default(30),
      },
      annotations: { readOnlyHint: true },
    },
    guard(async (q) => {
      const { L } = await ctx.data()
      const o = ctx.owner(L)
      const p = q.project ? findProject(L, q.project) : undefined
      if (q.project && !p) return fail(`No project ${q.project}`)
      const words = (q.text ?? '').toLowerCase().split(/\s+/).filter(Boolean)
      const hits = [...L.issues.values()].filter((i) => {
        const c = L.status(i)?.category
        if (p && i.projectId !== p.id) return false
        if (q.type && i.type !== q.type) return false
        if (q.status === 'open' ? c === 'done' : q.status !== 'any' && c !== q.status) return false
        if (q.assignee === 'owner' && i.assigneeId !== o.memberId) return false
        if (q.assignee === 'unassigned' && i.assigneeId) return false
        if (q.sprint === 'active' && !(i.sprintId && L.sprints.get(i.sprintId)?.state === 'active')) return false
        if (q.sprint === 'backlog' && i.sprintId) return false
        const hay = `${i.key} ${i.summary} ${i.description} ${i.labels.join(' ')}`.toLowerCase()
        return words.every((w) => hay.includes(w))
      })
      const shown = sortTasks(hits, L).slice(0, q.limit)
      return text(hits.length ? `${hits.length} issue${hits.length === 1 ? '' : 's'}${hits.length > shown.length ? `, showing ${shown.length}` : ''}:\n${shown.map((i) => issueLine(i, L)).join('\n')}` : 'No matching issues.')
    }),
  )

  server.registerTool(
    'start_task',
    {
      title: 'Start a task',
      description: "Make an issue your current task. Assigns it to your owner if it's unassigned and moves it to the first in-progress status. Fails if it's assigned to someone else.",
      inputSchema: {
        key: z.string().describe('Issue key, e.g. SKB-12'),
        move_to_in_progress: z.boolean().default(true),
      },
    },
    guard(async ({ key, move_to_in_progress }) => {
      const { issue, L } = await target(key)
      const o = ctx.owner(L)
      if (issue.assigneeId && issue.assigneeId !== o.memberId) return fail(`${issue.key} is assigned to ${L.userName(issue.assigneeId)}, not ${o.name}. Ask ${o.name} before taking it.`)
      const p = L.projects.get(issue.projectId)
      const patch: { assigneeId?: string; statusId?: string } = {}
      if (!issue.assigneeId) patch.assigneeId = o.memberId
      const status = L.status(issue)
      if (move_to_in_progress && status?.category === 'todo') {
        const prog = p?.statuses.find((s) => s.category === 'inprogress')
        if (prog) patch.statusId = prog.id
      }
      if (Object.keys(patch).length) await patchIssue(issue, patch, o, L)
      await setCurrentIssue(ctx.agent.id, issue.id)
      ctx.agent.current_issue_id = issue.id
      return text(`${issue.key} is now your current task (status: ${L.status(issue)?.name}, assignee: ${L.userName(issue.assigneeId)}).\n\n${await renderIssue(issue, L, ctx.appUrl)}${await relatedDocs(issue)}`)
    }),
  )

  server.registerTool(
    'update_task_status',
    {
      title: 'Change task status',
      description: 'Move an issue to another workflow status by name (e.g. "In Progress", "In Review", "Done"). Defaults to your current task.',
      inputSchema: {
        status: z.string().describe('Target status name'),
        key: z.string().optional().describe('Issue key; omit for your current task'),
      },
    },
    guard(async ({ status, key }) => {
      const { issue, L } = await target(key)
      const p = L.projects.get(issue.projectId)!
      const to = resolveStatus(p, status)
      if (!to) return fail(`No status "${status}" in ${p.key}. Use one of: ${p.statuses.map((s) => s.name).join(', ')}`)
      const from = L.status(issue)?.name
      if (to.id === issue.statusId) return text(`${issue.key} is already ${to.name}.`)
      await patchIssue(issue, { statusId: to.id }, ctx.owner(L), L)
      return text(`${issue.key}: ${from} → ${to.name}`)
    }),
  )

  server.registerTool(
    'add_comment',
    {
      title: 'Comment on a task',
      description: 'Post a progress update, question or summary on an issue, visible to the whole team. Signed with your agent name. Defaults to your current task.',
      inputSchema: {
        body: z.string().min(1).max(8000),
        key: z.string().optional().describe('Issue key; omit for your current task'),
      },
    },
    guard(async ({ body, key }) => {
      const { issue, L } = await target(key)
      await addComment(issue, `🤖 ${ctx.agent.name}: ${body.trim()}`, ctx.owner(L))
      return text(`Comment posted on ${issue.key}.`)
    }),
  )

  server.registerTool(
    'complete_task',
    {
      title: 'Finish my current task',
      description: 'Hand your current task back for review: posts your summary as a comment, moves it to "In Review" (or the status you name), and clears your current task.',
      inputSchema: {
        summary: z.string().min(1).max(8000).describe('What you changed, how to verify it, and anything left open (include branch / PR link)'),
        status: z.string().default('In Review'),
      },
    },
    guard(async ({ summary, status }) => {
      const { issue, L } = await target(undefined)
      const p = L.projects.get(issue.projectId)!
      const to = resolveStatus(p, status) ?? p.statuses.find((s) => s.category === 'done')
      const o = ctx.owner(L)
      await addComment(issue, `🤖 ${ctx.agent.name}: ${summary.trim()}`, o)
      if (to && to.id !== issue.statusId) await patchIssue(issue, { statusId: to.id }, o, L)
      await setCurrentIssue(ctx.agent.id, null)
      ctx.agent.current_issue_id = null
      return text(`${issue.key} → ${to?.name ?? L.status(issue)?.name}. Summary posted. You have no current task now; call get_current_task or list_my_tasks for the next one.`)
    }),
  )

  server.registerTool(
    'search_docs',
    {
      title: 'Search team docs',
      description:
        "Full-text search over the team's Google Drive knowledge base (docs, sheets, slides, PDFs). Returns the best-matching files with highlighted snippets. Supports quotes for phrases, 'or', and -word to exclude. Use get_doc to read a file.",
      inputSchema: {
        query: z.string().min(1).describe('What you are looking for, e.g. "pricing for schools" or onboarding or welcome'),
        limit: z.number().int().min(1).max(25).default(8),
      },
      annotations: { readOnlyHint: true },
    },
    guard(async ({ query, limit }) => {
      if (!docsConfigured()) return fail('No knowledge base is connected to this workspace.')
      const hits = await searchDocs(query, limit)
      if (!hits.length) return text(`No docs match "${query}". Try fewer or different words, or list_docs to browse.`)
      return text(
        hits
          .map((d) => `${docLine(d)}\n  ${d.url}\n  ${(d.snippet ?? '').replace(/\s+/g, ' ').trim() || '(no text)'}`)
          .join('\n\n'),
      )
    }),
  )

  server.registerTool(
    'get_doc',
    {
      title: 'Read a team doc',
      description: 'Read a file from the team knowledge base by its id (from search_docs/list_docs) or its name/path. Long files come in pages: pass offset to continue.',
      inputSchema: {
        doc: z.string().min(1).describe('Doc id, file name, or path'),
        offset: z.number().int().min(0).default(0).describe('Character offset to start from'),
        length: z.number().int().min(1000).max(60000).default(30000).describe('Characters to return'),
      },
      annotations: { readOnlyHint: true },
    },
    guard(async ({ doc, offset, length }) => {
      if (!docsConfigured()) return fail('No knowledge base is connected to this workspace.')
      const d = await getDoc(doc)
      if (!d) return fail(`No doc matches "${doc}". Use search_docs or list_docs to find it.`)
      const end = Math.min(d.chars, offset + length)
      const head = `# ${d.path}\nLink: ${d.url}${d.modified_at ? ` · Last edited ${d.modified_at.toISOString().slice(0, 10)}` : ''}${d.note ? `\nNote: ${d.note}` : ''}`
      if (!d.chars) return text(`${head}\n\n(No text could be extracted from this file.)`)
      const more = end < d.chars ? `\n\n[Showing characters ${offset}–${end} of ${d.chars}. Call get_doc with offset ${end} for more.]` : ''
      return text(`${head}\n\n${d.content.slice(offset, end)}${more}`)
    }),
  )

  server.registerTool(
    'list_docs',
    {
      title: 'List team docs',
      description: 'Browse the team knowledge base (the shared Google Drive folder): every file with its folder path, type, size and id.',
      inputSchema: { folder: z.string().optional().describe('Only files under this folder path, e.g. "Product/"') },
      annotations: { readOnlyHint: true },
    },
    guard(async ({ folder }) => {
      if (!docsConfigured()) return fail('No knowledge base is connected to this workspace.')
      const docs = await listDocs(folder)
      return text(docs.length ? `${docs.length} file${docs.length === 1 ? '' : 's'}:\n${docs.map(docLine).join('\n')}` : 'No files yet. The first sync may still be running.')
    }),
  )

  server.registerPrompt(
    'work_on_current_task',
    { title: 'Work on my current skatebored task', description: 'Loads your owner, current task and project context, then starts work.' },
    async () => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: 'Use the skatebored tools: call whoami, then get_current_task (and get_project_context if you need the bigger picture). Summarise the task and your plan in a few lines, then implement it. Post short progress comments at milestones, and call complete_task with a summary when done.',
          },
        },
      ],
    }),
  )

  return server
}

/** POST/GET/DELETE /api/mcp */
export async function mcp(req: Request) {
  const agent = await requireAgent(req)
  const appUrl = process.env.APP_URL || new URL(req.url).origin

  let cache: Promise<{ s: Snapshot; L: Lookups }> | null = null
  const ctx: Ctx = {
    agent,
    appUrl,
    data: () => (cache ??= loadSnapshot().then((s) => ({ s, L: lookups(s) }))),
    owner: (L) => {
      const u = L.users.get(agent.owner_user_id)
      return { memberId: agent.owner_user_id, clerkId: agent.owner_clerk_id, name: u?.name ?? 'your owner', email: u?.email ?? '', title: u?.title ?? '' }
    },
  }

  // Identity goes into the server instructions, so the agent knows who it works for from the handshake.
  const { L } = await ctx.data()
  const o = ctx.owner(L)
  const cur = agent.current_issue_id ? L.issues.get(agent.current_issue_id) : undefined
  // Mirror the Drive knowledge base: awaited the first time, refreshed in the background after.
  await ensureFreshDocs(waitUntil).catch((e) => console.error('[docs]', e))
  const docs = docsConfigured() ? await docStats().catch(() => ({ files: 0, chars: 0 })) : { files: 0, chars: 0 }
  const overview = docs.files ? await docsOverview().catch(() => '') : ''
  const intro = [
    `You are "${agent.name}", a coding agent working for ${o.name}${o.title ? ` (${o.title})` : ''} on the skatebored scrum workspace (${appUrl}).`,
    cur ? `Your current task is ${cur.key}: ${cur.summary}. Call get_current_task for the full brief before starting.` : `You have no current task yet. Call get_current_task to see ${o.name}'s open work, then start_task, or ask ${o.name}.`,
    'Work only on your current task unless your owner says otherwise. Use get_project_context for the sprint goal and team. Post short progress comments with add_comment, and finish with complete_task (summary, how to verify, branch/PR).',
    `Everything you change is recorded as ${o.name}'s action and labelled with your agent name, so be accurate.`,
    ...(docs.files
      ? [
          `The team's knowledge base (${docs.files} files from the shared Google Drive: product, plans, research, decisions) is available. Before making assumptions about the product, users, or past decisions, read the relevant files with get_doc (pass the id below), or use search_docs to find passages.`,
          ...(overview ? ['', '## Team knowledge base — what each file holds', overview] : []),
        ]
      : []),
  ].join('\n')

  const server = build(ctx, intro)
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  await server.connect(transport)
  return transport.handleRequest(req)
}

