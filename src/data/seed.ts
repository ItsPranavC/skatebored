import { addDays, subDays, startOfDay } from 'date-fns'
import type {
  Comment,
  Dashboard,
  HistoryEntry,
  Issue,
  IssueType,
  Notification,
  Priority,
  Project,
  SavedFilter,
  Sprint,
  User,
  WorkLog,
} from '@/types'

/**
 * Builds a realistic, internally consistent workspace for skatebored relative to
 * "now" so the active sprint, burndown and reports always look current.
 */

export interface SeedData {
  users: User[]
  projects: Project[]
  sprints: Sprint[]
  issues: Issue[]
  comments: Comment[]
  history: HistoryEntry[]
  worklogs: WorkLog[]
  notifications: Notification[]
  filters: SavedFilter[]
  dashboards: Dashboard[]
}

// Small deterministic PRNG so the seed is stable between resets.
function rng(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

export const USERS: User[] = [
  { id: 'u1', name: 'Maya Okafor', email: 'maya@skatebored.org', title: 'Product Lead', color: '#f04c4c', active: true },
  { id: 'u2', name: 'Leo Tanaka', email: 'leo@skatebored.org', title: 'Engineering Lead', color: '#f2a93b', active: true },
  { id: 'u3', name: 'Sasha Ivanova', email: 'sasha@skatebored.org', title: 'WebGL Engineer', color: '#6ea0ff', active: true },
  { id: 'u4', name: 'Dev Patel', email: 'dev@skatebored.org', title: 'ML Engineer', color: '#5cc47e', active: true },
  { id: 'u5', name: 'Rosa Méndez', email: 'rosa@skatebored.org', title: 'Product Designer', color: '#ff7ab6', active: true },
  { id: 'u6', name: 'Theo Brooks', email: 'theo@skatebored.org', title: 'Frontend Engineer', color: '#b48cff', active: true },
  { id: 'u7', name: 'Amara Nwosu', email: 'amara@skatebored.org', title: 'QA Engineer', color: '#38c6c6', active: true },
  { id: 'u8', name: 'Jules Laurent', email: 'jules@skatebored.org', title: 'Learning Content Lead', color: '#c9a27e', active: true },
]

const scrumStatuses = (p: string) => [
  { id: `${p}-todo`, name: 'To Do', category: 'todo' as const },
  { id: `${p}-prog`, name: 'In Progress', category: 'inprogress' as const },
  { id: `${p}-review`, name: 'In Review', category: 'inprogress' as const },
  { id: `${p}-qa`, name: 'QA', category: 'inprogress' as const },
  { id: `${p}-done`, name: 'Done', category: 'done' as const },
]

const scrumColumns = (p: string) => [
  { id: `${p}-c1`, name: 'To Do', statusIds: [`${p}-todo`], wipLimit: null },
  { id: `${p}-c2`, name: 'In Progress', statusIds: [`${p}-prog`], wipLimit: 5 },
  { id: `${p}-c3`, name: 'In Review', statusIds: [`${p}-review`], wipLimit: 4 },
  { id: `${p}-c4`, name: 'QA', statusIds: [`${p}-qa`], wipLimit: null },
  { id: `${p}-c5`, name: 'Done', statusIds: [`${p}-done`], wipLimit: null },
]

interface EpicDef {
  summary: string
  description: string
  color: string
  children: [IssueType, string, number | null, Priority?, string[]?][]
}

const SKB_EPICS: EpicDef[] = [
  {
    summary: 'Adaptive learning engine',
    description:
      'Model each learner\'s mastery per concept and choose the next best lesson in real time.\n\nSuccess: 20% faster time-to-mastery vs. linear curriculum in the pilot cohort.',
    color: '#f04c4c',
    children: [
      ['task', 'Bayesian knowledge tracing model for concept mastery', 8, 'highest', ['ml', 'core']],
      ['task', 'Next-lesson recommender API endpoint', 5, 'high', ['api']],
      ['task', 'Instrument lesson events into the learner event stream', 3, 'high', ['analytics']],
      ['task', 'Spaced repetition scheduler for review cards', 5, 'medium', ['ml']],
      ['bug', 'Mastery score resets after switching devices', 3, 'highest', ['sync']],
      ['task', 'Offline evaluation harness for recommender', 5, 'medium', ['ml']],
      ['task', 'Difficulty calibration from first 3 answers', 3, 'medium', ['ml']],
      ['bug', 'Recommender returns already-completed lesson', 2, 'high', ['api']],
      ['task', 'Feature store for learner signals', 8, 'medium', ['infra']],
      ['task', 'Explainable "why this lesson" tooltip', 2, 'low', ['ux']],
    ],
  },
  {
    summary: 'Knowledge space 3D visualisation',
    description:
      'The interactive orbitable knowledge volume on the demo page: concepts as nodes, prerequisites as edges, mastery as glow.',
    color: '#6ea0ff',
    children: [
      ['task', 'Render concept graph as instanced spheres in three.js', 5, 'high', ['webgl']],
      ['task', 'Orbit + zoom controls with inertia', 3, 'medium', ['webgl']],
      ['task', 'Level-of-detail for graphs > 2k nodes', 5, 'medium', ['perf', 'webgl']],
      ['bug', 'Knowledge volume flickers on Safari 18 when resizing', 2, 'high', ['webgl', 'safari']],
      ['task', 'Highlight learning path when hovering a concept', 3, 'medium', ['webgl', 'ux']],
      ['task', 'Respect prefers-reduced-motion in knowledge volume', 1, 'low', ['a11y']],
      ['task', 'Keyboard navigation between concept nodes', 3, 'medium', ['a11y']],
    ],
  },
  {
    summary: 'Learner onboarding',
    description: 'Typed hero intro, demo walkthrough and the first-session placement quiz.',
    color: '#5cc47e',
    children: [
      ['task', 'Placement quiz: 8 adaptive questions', 5, 'high', ['onboarding']],
      ['task', 'Typed.js hero copy variants for A/B test', 1, 'low', ['marketing']],
      ['task', 'Demo button → spatial journey cross-fade', 3, 'medium', ['ux']],
      ['bug', 'Demo button stays disabled when typed.js fails to load', 2, 'highest', ['onboarding']],
      ['task', 'Save progress prompt after first lesson', 2, 'medium', ['growth']],
      ['task', 'Contact link → shared inbox routing', 1, 'low', []],
    ],
  },
  {
    summary: 'Mobile experience',
    description: 'Replace the "Best on desktop" notice with a first-class phone & tablet experience.',
    color: '#f2a93b',
    children: [
      ['task', 'Responsive layout for lesson player < 760px', 5, 'high', ['mobile']],
      ['task', 'Touch gestures for skateboard model (pinch, rotate)', 3, 'medium', ['mobile', 'webgl']],
      ['task', 'Audit safe-area insets on iOS', 1, 'low', ['mobile']],
      ['bug', 'Skateboard canvas captures vertical scroll on Android', 3, 'high', ['mobile', 'webgl']],
      ['task', 'Remove device-notice gate behind feature flag', 2, 'medium', ['mobile']],
    ],
  },
  {
    summary: 'Content authoring studio',
    description: 'Internal tool so the content team can author lessons, concepts and prerequisite links without engineering.',
    color: '#b48cff',
    children: [
      ['task', 'Lesson editor with markdown + live preview', 8, 'medium', ['studio']],
      ['task', 'Concept prerequisite graph editor', 5, 'medium', ['studio']],
      ['task', 'Role-based access for authors vs reviewers', 3, 'medium', ['auth']],
      ['task', 'Publish workflow with review & approval', 5, 'low', ['studio']],
      ['task', 'Import legacy lessons from CSV', 2, 'low', ['studio', 'migration']],
    ],
  },
]

const SKB_LOOSE: [IssueType, string, number | null, Priority?, string[]?][] = [
  ['task', 'Upgrade three.js to r170', 2, 'medium', ['deps']],
  ['bug', 'Favicon missing on production (data: URI)', 1, 'low', ['polish']],
  ['task', 'Set up error monitoring for front end', 2, 'medium', ['infra']],
  ['task', 'Dark/light theme tokens shared across apps', 3, 'low', ['design-system']],
  ['task', 'Write ADR: event stream storage choice', 1, 'medium', ['docs']],
  ['bug', 'Typed cursor colour invisible on black background', 1, 'low', ['polish']],
  ['task', 'Load test recommender at 500 rps', 3, 'medium', ['perf']],
  ['task', 'Teacher dashboard: class mastery heatmap', 8, 'high', ['teachers']],
  ['task', 'Parent weekly progress email', 3, 'low', ['growth']],
  ['bug', 'Lesson audio desyncs after pausing twice', 2, 'high', ['player']],
  ['task', 'GDPR data export for learner accounts', 3, 'high', ['privacy']],
  ['task', 'Streaks and gentle nudges (no dark patterns)', 3, 'medium', ['growth', 'ux']],
  ['task', 'Accessibility audit of lesson player (WCAG 2.2 AA)', 5, 'high', ['a11y']],
  ['bug', 'Contact link opens blank tab on Firefox', 1, 'low', ['polish']],
  ['task', 'Classroom join codes', 5, 'medium', ['teachers']],
  ['task', 'Cache knowledge graph JSON at the edge', 2, 'medium', ['perf']],
  ['task', 'Learner can retake placement quiz', 2, 'low', ['onboarding']],
  ['task', 'Document recommender API with OpenAPI', 2, 'low', ['docs', 'api']],
  ['bug', 'Mastery glow too dim in light theme', 1, 'low', ['webgl', 'design-system']],
]

const DECK_EPIC: EpicDef[] = [
  {
    summary: 'Globe Down in Flames deck model',
    description: 'The hero 3D skateboard: model, materials, interaction.',
    color: '#f04c4c',
    children: [
      ['task', 'PBR materials for griptape and wood ply', 3, 'medium', ['3d']],
      ['task', 'Drag to rotate, double-click to reset', 2, 'high', ['interaction']],
      ['task', 'Compress GLB with Draco (< 600KB)', 2, 'high', ['perf']],
      ['bug', 'Wheel spin stutters at 120Hz', 2, 'medium', ['3d']],
      ['task', 'Idle float animation synced to typed cursor', 1, 'low', ['3d']],
      ['task', 'Bake ambient occlusion for trucks', 3, 'low', ['3d']],
    ],
  },
  {
    summary: 'Spatial learning journey',
    description: 'The iframe-hosted spatial stage that the demo cross-fades into.',
    color: '#38c6c6',
    children: [
      ['task', 'Warm spatial iframe behind demo page', 3, 'high', ['perf']],
      ['task', 'Camera path through 5 concept "rooms"', 5, 'medium', ['3d']],
      ['bug', 'Back button leaves iframe audio playing', 1, 'highest', ['bug-bash']],
      ['task', 'postMessage contract between host and spatial frame', 2, 'medium', ['api']],
      ['task', 'Narration captions overlay', 3, 'medium', ['a11y']],
    ],
  },
]

const OPS_ITEMS: [IssueType, string, number | null, Priority?, string[]?][] = [
  ['task', 'Rotate CDN signing keys', null, 'high', ['security']],
  ['bug', 'Pilot school SSO login loop', null, 'highest', ['support']],
  ['task', 'Monthly cost report', null, 'low', ['finance']],
  ['task', 'Renew skatebored.org TLS certificate', null, 'medium', ['infra']],
  ['bug', 'Teacher export CSV has wrong timezone', null, 'medium', ['support']],
  ['task', 'Onboard 3 new pilot classrooms', null, 'medium', ['customers']],
  ['task', 'Backup restore drill', null, 'medium', ['infra']],
]

const COMMENT_BANK = [
  'I can pick this up after standup.',
  'Pushed a draft PR — would love eyes on the approach before I go further.',
  'Repro steps: open the demo, resize the window quickly, watch the canvas.',
  'Blocked on the API contract, pinging @Leo.',
  'Design review done ✅ — a few nits left inline.',
  'Moved to QA, test plan is in the description.',
  'This is bigger than estimated; suggest splitting into two stories.',
  'Verified on Chrome, Firefox and Safari. Looks good.',
  'Can we ship behind a flag first?',
  'Added analytics events so we can measure the impact.',
]

export function buildSeed(): SeedData {
  const rand = rng(42)
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)]!
  const today = startOfDay(new Date())
  const iso = (d: Date) => d.toISOString()

  const users = USERS
  const projects: Project[] = []
  const sprints: Sprint[] = []
  const issues: Issue[] = []
  const comments: Comment[] = []
  const history: HistoryEntry[] = []
  const worklogs: WorkLog[] = []
  const notifications: Notification[] = []
  let hid = 0
  let rank = 1000

  const hist = (issueId: string, userId: string, field: string, from: string | null, to: string | null, at: Date) =>
    history.push({ id: `h${++hid}`, issueId, userId, field, from, to, createdAt: iso(at) })

  function makeProject(p: Omit<Project, 'statuses' | 'columns' | 'issueCounter' | 'createdAt' | 'components' | 'versions'> & Partial<Project>) {
    const proj: Project = {
      statuses: scrumStatuses(p.key),
      columns: scrumColumns(p.key),
      components: [],
      versions: [],
      issueCounter: 0,
      createdAt: iso(subDays(today, 120)),
      ...p,
    }
    projects.push(proj)
    return proj
  }

  function makeIssue(
    proj: Project,
    type: IssueType,
    summary: string,
    opts: Partial<Issue> & { createdAt?: string },
  ): Issue {
    proj.issueCounter += 1
    const created = opts.createdAt ?? iso(subDays(today, 20 + Math.floor(rand() * 60)))
    const issue: Issue = {
      id: `${proj.key.toLowerCase()}-${proj.issueCounter}`,
      key: `${proj.key}-${proj.issueCounter}`,
      projectId: proj.id,
      type,
      summary,
      description: '',
      statusId: `${proj.key}-todo`,
      priority: 'medium',
      assigneeId: null,
      reporterId: pick(['u1', 'u2', 'u5']),
      storyPoints: null,
      labels: [],
      sprintId: null,
      epicId: null,
      parentId: null,
      componentIds: [],
      fixVersionIds: [],
      dueDate: null,
      startDate: null,
      color: null,
      originalEstimate: null,
      timeSpent: 0,
      rank: (rank += 1000),
      watcherIds: [],
      links: [],
      attachments: [],
      flagged: false,
      createdAt: created,
      updatedAt: created,
      resolvedAt: null,
      ...opts,
    }
    issues.push(issue)
    hist(issue.id, issue.reporterId, 'created', null, null, new Date(created))
    return issue
  }

  /** Walks an issue through statuses up to the target, recording history. */
  function progress(proj: Project, issue: Issue, target: 'todo' | 'prog' | 'review' | 'qa' | 'done', from: Date, to: Date) {
    const flow = ['todo', 'prog', 'review', 'qa', 'done'] as const
    const idx = flow.indexOf(target)
    if (idx <= 0) return
    const span = Math.max(1, to.getTime() - from.getTime())
    let prev = `${proj.key}-todo`
    for (let i = 1; i <= idx; i++) {
      const at = new Date(from.getTime() + (span * i) / (idx + 0.3))
      const next = `${proj.key}-${flow[i]}`
      const actor = issue.assigneeId ?? issue.reporterId
      hist(issue.id, actor, 'status', proj.statuses.find((s) => s.id === prev)!.name, proj.statuses.find((s) => s.id === next)!.name, at)
      prev = next
      issue.updatedAt = iso(at)
      if (flow[i] === 'done') issue.resolvedAt = iso(at)
    }
    issue.statusId = prev
  }

  // ───────────────────────────── SKB ─────────────────────────────
  const skb = makeProject({
    id: 'p-skb',
    key: 'SKB',
    name: 'skatebored platform',
    description: 'The adaptive learning platform: learner app, recommender, knowledge space and authoring tools.',
    type: 'scrum',
    category: 'Product',
    leadId: 'u2',
    color: '#f04c4c',
    icon: '🛹',
    memberIds: users.map((u) => u.id),
    starred: true,
    estimation: 'points',
    repo: null,
    components: [
      { id: 'cmp-web', name: 'Learner web app', description: 'skatebored.org front end', leadId: 'u6' },
      { id: 'cmp-ml', name: 'Recommender', description: 'Adaptive engine & models', leadId: 'u4' },
      { id: 'cmp-3d', name: 'WebGL', description: 'Skateboard + knowledge volume', leadId: 'u3' },
      { id: 'cmp-studio', name: 'Authoring studio', description: 'Internal content tools', leadId: 'u8' },
      { id: 'cmp-api', name: 'Platform API', description: 'Public & internal APIs', leadId: 'u2' },
    ],
    versions: [
      { id: 'v-01', name: 'v0.1 Pilot', description: 'First classroom pilot', startDate: iso(subDays(today, 90)), releaseDate: iso(subDays(today, 48)), released: true, archived: false },
      { id: 'v-02', name: 'v0.2 Adaptive', description: 'Adaptive recommendations GA', startDate: iso(subDays(today, 47)), releaseDate: iso(addDays(today, 9)), released: false, archived: false },
      { id: 'v-03', name: 'v0.3 Mobile', description: 'Phone & tablet support', startDate: iso(addDays(today, 10)), releaseDate: iso(addDays(today, 45)), released: false, archived: false },
    ],
  })

  // Sprints: 4 closed, 1 active (day 7 of 14), 2 future
  const sprintLen = 14
  const activeStart = subDays(today, 6)
  for (let n = 1; n <= 7; n++) {
    const offset = (n - 5) * sprintLen
    const start = addDays(activeStart, offset)
    const end = addDays(start, sprintLen)
    const state = n < 5 ? 'closed' : n === 5 ? 'active' : 'future'
    sprints.push({
      id: `s-skb-${n}`,
      projectId: skb.id,
      name: `SKB Sprint ${n}`,
      goal:
        [
          'Pilot-ready learner flow',
          'Event stream + first mastery model',
          'Knowledge space MVP',
          'Placement quiz & onboarding',
          'Ship adaptive recommendations to pilot schools',
          'Mobile lesson player',
          'Authoring studio alpha',
        ][n - 1] ?? '',
      state,
      startDate: state === 'future' ? null : iso(start),
      endDate: state === 'future' ? null : iso(end),
      completedAt: state === 'closed' ? iso(end) : null,
      committedIssueIds: [],
      committedPoints: 0,
      completedIssueIds: [],
      completedPoints: 0,
      incompleteIssueIds: [],
      order: n,
    })
  }

  const skbChildren: Issue[] = []
  SKB_EPICS.forEach((e, ei) => {
    const epic = makeIssue(skb, 'epic', e.summary, {
      description: e.description,
      color: e.color,
      priority: 'high',
      assigneeId: ['u4', 'u3', 'u5', 'u6', 'u8'][ei]!,
      startDate: iso(subDays(today, 70 - ei * 12)),
      dueDate: iso(addDays(today, 10 + ei * 18)),
      labels: [],
      createdAt: iso(subDays(today, 100 - ei)),
    })
    for (const [type, summary, pts, prio, labels] of e.children) {
      const comp = { ml: 'cmp-ml', webgl: 'cmp-3d', studio: 'cmp-studio', api: 'cmp-api' } as Record<string, string>
      const c = (labels ?? []).map((l) => comp[l]).filter(Boolean) as string[]
      skbChildren.push(
        makeIssue(skb, type, summary, {
          epicId: epic.id,
          storyPoints: pts,
          priority: prio ?? 'medium',
          labels: labels ?? [],
          componentIds: c.length ? [c[0]!] : ['cmp-web'],
          assigneeId: rand() < 0.85 ? pick(['u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8']) : null,
          originalEstimate: pts ? pts * 240 : null,
          description:
            type === 'bug'
              ? 'Steps to reproduce:\n1. Open skatebored.org on the affected browser\n2. Trigger the behaviour described in the summary\n\nExpected: works as designed.\nActual: see summary.\n\nEnvironment: production'
              : `As a learner, I want ${summary.toLowerCase()} so that my learning feels effortless.\n\nAcceptance criteria:\n- Behaviour is covered by tests\n- Works on Chrome, Safari and Firefox\n- Analytics events added`,
        }),
      )
    }
  })
  for (const [type, summary, pts, prio, labels] of SKB_LOOSE) {
    skbChildren.push(
      makeIssue(skb, type, summary, {
        storyPoints: pts,
        priority: prio ?? 'medium',
        labels: labels ?? [],
        assigneeId: rand() < 0.6 ? pick(['u2', 'u6', 'u7']) : null,
      }),
    )
  }

  // Distribute issues: closed sprints get ~6 each (all done), active ~12, future 2 x ~5, rest backlog.
  const pool = [...skbChildren]
  const take = (n: number) => pool.splice(0, n)
  // interleave so every epic has history
  pool.sort(() => rand() - 0.5)
  const skbSprints = sprints.filter((s) => s.projectId === skb.id)
  for (const s of skbSprints) {
    const count = s.state === 'closed' ? 6 : s.state === 'active' ? 13 : 5
    const batch = take(count)
    const sStart = s.startDate ? new Date(s.startDate) : null
    const sEnd = s.endDate ? new Date(s.endDate) : null
    batch.forEach((iss, idx) => {
      iss.sprintId = s.id
      iss.createdAt = iso(subDays(sStart ?? today, 3 + Math.floor(rand() * 10)))
      history[history.findIndex((h) => h.issueId === iss.id && h.field === 'created')]!.createdAt = iss.createdAt
      if (!iss.assigneeId) iss.assigneeId = pick(['u2', 'u3', 'u4', 'u6'])
      if (s.state === 'closed' && sStart && sEnd) {
        // last closed sprint leaves one item incomplete, carried into the active sprint
        const carry = s.order === 4 && idx === batch.length - 1
        hist(iss.id, 'u2', 'Sprint', null, s.name, sStart)
        if (!carry) {
          progress(skb, iss, 'done', addDays(sStart, 1), subDays(sEnd, rand() * 3))
          iss.fixVersionIds = s.order <= 2 ? ['v-01'] : ['v-02']
          s.completedIssueIds.push(iss.id)
          s.completedPoints += iss.storyPoints ?? 0
        } else {
          s.incompleteIssueIds.push(iss.id)
        }
        s.committedIssueIds.push(iss.id)
        s.committedPoints += iss.storyPoints ?? 0
      } else if (s.state === 'active' && sStart) {
        hist(iss.id, 'u2', 'Sprint', null, s.name, sStart)
        s.committedIssueIds.push(iss.id)
        s.committedPoints += iss.storyPoints ?? 0
        iss.fixVersionIds = ['v-02']
        const targets = ['done', 'done', 'done', 'done', 'done', 'qa', 'review', 'review', 'prog', 'prog', 'prog', 'todo', 'todo'] as const
        progress(skb, iss, targets[idx] ?? 'todo', addDays(sStart, 0.5), targets[idx] === 'done' ? addDays(sStart, 1.2 + idx * 1.1 + rand() * 0.6) : subDays(today, rand() * 0.8))
        if (iss.statusId !== `${skb.key}-todo`) iss.timeSpent = Math.round((iss.originalEstimate ?? 240) * (0.3 + rand() * 0.8))
      } else if (s.state === 'future') {
        iss.fixVersionIds = s.order === 6 ? ['v-03'] : []
      }
    })
  }
  // carry-over: incomplete from Sprint 4 into active Sprint 5
  const carried = skbSprints[3]!.incompleteIssueIds
  for (const id of carried) {
    const iss = issues.find((i) => i.id === id)!
    iss.sprintId = 's-skb-5'
    iss.statusId = 'SKB-prog'
    hist(iss.id, 'u2', 'Sprint', 'SKB Sprint 4', 'SKB Sprint 5', activeStart)
    hist(iss.id, iss.assigneeId!, 'status', 'To Do', 'In Progress', addDays(activeStart, -3))
    skbSprints[4]!.committedIssueIds.push(id)
    skbSprints[4]!.committedPoints += iss.storyPoints ?? 0
  }
  // The default signed-in user (Maya) owns a slice of the active sprint and backlog
  issues
    .filter((i) => i.projectId === skb.id && i.type !== 'epic' && (i.sprintId === 's-skb-5' || i.sprintId === null))
    .filter((_, k) => k % 3 === 0)
    .forEach((i) => (i.assigneeId = 'u1'))

  // Mid-sprint scope change for a more honest burndown
  const added = pool.shift()
  if (added) {
    added.sprintId = 's-skb-5'
    added.priority = 'highest'
    added.flagged = true
    hist(added.id, 'u1', 'Sprint', null, 'SKB Sprint 5', addDays(activeStart, 3))
  }

  // Epic status follows children
  for (const epic of issues.filter((i) => i.projectId === skb.id && i.type === 'epic')) {
    const kids = issues.filter((i) => i.epicId === epic.id)
    const done = kids.filter((k) => k.statusId === 'SKB-done').length
    if (done === kids.length && kids.length) progress(skb, epic, 'done', new Date(epic.createdAt), subDays(today, 2))
    else if (done > 0 || kids.some((k) => k.statusId !== 'SKB-todo')) progress(skb, epic, 'prog', new Date(epic.createdAt), subDays(today, 30))
  }

  // Sub-tasks for a couple of active stories
  const activeStories = issues.filter((i) => i.sprintId === 's-skb-5' && i.type === 'task').slice(0, 3)
  for (const parent of activeStories) {
    const subs = ['Backend implementation', 'Front-end wiring', 'Tests & QA notes']
    subs.forEach((s, k) => {
      const sub = makeIssue(skb, 'subtask', s, {
        parentId: parent.id,
        sprintId: parent.sprintId,
        epicId: parent.epicId,
        assigneeId: parent.assigneeId,
        priority: parent.priority,
        createdAt: iso(addDays(activeStart, 1)),
        originalEstimate: 240,
      })
      if (parent.statusId === 'SKB-done' || k === 0) progress(skb, sub, 'done', addDays(activeStart, 1), subDays(today, 1))
      else if (parent.statusId !== 'SKB-todo' && k === 1) progress(skb, sub, 'prog', addDays(activeStart, 2), subDays(today, 1))
    })
  }

  // Links
  const bugRecommender = issues.find((i) => i.summary.startsWith('Recommender returns'))
  const recommenderApi = issues.find((i) => i.summary.startsWith('Next-lesson recommender'))
  if (bugRecommender && recommenderApi) {
    bugRecommender.links.push({ id: 'l1', type: 'is blocked by', issueId: recommenderApi.id })
    recommenderApi.links.push({ id: 'l2', type: 'blocks', issueId: bugRecommender.id })
  }
  const flicker = issues.find((i) => i.summary.startsWith('Knowledge volume flickers'))
  const lod = issues.find((i) => i.summary.startsWith('Level-of-detail'))
  if (flicker && lod) {
    flicker.links.push({ id: 'l3', type: 'relates to', issueId: lod.id })
    lod.links.push({ id: 'l4', type: 'relates to', issueId: flicker.id })
  }

  // ───────────────────────────── DECK ─────────────────────────────
  const deck = makeProject({
    id: 'p-deck',
    key: 'DECK',
    name: 'deck studio',
    description: 'The interactive 3D skateboard and the spatial learning journey on skatebored.org.',
    type: 'scrum',
    category: 'Experience',
    leadId: 'u3',
    color: '#6ea0ff',
    icon: '🌐',
    memberIds: ['u1', 'u3', 'u5', 'u6', 'u7'],
    starred: false,
    estimation: 'points',
    components: [{ id: 'cmp-deck', name: 'Deck model', description: '', leadId: 'u3' }],
    versions: [{ id: 'v-d1', name: 'Launch', description: 'Public launch of the 3D hero', startDate: iso(subDays(today, 30)), releaseDate: iso(addDays(today, 14)), released: false, archived: false }],
  })
  const dStart = subDays(today, 3)
  sprints.push(
    {
      id: 's-deck-1', projectId: deck.id, name: 'DECK Sprint 1', goal: 'Hero model performance', state: 'closed',
      startDate: iso(subDays(dStart, 14)), endDate: iso(dStart), completedAt: iso(dStart),
      committedIssueIds: [], committedPoints: 0, completedIssueIds: [], completedPoints: 0, incompleteIssueIds: [], order: 1,
    },
    {
      id: 's-deck-2', projectId: deck.id, name: 'DECK Sprint 2', goal: 'Spatial journey first pass', state: 'active',
      startDate: iso(dStart), endDate: iso(addDays(dStart, 14)), completedAt: null,
      committedIssueIds: [], committedPoints: 0, completedIssueIds: [], completedPoints: 0, incompleteIssueIds: [], order: 2,
    },
  )
  DECK_EPIC.forEach((e, ei) => {
    const epic = makeIssue(deck, 'epic', e.summary, {
      description: e.description, color: e.color, priority: 'high', assigneeId: 'u3',
      startDate: iso(subDays(today, 30 - ei * 10)), dueDate: iso(addDays(today, 20 + ei * 15)),
    })
    e.children.forEach(([type, summary, pts, prio, labels], k) => {
      const iss = makeIssue(deck, type, summary, {
        epicId: epic.id, storyPoints: pts, priority: prio ?? 'medium', labels: labels ?? [],
        assigneeId: pick(['u3', 'u6', 'u5', 'u7']), componentIds: ['cmp-deck'], fixVersionIds: ['v-d1'],
        createdAt: iso(subDays(today, 25)),
      })
      const s1 = sprints.find((s) => s.id === 's-deck-1')!
      const s2 = sprints.find((s) => s.id === 's-deck-2')!
      if (ei === 0 && k < 4) {
        iss.sprintId = s1.id
        s1.committedIssueIds.push(iss.id); s1.committedPoints += pts ?? 0
        progress(deck, iss, 'done', subDays(dStart, 13), subDays(dStart, 1))
        s1.completedIssueIds.push(iss.id); s1.completedPoints += pts ?? 0
      } else if (k < 4) {
        iss.sprintId = s2.id
        s2.committedIssueIds.push(iss.id); s2.committedPoints += pts ?? 0
        progress(deck, iss, (['done', 'review', 'prog', 'todo'] as const)[k]!, dStart, subDays(today, 0.5))
      }
    })
  })

  // ───────────────────────────── OPS ─────────────────────────────
  const ops = makeProject({
    id: 'p-ops',
    key: 'OPS',
    name: 'platform ops',
    description: 'Run-the-business: infrastructure, support escalations, pilot school operations.',
    type: 'scrum',
    category: 'Operations',
    leadId: 'u2',
    color: '#5cc47e',
    icon: '🛠',
    memberIds: ['u1', 'u2', 'u7', 'u8'],
    starred: false,
    estimation: 'count',
  })
  ops.statuses = [
    { id: 'OPS-todo', name: 'Backlog', category: 'todo' },
    { id: 'OPS-sel', name: 'Selected', category: 'todo' },
    { id: 'OPS-prog', name: 'In Progress', category: 'inprogress' },
    { id: 'OPS-done', name: 'Done', category: 'done' },
  ]
  ops.columns = [
    { id: 'OPS-c1', name: 'Backlog', statusIds: ['OPS-todo'], wipLimit: null },
    { id: 'OPS-c2', name: 'Selected for development', statusIds: ['OPS-sel'], wipLimit: 4 },
    { id: 'OPS-c3', name: 'In Progress', statusIds: ['OPS-prog'], wipLimit: 2 },
    { id: 'OPS-c4', name: 'Done', statusIds: ['OPS-done'], wipLimit: null },
  ]
  OPS_ITEMS.forEach(([type, summary, , prio, labels], k) => {
    const iss = makeIssue(ops, type, summary, { priority: prio ?? 'medium', labels: labels ?? [], assigneeId: pick(['u2', 'u7', 'u8', null as unknown as string]) || null })
    const st = ['OPS-prog', 'OPS-prog', 'OPS-sel', 'OPS-done', 'OPS-todo', 'OPS-sel', 'OPS-todo'][k]!
    if (st === 'OPS-done') {
      iss.statusId = st
      iss.resolvedAt = iso(subDays(today, 2))
      hist(iss.id, 'u2', 'status', 'Backlog', 'Done', subDays(today, 2))
    } else if (st !== 'OPS-todo') {
      iss.statusId = st
      hist(iss.id, 'u2', 'status', 'Backlog', ops.statuses.find((s) => s.id === st)!.name, subDays(today, 3))
    }
  })

  // ─────────────────────── comments, worklogs, watchers ───────────────────────
  let cid = 0
  for (const iss of issues) {
    if (iss.type === 'epic' || rand() < 0.45) continue
    const n = 1 + Math.floor(rand() * 3)
    for (let k = 0; k < n; k++) {
      const at = new Date(new Date(iss.createdAt).getTime() + (k + 1) * 86400000 * (0.5 + rand()))
      if (at > new Date()) break
      comments.push({ id: `c${++cid}`, issueId: iss.id, authorId: pick(users).id, body: pick(COMMENT_BANK), createdAt: iso(at), updatedAt: null })
    }
    iss.watcherIds = Array.from(new Set([iss.reporterId, ...(iss.assigneeId ? [iss.assigneeId] : [])]))
    if (iss.timeSpent > 0 && iss.assigneeId) {
      worklogs.push({ id: `w${cid}`, issueId: iss.id, userId: iss.assigneeId, minutes: iss.timeSpent, comment: 'Implementation', startedAt: iss.updatedAt })
    }
  }

  // Notifications for the default user
  const mine = issues.filter((i) => i.assigneeId === 'u1' || i.watcherIds.includes('u1')).slice(0, 4)
  const skbActive = issues.filter((i) => i.sprintId === 's-skb-5').slice(0, 4)
  ;[...mine, ...skbActive].forEach((iss, k) => {
    notifications.push({
      id: `n${k}`,
      userId: 'u1',
      actorId: pick(['u2', 'u3', 'u4', 'u6']),
      issueId: iss.id,
      text: pick(['commented on', 'changed the status of', 'assigned you to', 'mentioned you on', 'updated']),
      read: k > 3,
      createdAt: iso(subDays(new Date(), k * 0.4 + 0.05)),
    })
  })

  const filters: SavedFilter[] = [
    { id: 'f1', name: 'My open issues', jql: 'assignee = currentUser() AND statusCategory != Done ORDER BY priority DESC', ownerId: 'u1', starred: true, createdAt: iso(subDays(today, 40)) },
    { id: 'f2', name: 'Open bugs — all projects', jql: 'type = Bug AND statusCategory != Done ORDER BY priority DESC, created DESC', ownerId: 'u1', starred: true, createdAt: iso(subDays(today, 30)) },
    { id: 'f3', name: 'WebGL work', jql: 'labels IN (webgl, 3d) ORDER BY updated DESC', ownerId: 'u3', starred: false, createdAt: iso(subDays(today, 20)) },
    { id: 'f4', name: 'Recently resolved', jql: 'resolved >= -7d ORDER BY resolved DESC', ownerId: 'u2', starred: false, createdAt: iso(subDays(today, 10)) },
  ]

  const dashboards: Dashboard[] = [
    {
      id: 'd1',
      name: 'skatebored HQ',
      description: 'Sprint health, workload and incoming bugs at a glance.',
      ownerId: 'u1',
      starred: true,
      gadgets: [
        { id: 'g1', type: 'sprint-health', title: 'Sprint health', config: { projectId: 'p-skb' }, column: 0 },
        { id: 'g2', type: 'sprint-burndown', title: 'Sprint burndown', config: { projectId: 'p-skb' }, column: 0 },
        { id: 'g3', type: 'assigned-to-me', title: 'Assigned to me', config: {}, column: 0 },
        { id: 'g4', type: 'pie-by-status', title: 'Issues by status', config: { projectId: 'p-skb' }, column: 1 },
        { id: 'g5', type: 'workload', title: 'Team workload', config: { projectId: 'p-skb' }, column: 1 },
        { id: 'g6', type: 'filter-results', title: 'Open bugs', config: { filterId: 'f2' }, column: 1 },
        { id: 'g7', type: 'activity-stream', title: 'Activity stream', config: {}, column: 1 },
      ],
    },
  ]

  return { users, projects, sprints, issues, comments, history, worklogs, notifications, filters, dashboards }
}
