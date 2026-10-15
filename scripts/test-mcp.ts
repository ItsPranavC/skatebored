/**
 * Integration test for the agent MCP server: agent tokens, identity, task context and writes.
 * Real database + real Clerk tokens, in an isolated throwaway workspace that is removed afterwards.
 *
 *   npm run test:mcp
 */
import { readFileSync, existsSync } from 'node:fs'
import { createClerkClient } from '@clerk/backend'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

for (const f of ['.env.local', '.env.development.local']) {
  if (!existsSync(f)) continue
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]!.replace(/^"|"$/g, '')
  }
}
const TEST_WS = `sbtest-mcp-${Date.now().toString(36)}`
process.env.WORKSPACE_ID = TEST_WS
process.env.APP_URL = 'https://skatebored.test'
// Knowledge base on, with a fresh "last sync" so the test never calls Google.
process.env.DRIVE_FOLDER_ID = 'test-folder'
process.env.GOOGLE_SERVICE_ACCOUNT_JSON ??= JSON.stringify({ client_email: 'test@example.com', private_key: 'unused' })

const agentsApi = await import('../api/agents.ts')
const mcpApi = await import('../api/mcp.ts')
const { applyOps } = await import('../server/sync.ts')
const { pool } = await import('../server/db.ts')

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! })
const user = await clerk.users.createUser({ emailAddress: [`mcp-test-${Date.now()}@example.com`], skipPasswordRequirement: true, skipLegalChecks: true })
const session = await clerk.sessions.createSession({ userId: user.id })
const jwt = async () => (await clerk.sessions.getToken(session.id)).jwt

let failures = 0
const ok = (cond: unknown, label: string) => {
  console.log(`${cond ? '✓' : '✗'} ${label}`)
  if (!cond) failures++
}
const api = async (method: string, body?: unknown, query = '') => {
  const fn = (agentsApi as Record<string, (r: Request) => Promise<Response>>)[method]!
  const r = await fn(new Request(`http://localhost/api/agents${query}`, { method, headers: { authorization: `Bearer ${await jwt()}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }))
  return { status: r.status, body: (await r.json()) as Record<string, any> }
}
/** Routes the MCP client's HTTP calls straight into the function handlers. */
const mcpFetch = (async (url: string | URL, init?: RequestInit) => {
  const req = new Request(url, init)
  const fn = (mcpApi as Record<string, (r: Request) => Promise<Response>>)[req.method]!
  return fn(req)
}) as typeof fetch
const connect = async (token: string) => {
  const client = new Client({ name: 'test-agent', version: '1.0.0' })
  await client.connect(new StreamableHTTPClientTransport(new URL('http://localhost/api/mcp'), { fetch: mcpFetch, requestInit: { headers: { authorization: `Bearer ${token}` } } }))
  return client
}
const call = async (c: Client, name: string, args: Record<string, unknown> = {}) => {
  const r = (await c.callTool({ name, arguments: args })) as { content: { text: string }[]; isError?: boolean }
  return { text: r.content.map((x) => x.text).join('\n'), isError: !!r.isError }
}

try {
  // ── a tiny workspace: me, a teammate, one project, an active sprint, three issues
  const T = new Date().toISOString()
  const statuses = [
    { id: 'T-todo', name: 'To Do', category: 'todo' },
    { id: 'T-prog', name: 'In Progress', category: 'inprogress' },
    { id: 'T-review', name: 'In Review', category: 'inprogress' },
    { id: 'T-done', name: 'Done', category: 'done' },
  ]
  const issue = (id: string, key: string, summary: string, extra: Record<string, unknown> = {}) => ({
    c: 'issues', id, op: 'put' as const,
    d: { id, key, projectId: 'p1', type: 'task', summary, description: `Details for ${summary}.\n\nDone when: it works.`, statusId: 'T-todo', priority: 'medium', assigneeId: null, reporterId: 'u-me', storyPoints: 3, labels: [], sprintId: 's1', epicId: 'e1', parentId: null, componentIds: [], fixVersionIds: [], dueDate: null, startDate: null, color: null, originalEstimate: null, timeSpent: 0, rank: 1, watcherIds: [], links: [], attachments: [], flagged: false, createdAt: T, updatedAt: T, resolvedAt: null, ...extra },
  })
  await applyOps(
    [
      { c: 'users', id: 'u-me', op: 'put', d: { id: 'u-me', name: 'Riley Owner', email: 'riley@example.com', title: 'Engineer', color: '#f00', active: true, clerkId: user.id } },
      { c: 'users', id: 'u-pat', op: 'put', d: { id: 'u-pat', name: 'Pat Teammate', email: 'pat@example.com', title: 'Designer', color: '#0f0', active: true } },
      { c: 'projects', id: 'p1', op: 'put', d: { id: 'p1', key: 'TST', name: 'Test project', description: 'Adaptive learning for skaters.', type: 'scrum', leadId: 'u-me', memberIds: ['u-me', 'u-pat'], statuses, columns: [], components: [], versions: [], issueCounter: 4, estimation: 'points', repo: 'skatebored/app', createdAt: T } },
      { c: 'sprints', id: 's1', op: 'put', d: { id: 's1', projectId: 'p1', name: 'TST Sprint 1', goal: 'Ship onboarding', state: 'active', startDate: T, endDate: T, order: 0 } },
      { ...issue('e1', 'TST-1', 'Onboarding epic', { type: 'epic', sprintId: null }) },
      issue('i2', 'TST-2', 'Build welcome screen', { assigneeId: 'u-me', priority: 'high' }),
      issue('i3', 'TST-3', 'Write onboarding email'),
      issue('i4', 'TST-4', 'Pick illustration style', { assigneeId: 'u-pat' }),
      // Technical · Research-led, in a module, with a partly written brief
      issue('i5', 'TST-5', 'Choose an embedder', {
        sprintId: null,
        track: 'technical',
        workStyle: 'research',
        moduleId: 'm1',
        brief: { problem: 'Pick an embedder for question search.\nIt must run on-device.', acceptance: 'Old direct-style check' },
        references: [{ id: 'r1', title: 'MiniLM paper', location: 'https://arxiv.org/abs/2002.10957', kind: 'paper', accessIssue: 'Paywalled copy only', addedById: 'u-me', addedAt: T }],
      }),
      issue('i6', 'TST-6', 'Book the skatepark', { sprintId: null, track: 'operations', brief: { outcome: 'Venue booked for June' } }),
      {
        c: 'modules', id: 'm1', op: 'put',
        d: {
          id: 'm1', projectId: 'p1', name: 'Embedder', summary: 'Which text embedder powers question search.', ownerId: 'u-me', defaultWorkStyle: 'research', updatesLiveIn: 'This brief',
          brief: { problem: 'Search is keyword-only today.', formulation: 'cosine(q, d)', chosen: 'MiniLM', rationale: 'Small and fast enough' },
          references: [], criteria: [{ id: 'k1', name: 'Latency', kind: 'requirement', threshold: '< 50 ms' }],
          candidates: [{ id: 'x1', name: 'MiniLM', baseline: false, status: 'considering', reason: 'Small', advantages: '', disadvantages: '', cells: {} }],
          tests: [], createdById: 'u-me', createdAt: T, updatedAt: T,
        },
      },
      { c: 'comments', id: 'c1', op: 'put', d: { id: 'c1', issueId: 'i2', authorId: 'u-pat', body: 'Use the cream palette please', createdAt: T, updatedAt: null } },
    ],
    user.id,
  )

  // ── knowledge base rows (as the Drive sync would write them)
  const { ensureSchema } = await import('../server/db.ts')
  await ensureSchema()
  const doc = (id: string, path: string, content: string, mime = 'application/vnd.google-apps.document') =>
    pool().query(
      `insert into sb_docs (workspace_id, id, name, path, mime, url, modified_at, content, chars) values ($1, $2, $3, $4, $5, $6, now(), $7, $8)`,
      [TEST_WS, id, path.split('/').pop(), path, mime, `https://docs.google.com/document/d/${id}`, content, content.length],
    )
  await doc('d1', 'Product/Welcome screen spec', 'The welcome screen greets new skaters. Use the cream palette and the deck-brown illustration. Done when it loads under one second.')
  await doc('d2', 'Research/School interviews', 'Teachers want progress reports every week. ' + 'Filler sentence about lessons. '.repeat(3000))
  await doc('d3', 'Finance/Budget', 'month,spend\nJan,1200\nFeb,900', 'application/vnd.google-apps.spreadsheet')
  await pool().query(`insert into sb_doc_syncs (workspace_id, folder_id, started_at, finished_at, files) values ($1, 'test-folder', now(), now(), 3)`, [TEST_WS])

  // ── tokens
  const unauth = await mcpFetch('http://localhost/api/mcp', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: '{}' })
  ok(unauth.status === 401, 'MCP without a token → 401')
  const bad = await mcpFetch('http://localhost/api/mcp', { method: 'POST', headers: { authorization: 'Bearer sbk_nope' }, body: '{}' })
  ok(bad.status === 401, 'MCP with an unknown token → 401')

  const created = await api('POST', { name: 'Claude Code – laptop' })
  ok(created.status === 201 && String(created.body.token).startsWith('sbk_'), 'owner creates an agent token')
  const token = created.body.token as string
  const agentId = created.body.agent.id as string
  ok((await api('GET')).body.agents.length === 1, 'owner lists their agents (token not returned)')
  ok(!JSON.stringify((await api('GET')).body).includes(token), 'listing never exposes the token')

  // ── identity & no task yet
  const c = await connect(token)
  const tools = (await c.listTools()).tools.map((t) => t.name)
  ok(['whoami', 'get_current_task', 'list_my_tasks', 'get_issue', 'get_project_context', 'search_issues', 'start_task', 'update_task_status', 'add_comment', 'complete_task', 'search_docs', 'get_doc', 'list_docs', 'get_module_brief', 'suggest_brief_text'].every((t) => tools.includes(t)), `all tools listed (${tools.length})`)
  ok(/Riley Owner/.test(c.getInstructions() ?? ''), 'server instructions name the owner')
  ok(/Never write into Handwrite fields/.test(c.getInstructions() ?? '') && /human judgments/.test(c.getInstructions() ?? ''), 'instructions carry the brief-authoring rules')
  const who = await call(c, 'whoami')
  ok(/Agent: Claude Code – laptop/.test(who.text) && /Owner: Riley Owner <riley@example.com>/.test(who.text), 'whoami → agent name + owner')
  const none = await call(c, 'get_current_task')
  ok(/No task has been handed/.test(none.text) && /TST-2/.test(none.text) && !/TST-4/.test(none.text), "no current task → lists only the owner's open work")

  // ── owner hands a task from the app
  ok((await api('PATCH', { id: agentId, currentIssueId: 'i2' })).status === 200, 'owner hands TST-2 to the agent')
  const c2 = await connect(token)
  ok(/current task is TST-2/.test(c2.getInstructions() ?? ''), 'instructions name the current task on the next session')
  const task = await call(c2, 'get_current_task')
  ok(/# TST-2: Build welcome screen/.test(task.text) && /Done when: it works/.test(task.text), 'current task brief has the description')
  ok(/Goal: Ship onboarding/.test(task.text) && /TST-1: Onboarding epic/.test(task.text) && /cream palette/.test(task.text), 'brief includes sprint goal, epic and comments')
  ok(/Suggested branch: TST-2-build-welcome-screen/.test(task.text) && /github.com\/skatebored\/app/.test(task.text), 'brief includes branch and repo')

  const proj = await call(c2, 'get_project_context')
  ok(/Active sprint: TST Sprint 1/.test(proj.text) && /Pat Teammate \(Designer\): 1 open issue/.test(proj.text), 'project context: sprint + team')
  ok(/Open work by type: Operations 1 · Technical 1 \(research heavy 1, implementation heavy 0\) · Unclassified 3/.test(proj.text), 'project context: open work by type')
  ok(/## Modules[\s\S]*- Embedder — owner: Riley Owner · 1 linked task/.test(proj.text), 'project context: modules with owner and linked tasks')
  const mine = await call(c2, 'list_my_tasks')
  ok(/TST-2.*← your current task/.test(mine.text) && !/TST-3/.test(mine.text), 'list_my_tasks marks the current task')
  const found = await call(c2, 'search_issues', { text: 'onboarding email', assignee: 'unassigned' })
  ok(/TST-3/.test(found.text), 'search finds unassigned work')

  // ── knowledge base
  const { excluded } = await import('../server/docs.ts')
  ok(excluded('Sensitive /EIDs and Passwords.') && excluded('Team/sensitive/x') && excluded('Ops/API keys') && excluded('notes/passwords'), 'sensitive folders and credential-like files are never synced')
  ok(!excluded('Research/Instructions') && !excluded('Non Technical Resources/Goals'), 'normal docs are synced')
  ok(/knowledge base \(3 files/.test(c2.getInstructions() ?? ''), 'instructions mention the knowledge base')
  ok(/what each file holds[\s\S]*Product\/[\s\S]*Welcome screen spec — [\s\S]*\[id: d1\]/.test(c2.getInstructions() ?? ''), 'instructions include the file-by-file overview')
  const { summarize } = await import('../server/docs.ts')
  ok(/Spreadsheet — Budget \[month, spend\]; Team \[name\]/.test(summarize('Plan', '## Tab: Budget (2 rows)\nmonth,spend\nJan,1\n\n## Tab: Team (1 rows)\nname', null)), 'spreadsheet summaries list every tab and its columns')
  ok(summarize('Spec', '# Spec\n\nSee [the brief](https://x.y/z) — https\\://a.b', null).startsWith('See the brief'), 'summaries strip Markdown')
  ok(/Possibly related team docs[\s\S]*Welcome screen spec/.test(task.text), 'task brief suggests related docs')
  const sd = await call(c2, 'search_docs', { query: 'progress reports teachers' })
  ok(/Research\/School interviews/.test(sd.text) && /\*\*/.test(sd.text), 'search_docs ranks the right doc with highlighted snippet')
  ok(/Finance\/Budget/.test((await call(c2, 'search_docs', { query: 'Budget' })).text), 'search_docs matches file names')
  const gd = await call(c2, 'get_doc', { doc: 'welcome screen spec' })
  ok(/# Product\/Welcome screen spec/.test(gd.text) && /deck-brown/.test(gd.text), 'get_doc by name returns full text')
  const page1 = await call(c2, 'get_doc', { doc: 'd2', length: 5000 })
  ok(/Call get_doc with offset 5000/.test(page1.text), 'long docs are paged')
  ok((await call(c2, 'get_doc', { doc: 'nope-nothing' })).isError, 'unknown doc → error')
  const ld = await call(c2, 'list_docs', { folder: 'Product/' })
  ok(/1 file:/.test(ld.text) && /Welcome screen spec/.test(ld.text), 'list_docs filters by folder')

  // ── work types, task briefs and modules
  const t5 = await call(c2, 'get_issue', { key: 'TST-5' })
  ok(/Work type: Technical · Research-led \(Research heavy\)/.test(t5.text), 'renderIssue shows the work type')
  ok(/Expected flow: Frame → Research → Compare → Recommend → Implement and verify/.test(t5.text) && /Required output: Synthesis, justified choice and verification/.test(t5.text), 'brief shows the flow and required output')
  ok(/- Problem and decision \[Handwrite\]: Pick an embedder for question search\.\n  It must run on-device\./.test(t5.text), 'filled Handwrite field shown with its label and authoring')
  ok(/- Research questions \[Use AI\]: \(empty\)/.test(t5.text) && /- Synthesis \[Handwrite\]: \(empty\)/.test(t5.text), 'empty fields are listed with their authoring')
  ok(/### Written under an earlier work style\n\n- Acceptance checks: Old direct-style check/.test(t5.text), 'text from an earlier work style stays visible')
  ok(/## References[\s\S]*MiniLM paper \(Paper\) — https:\/\/arxiv\.org[\s\S]*ACCESS ISSUE: Paywalled copy only/.test(t5.text), 'references with kind, location and access issue')
  ok(/## Module brief: Embedder[\s\S]*https:\/\/skatebored\.test\/projects\/TST\/modules\/m1[\s\S]*Technical definitions or formulation \[Use AI\]: cosine/.test(t5.text) && /#### Decision\n\n- Chosen approach \[Handwrite\]: MiniLM/.test(t5.text), 'module brief embedded with link and decision')
  const t6 = await call(c2, 'get_issue', { key: 'TST-6' })
  ok(/Work type: Operations/.test(t6.text) && /- Expected outcome \[Handwrite\]: Venue booked for June/.test(t6.text) && !/Research questions/.test(t6.text), 'Operations brief has no research prompts')
  ok(/Work type: Unclassified/.test(task.text), 'unclassified issues say so')
  ok(/TST-5 .*Technical\/Research-led/.test((await call(c2, 'search_issues', { text: 'embedder' })).text) && /TST-6 .*, Operations\)/.test((await call(c2, 'search_issues', { text: 'skatepark' })).text), 'issue lines carry the work type')
  const mod = await call(c2, 'get_module_brief', { module: 'embedder' })
  ok(/# Module: Embedder/.test(mod.text) && /Criteria: Latency \(requirement: < 50 ms\)/.test(mod.text) && /Linked tasks \(1\)[\s\S]*TST-5/.test(mod.text), 'get_module_brief by name')
  ok((await call(c2, 'get_module_brief', { module: 'nope' })).isError, 'unknown module → error')

  const hw = await call(c2, 'suggest_brief_text', { issue_key: 'TST-5', field: 'problem', text: 'Agent-written problem' })
  ok(hw.isError && /Handwrite field/.test(hw.text), 'suggest_brief_text refuses a Handwrite field')
  const other = await call(c2, 'suggest_brief_text', { issue_key: 'TST-5', field: 'acceptance', text: 'x' })
  ok(other.isError && /not part of TST-5's work style/.test(other.text) && /questions \(Research questions\)/.test(other.text), 'suggest_brief_text refuses fields outside the work style')
  ok((await call(c2, 'suggest_brief_text', { issue_key: 'TST-6', field: 'outcome', text: 'x' })).isError, 'Operations fields take no AI suggestions')
  const sug = await call(c2, 'suggest_brief_text', { issue_key: 'TST-5', field: 'Research questions', text: 'Which embedder meets 50 ms on-device?' })
  ok(!sug.isError && /Suggestion saved for "Research questions"/.test(sug.text), 'suggest_brief_text accepts a Use AI field')
  const i5 = (await pool().query(`select data, updated_by from sb_records where workspace_id = $1 and collection = 'issues' and id = 'i5'`, [TEST_WS])).rows[0]
  ok(i5.data.suggestions?.questions?.text === 'Which embedder meets 50 ms on-device?' && i5.data.suggestions.questions.by === "Claude Code – laptop (Riley's agent)" && i5.updated_by === user.id, 'DB: suggestion stored, labelled with agent and owner')
  ok(Object.keys(i5.data.brief).length === 2 && i5.data.brief.problem === 'Pick an embedder for question search.\nIt must run on-device.' && i5.data.brief.acceptance === 'Old direct-style check', 'DB: brief untouched by the suggestion')
  ok(/Research questions \[Use AI\]: \(empty\)\n  Pending suggestion from Claude Code – laptop \(Riley's agent\)/.test((await call(c2, 'get_issue', { key: 'TST-5' })).text), 'pending suggestion shown under the empty field')

  // ── writes
  const st = await call(c2, 'update_task_status', { status: 'in progress' })
  ok(/To Do → In Progress/.test(st.text), 'status change by name (case-insensitive)')
  const badSt = await call(c2, 'update_task_status', { status: 'Shipped' })
  ok(badSt.isError && /Use one of/.test(badSt.text), 'unknown status → helpful error')
  ok(!(await call(c2, 'add_comment', { body: 'Layout done, wiring the API next.' })).isError, 'agent comments on its task')
  const taken = await call(c2, 'start_task', { key: 'TST-4' })
  ok(taken.isError && /assigned to Pat Teammate/.test(taken.text), "can't take a teammate's task")
  const done = await call(c2, 'complete_task', { summary: 'Welcome screen built on branch TST-2-build-welcome-screen.' })
  ok(/TST-2 → In Review/.test(done.text), 'complete_task → In Review, task cleared')
  const started = await call(c2, 'start_task', { key: 'TST-3' })
  ok(/TST-3 is now your current task \(status: In Progress, assignee: Riley Owner\)/.test(started.text), 'start_task claims unassigned work for the owner')

  const rows = async (c: string) => (await pool().query(`select id, data, updated_by from sb_records where workspace_id = $1 and collection = $2`, [TEST_WS, c])).rows
  const issues = await rows('issues')
  const i2 = issues.find((r) => r.id === 'i2')!
  ok(i2.data.statusId === 'T-review' && i2.updated_by === user.id, 'DB: TST-2 is In Review, written as the owner')
  ok(issues.find((r) => r.id === 'i3')!.data.assigneeId === 'u-me', 'DB: TST-3 assigned to the owner')
  const comments = (await rows('comments')).filter((r) => r.data.issueId === 'i2' && r.data.authorId === 'u-me')
  ok(comments.length === 2 && comments.every((r) => r.data.body.startsWith('🤖 Claude Code – laptop: ')), 'DB: agent comments are signed with the agent name')
  ok((await rows('history')).some((r) => r.data.field === 'status' && r.data.to === 'In Review'), 'DB: history records the status change')
  ok((await api('GET')).body.agents[0].currentIssueId === 'i3', 'app sees the agent’s new current task')

  // ── revoke
  ok((await api('DELETE', { id: agentId })).status === 200, 'owner revokes the agent')
  const after = await mcpFetch('http://localhost/api/mcp', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: '{}' })
  ok(after.status === 401, 'revoked token → 401')
} catch (e) {
  failures++
  console.error(e)
} finally {
  await pool().query('delete from sb_agents where workspace_id = $1', [TEST_WS]).catch(() => {})
  await pool().query('delete from sb_docs where workspace_id = $1', [TEST_WS]).catch(() => {})
  await pool().query('delete from sb_doc_syncs where workspace_id = $1', [TEST_WS]).catch(() => {})
  await pool().query('delete from sb_records where workspace_id = $1', [TEST_WS]).catch(() => {})
  await pool().query('delete from sb_workspaces where id = $1', [TEST_WS]).catch(() => {})
  await clerk.users.deleteUser(user.id).catch(() => {})
  await pool().end()
}
console.log(failures ? `\n${failures} check(s) failed` : '\nAll MCP checks passed')
process.exit(failures ? 1 : 0)
