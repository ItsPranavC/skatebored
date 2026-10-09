import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { SeedData } from '@/data/seed'
import type {
  Attachment,
  BoardColumn,
  Comment,
  Dashboard,
  Gadget,
  HistoryEntry,
  ID,
  Issue,
  IssueLink,
  LinkType,
  Notification,
  Project,
  RecentItem,
  SavedFilter,
  Sprint,
  Status,
  User,
  WorkLog,
  TeamEvent,
} from '@/types'
import { EPIC_COLORS, nowISO, priorityLabel, issueTypeLabel, uid, fmtDate } from '@/lib/utils'

export const INVERSE_LINK: Record<LinkType, LinkType> = {
  blocks: 'is blocked by',
  'is blocked by': 'blocks',
  'relates to': 'relates to',
  duplicates: 'is duplicated by',
  'is duplicated by': 'duplicates',
  clones: 'is cloned by',
  'is cloned by': 'clones',
}

export interface State extends SeedData {
  currentUserId: ID
  theme: 'dark' | 'light'
  recent: RecentItem[]
  sidebarCollapsed: boolean
  version: number
  /** Last cloud version merged into this cached copy (persisted together with the data). */
  syncCursor: number | null
}

export interface Actions {
  // session / prefs
  setCurrentUser: (id: ID) => void
  setTheme: (t: 'dark' | 'light') => void
  toggleSidebar: () => void
  pushRecent: (item: Omit<RecentItem, 'at'>) => void

  // users
  createUser: (u: Omit<User, 'id' | 'active'>) => User
  updateUser: (id: ID, patch: Partial<User>) => void

  // projects
  createProject: (p: Pick<Project, 'name' | 'key' | 'type' | 'leadId' | 'description'> & Partial<Project>) => Project
  updateProject: (id: ID, patch: Partial<Project>) => void
  deleteProject: (id: ID) => void
  toggleStarProject: (id: ID) => void
  addStatus: (projectId: ID, status: Omit<Status, 'id'>, columnId?: ID | null) => Status
  updateStatus: (projectId: ID, statusId: ID, patch: Partial<Status>) => void
  removeStatus: (projectId: ID, statusId: ID, moveIssuesTo: ID) => void
  setColumns: (projectId: ID, columns: BoardColumn[]) => void

  // issues
  createIssue: (input: Partial<Issue> & Pick<Issue, 'projectId' | 'summary' | 'type'>) => Issue
  updateIssue: (id: ID, patch: Partial<Issue>) => void
  deleteIssue: (id: ID) => void
  cloneIssue: (id: ID) => Issue | null
  /** Re-ranks `ids` in the given order (used by drag & drop). */
  rankIssues: (ids: ID[]) => void
  /** Moves an issue to a sprint (null = backlog) and places it at `index` among `orderedIds`. */
  moveToSprint: (issueIds: ID[], sprintId: ID | null) => void
  addLink: (issueId: ID, type: LinkType, targetId: ID) => void
  removeLink: (issueId: ID, linkId: ID) => void
  toggleWatch: (issueId: ID, userId?: ID) => void
  addAttachment: (issueId: ID, a: Omit<Attachment, 'id' | 'createdAt' | 'authorId'>) => void
  removeAttachment: (issueId: ID, attachmentId: ID) => void

  // comments & work
  addComment: (issueId: ID, body: string) => Comment
  updateComment: (id: ID, body: string) => void
  deleteComment: (id: ID) => void
  logWork: (issueId: ID, minutes: number, comment: string, startedAt?: string, remaining?: number | null) => void
  deleteWorklog: (id: ID) => void

  // sprints
  createSprint: (projectId: ID, patch?: Partial<Sprint>) => Sprint
  updateSprint: (id: ID, patch: Partial<Sprint>) => void
  startSprint: (id: ID, opts: { name: string; goal: string; startDate: string; endDate: string }) => void
  completeSprint: (id: ID, moveIncompleteTo: ID | 'backlog' | 'new') => void
  deleteSprint: (id: ID) => void

  // notifications
  markNotificationRead: (id: ID) => void
  markAllNotificationsRead: () => void

  // filters
  saveFilter: (name: string, jql: string) => SavedFilter
  updateFilter: (id: ID, patch: Partial<SavedFilter>) => void
  deleteFilter: (id: ID) => void

  // dashboards
  createDashboard: (name: string, description?: string) => Dashboard
  updateDashboard: (id: ID, patch: Partial<Dashboard>) => void
  deleteDashboard: (id: ID) => void
  addGadget: (dashboardId: ID, g: Omit<Gadget, 'id'>) => void
  updateGadget: (dashboardId: ID, gadgetId: ID, patch: Partial<Gadget>) => void
  removeGadget: (dashboardId: ID, gadgetId: ID) => void

  // team calendar
  createEvent: (input: Pick<TeamEvent, 'title' | 'start' | 'durationMinutes'> & Partial<Pick<TeamEvent, 'description' | 'location' | 'projectId'>>) => TeamEvent
  updateEvent: (id: ID, patch: Partial<Pick<TeamEvent, 'title' | 'description' | 'location' | 'start' | 'durationMinutes' | 'projectId'>>) => void
  deleteEvent: (id: ID) => void
}

export type Store = State & Actions

/**
 * localStorage that never throws. The cloud is the source of truth; if the browser cache
 * is full or blocked we keep working in memory instead of crashing.
 */
const safeLocalStorage: Storage = {
  get length() {
    try {
      return localStorage.length
    } catch {
      return 0
    }
  },
  key: (i) => {
    try {
      return localStorage.key(i)
    } catch {
      return null
    }
  },
  getItem: (k) => {
    try {
      return localStorage.getItem(k)
    } catch {
      return null
    }
  },
  setItem: (k, v) => {
    try {
      localStorage.setItem(k, v)
    } catch (e) {
      console.warn('[skatebored] local cache not saved (storage full or blocked) — changes are still synced to the cloud', e)
    }
  },
  removeItem: (k) => {
    try {
      localStorage.removeItem(k)
    } catch {
      /* ignore */
    }
  },
  clear: () => {
    try {
      localStorage.clear()
    } catch {
      /* ignore */
    }
  },
}

const emptyWorkspace = (): SeedData => ({
  users: [],
  projects: [],
  sprints: [],
  issues: [],
  comments: [],
  history: [],
  worklogs: [],
  notifications: [],
  filters: [],
  dashboards: [],
  events: [],
})

const initialState = (): State => ({
  // The cloud is the source of truth: a fresh browser starts empty and loads the workspace on sign-in.
  ...emptyWorkspace(),
  currentUserId: '',
  theme: 'dark',
  recent: [],
  sidebarCollapsed: false,
  version: 1,
  syncCursor: null,
})

// ─── helpers to describe field changes in history (Jira "History" tab) ───
function describe(s: State, issue: Issue, field: keyof Issue, value: unknown): string | null {
  if (value == null || value === '') return null
  const user = (id: unknown) => s.users.find((u) => u.id === id)?.name ?? String(id)
  const project = s.projects.find((p) => p.id === issue.projectId)
  switch (field) {
    case 'statusId':
      return project?.statuses.find((x) => x.id === value)?.name ?? String(value)
    case 'assigneeId':
    case 'reporterId':
      return user(value)
    case 'sprintId':
      return s.sprints.find((x) => x.id === value)?.name ?? String(value)
    case 'epicId':
    case 'parentId':
      return s.issues.find((x) => x.id === value)?.key ?? String(value)
    case 'priority':
      return priorityLabel(value as Issue['priority'])
    case 'type':
      return issueTypeLabel(value as Issue['type'])
    case 'labels':
      return (value as string[]).join(', ') || null
    case 'componentIds':
      return (value as string[]).map((id) => project?.components.find((c) => c.id === id)?.name ?? id).join(', ') || null
    case 'fixVersionIds':
      return (value as string[]).map((id) => project?.versions.find((c) => c.id === id)?.name ?? id).join(', ') || null
    case 'dueDate':
    case 'startDate':
      return fmtDate(value as string)
    case 'flagged':
      return value ? 'Impediment' : null
    default:
      return String(value)
  }
}

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
  componentIds: 'Component',
  fixVersionIds: 'Fix Version',
  dueDate: 'duedate',
  startDate: 'Start date',
  originalEstimate: 'Original Estimate',
  flagged: 'Flagged',
  color: 'Epic Colour',
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

export const useStore = create<Store>()(
  persist(
    (set, get) => {
      const me = () => get().currentUserId

      /** Pushes notifications to watchers/assignee (except the actor). */
      const notify = (issue: Issue, text: string, extra: ID[] = []): Notification[] => {
        const actor = me()
        const targets = new Set([...issue.watcherIds, ...(issue.assigneeId ? [issue.assigneeId] : []), issue.reporterId, ...extra])
        targets.delete(actor)
        return [...targets].map((userId) => ({ id: uid('n'), userId, actorId: actor, issueId: issue.id, text, read: false, createdAt: nowISO() }))
      }

      return {
        ...initialState(),

        setCurrentUser: (id) => set({ currentUserId: id }),
        setTheme: (theme) => set({ theme }),
        toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
        pushRecent: (item) =>
          set((s) => ({
            recent: [{ ...item, at: nowISO() }, ...s.recent.filter((r) => !(r.kind === item.kind && r.id === item.id))].slice(0, 30),
          })),

        createUser: (u) => {
          const user: User = { ...u, id: uid('u'), active: true }
          set((s) => ({ users: [...s.users, user] }))
          return user
        },
        updateUser: (id, patch) => set((s) => ({ users: s.users.map((u) => (u.id === id ? { ...u, ...patch } : u)) })),

        // ─────────── projects ───────────
        createProject: (input) => {
          const key = input.key.toUpperCase()
          const statuses: Status[] = [
            { id: `${key}-todo`, name: 'To Do', category: 'todo' },
            { id: `${key}-prog`, name: 'In Progress', category: 'inprogress' },
            { id: `${key}-review`, name: 'In Review', category: 'inprogress' },
            { id: `${key}-done`, name: 'Done', category: 'done' },
          ]
          const project: Project = {
            id: uid('p-'),
            category: 'Software',
            color: EPIC_COLORS[get().projects.length % EPIC_COLORS.length]!,
            icon: '🛹',
            memberIds: [me(), input.leadId].filter((v, i, a) => a.indexOf(v) === i),
            statuses,
            columns: statuses.map((st) => ({ id: uid('col-'), name: st.name, statusIds: [st.id], wipLimit: null })),
            components: [],
            versions: [],
            issueCounter: 0,
            starred: false,
            estimation: 'points',
            createdAt: nowISO(),
            ...input,
            key,
          }
          set((s) => ({ projects: [...s.projects, project] }))
          if (project.type === 'scrum') get().createSprint(project.id)
          return project
        },
        updateProject: (id, patch) => set((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
        deleteProject: (id) =>
          set((s) => {
            const issueIds = new Set(s.issues.filter((i) => i.projectId === id).map((i) => i.id))
            return {
              projects: s.projects.filter((p) => p.id !== id),
              issues: s.issues.filter((i) => !issueIds.has(i.id)),
              sprints: s.sprints.filter((sp) => sp.projectId !== id),
              comments: s.comments.filter((c) => !issueIds.has(c.issueId)),
              history: s.history.filter((h) => !issueIds.has(h.issueId)),
              worklogs: s.worklogs.filter((w) => !issueIds.has(w.issueId)),
              notifications: s.notifications.filter((n) => !issueIds.has(n.issueId)),
              recent: s.recent.filter((r) => r.id !== id && !issueIds.has(r.id)),
            }
          }),
        toggleStarProject: (id) => set((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, starred: !p.starred } : p)) })),
        addStatus: (projectId, status, columnId) => {
          const st: Status = { ...status, id: uid('st-') }
          set((s) => ({
            projects: s.projects.map((p) => {
              if (p.id !== projectId) return p
              const columns =
                columnId === undefined
                  ? [...p.columns]
                  : p.columns.map((c) => (c.id === columnId ? { ...c, statusIds: [...c.statusIds, st.id] } : c))
              // default: new column for the status, inserted before the last (done) column
              if (columnId === undefined) {
                const col: BoardColumn = { id: uid('col-'), name: st.name, statusIds: [st.id], wipLimit: null }
                const doneIdx = columns.findIndex((c) => c.statusIds.some((sid) => p.statuses.find((x) => x.id === sid)?.category === 'done'))
                if (st.category !== 'done' && doneIdx >= 0) columns.splice(doneIdx, 0, col)
                else columns.push(col)
              }
              return { ...p, statuses: [...p.statuses, st], columns }
            }),
          }))
          return st
        },
        updateStatus: (projectId, statusId, patch) =>
          set((s) => ({
            projects: s.projects.map((p) =>
              p.id === projectId ? { ...p, statuses: p.statuses.map((st) => (st.id === statusId ? { ...st, ...patch } : st)) } : p,
            ),
          })),
        removeStatus: (projectId, statusId, moveTo) =>
          set((s) => ({
            projects: s.projects.map((p) =>
              p.id === projectId
                ? {
                    ...p,
                    statuses: p.statuses.filter((st) => st.id !== statusId),
                    columns: p.columns.map((c) => ({ ...c, statusIds: c.statusIds.filter((x) => x !== statusId) })),
                  }
                : p,
            ),
            issues: s.issues.map((i) => (i.projectId === projectId && i.statusId === statusId ? { ...i, statusId: moveTo, updatedAt: nowISO() } : i)),
          })),
        setColumns: (projectId, columns) => set((s) => ({ projects: s.projects.map((p) => (p.id === projectId ? { ...p, columns } : p)) })),

        // ─────────── issues ───────────
        createIssue: (input) => {
          const s = get()
          const project = s.projects.find((p) => p.id === input.projectId)
          if (!project) throw new Error('Unknown project')
          const n = project.issueCounter + 1
          const ts = nowISO()
          const parent = input.parentId ? s.issues.find((i) => i.id === input.parentId) : undefined
          const maxRank = s.issues.reduce((m, i) => Math.max(m, i.rank), 0)
          const issue: Issue = {
            id: uid('i-'),
            key: `${project.key}-${n}`,
            description: '',
            statusId: project.statuses.find((st) => st.category === 'todo')?.id ?? project.statuses[0]!.id,
            priority: 'medium',
            assigneeId: null,
            reporterId: me(),
            storyPoints: null,
            labels: [],
            sprintId: parent?.sprintId ?? null,
            epicId: parent?.epicId ?? null,
            parentId: null,
            componentIds: [],
            fixVersionIds: [],
            dueDate: null,
            startDate: null,
            color: input.type === 'epic' ? EPIC_COLORS[n % EPIC_COLORS.length]! : null,
            originalEstimate: null,
            timeSpent: 0,
            rank: maxRank + 1000,
            watcherIds: [me()],
            links: [],
            attachments: [],
            flagged: false,
            createdAt: ts,
            updatedAt: ts,
            resolvedAt: null,
            ...input,
          }
          if (project.statuses.find((st) => st.id === issue.statusId)?.category === 'done') issue.resolvedAt = ts
          const h: HistoryEntry = { id: uid('h'), issueId: issue.id, userId: me(), field: 'created', from: null, to: null, createdAt: ts }
          set((st) => ({
            issues: [...st.issues, issue],
            history: [...st.history, h],
            projects: st.projects.map((p) => (p.id === project.id ? { ...p, issueCounter: n } : p)),
            notifications: issue.assigneeId && issue.assigneeId !== me() ? [...notify(issue, 'assigned you to'), ...st.notifications] : st.notifications,
          }))
          return issue
        },

        updateIssue: (id, patch) => {
          const s = get()
          const issue = s.issues.find((i) => i.id === id)
          if (!issue) return
          const ts = nowISO()
          const project = s.projects.find((p) => p.id === issue.projectId)
          const entries: HistoryEntry[] = []
          for (const k of Object.keys(patch) as (keyof Issue)[]) {
            if (same(issue[k], patch[k])) continue
            const label = FIELD_LABEL[k]
            if (!label) continue
            entries.push({
              id: uid('h'),
              issueId: id,
              userId: me(),
              field: label,
              from: describe(s, issue, k, issue[k]),
              to: describe(s, issue, k, patch[k]),
              createdAt: ts,
            })
          }
          if (!entries.length && !Object.keys(patch).some((k) => !same(issue[k as keyof Issue], patch[k as keyof Issue]))) return
          const next: Issue = { ...issue, ...patch, updatedAt: ts }
          // resolution tracking
          if (patch.statusId && patch.statusId !== issue.statusId) {
            const cat = project?.statuses.find((x) => x.id === patch.statusId)?.category
            next.resolvedAt = cat === 'done' ? ts : null
          }
          let notes: Notification[] = []
          if (patch.assigneeId && patch.assigneeId !== issue.assigneeId) notes = notify(next, 'assigned you to', [patch.assigneeId]).filter((n) => n.userId === patch.assigneeId)
          else if (patch.statusId && patch.statusId !== issue.statusId) notes = notify(next, 'changed the status of')
          else if (entries.length) notes = notify(next, 'updated')
          set((st) => ({
            issues: st.issues.map((i) => {
              if (i.id === id) return next
              // sub-tasks follow their parent's sprint
              if (patch.sprintId !== undefined && i.parentId === id) return { ...i, sprintId: patch.sprintId }
              return i
            }),
            history: [...st.history, ...entries],
            notifications: [...notes, ...st.notifications].slice(0, 300),
          }))
        },

        deleteIssue: (id) =>
          set((s) => {
            const doomed = new Set([id, ...s.issues.filter((i) => i.parentId === id).map((i) => i.id)])
            return {
              issues: s.issues
                .filter((i) => !doomed.has(i.id))
                .map((i) => ({
                  ...i,
                  epicId: i.epicId && doomed.has(i.epicId) ? null : i.epicId,
                  links: i.links.filter((l) => !doomed.has(l.issueId)),
                })),
              comments: s.comments.filter((c) => !doomed.has(c.issueId)),
              history: s.history.filter((h) => !doomed.has(h.issueId)),
              worklogs: s.worklogs.filter((w) => !doomed.has(w.issueId)),
              notifications: s.notifications.filter((n) => !doomed.has(n.issueId)),
              recent: s.recent.filter((r) => !doomed.has(r.id)),
            }
          }),

        cloneIssue: (id) => {
          const src = get().issues.find((i) => i.id === id)
          if (!src) return null
          const copy = get().createIssue({
            projectId: src.projectId,
            type: src.type,
            summary: `CLONE - ${src.summary}`,
            description: src.description,
            priority: src.priority,
            labels: [...src.labels],
            storyPoints: src.storyPoints,
            epicId: src.epicId,
            parentId: src.parentId,
            sprintId: src.sprintId,
            componentIds: [...src.componentIds],
            fixVersionIds: [...src.fixVersionIds],
            assigneeId: src.assigneeId,
            originalEstimate: src.originalEstimate,
            color: src.color,
            rank: src.rank + 1,
          })
          get().addLink(copy.id, 'clones', src.id)
          return copy
        },

        rankIssues: (ids) =>
          set((s) => {
            // Keep the overall rank space: reuse the sorted ranks these issues already occupy.
            const ranks = ids
              .map((id) => s.issues.find((i) => i.id === id)?.rank ?? 0)
              .sort((a, b) => a - b)
            // ensure strictly increasing
            for (let k = 1; k < ranks.length; k++) if (ranks[k]! <= ranks[k - 1]!) ranks[k] = ranks[k - 1]! + 1
            const map = new Map(ids.map((id, k) => [id, ranks[k]!]))
            return { issues: s.issues.map((i) => (map.has(i.id) ? { ...i, rank: map.get(i.id)! } : i)) }
          }),

        moveToSprint: (issueIds, sprintId) => {
          for (const id of issueIds) {
            const issue = get().issues.find((i) => i.id === id)
            if (issue && issue.sprintId !== sprintId) get().updateIssue(id, { sprintId })
          }
        },

        addLink: (issueId, type, targetId) => {
          if (issueId === targetId) return
          const s = get()
          const a = s.issues.find((i) => i.id === issueId)
          const b = s.issues.find((i) => i.id === targetId)
          if (!a || !b || a.links.some((l) => l.issueId === targetId && l.type === type)) return
          const link: IssueLink = { id: uid('l'), type, issueId: targetId }
          const back: IssueLink = { id: uid('l'), type: INVERSE_LINK[type], issueId }
          const ts = nowISO()
          set((st) => ({
            issues: st.issues.map((i) =>
              i.id === issueId ? { ...i, links: [...i.links, link], updatedAt: ts } : i.id === targetId ? { ...i, links: [...i.links, back], updatedAt: ts } : i,
            ),
            history: [...st.history, { id: uid('h'), issueId, userId: me(), field: 'Link', from: null, to: `This issue ${type} ${b.key}`, createdAt: ts }],
          }))
        },
        removeLink: (issueId, linkId) =>
          set((s) => {
            const issue = s.issues.find((i) => i.id === issueId)
            const link = issue?.links.find((l) => l.id === linkId)
            if (!issue || !link) return {}
            const inverse = INVERSE_LINK[link.type]
            return {
              issues: s.issues.map((i) =>
                i.id === issueId
                  ? { ...i, links: i.links.filter((l) => l.id !== linkId) }
                  : i.id === link.issueId
                    ? { ...i, links: i.links.filter((l) => !(l.issueId === issueId && l.type === inverse)) }
                    : i,
              ),
            }
          }),
        toggleWatch: (issueId, userId) => {
          const u = userId ?? me()
          set((s) => ({
            issues: s.issues.map((i) =>
              i.id === issueId ? { ...i, watcherIds: i.watcherIds.includes(u) ? i.watcherIds.filter((w) => w !== u) : [...i.watcherIds, u] } : i,
            ),
          }))
        },
        addAttachment: (issueId, a) => {
          const att: Attachment = { ...a, id: uid('a'), authorId: me(), createdAt: nowISO() }
          set((s) => ({
            issues: s.issues.map((i) => (i.id === issueId ? { ...i, attachments: [...i.attachments, att], updatedAt: nowISO() } : i)),
            history: [...s.history, { id: uid('h'), issueId, userId: me(), field: 'Attachment', from: null, to: a.name, createdAt: nowISO() }],
          }))
        },
        removeAttachment: (issueId, attachmentId) =>
          set((s) => ({ issues: s.issues.map((i) => (i.id === issueId ? { ...i, attachments: i.attachments.filter((a) => a.id !== attachmentId) } : i)) })),

        // ─────────── comments & work ───────────
        addComment: (issueId, body) => {
          const c: Comment = { id: uid('c'), issueId, authorId: me(), body, createdAt: nowISO(), updatedAt: null }
          const issue = get().issues.find((i) => i.id === issueId)
          // @mentions → notify + watch
          const mentioned = get()
            .users.filter((u) => body.includes(`@${u.name.split(' ')[0]}`))
            .map((u) => u.id)
          set((s) => ({
            comments: [...s.comments, c],
            issues: s.issues.map((i) =>
              i.id === issueId ? { ...i, updatedAt: c.createdAt, watcherIds: Array.from(new Set([...i.watcherIds, me()])) } : i,
            ),
            notifications: issue
              ? [
                  ...mentioned.filter((m) => m !== me()).map((userId) => ({ id: uid('n'), userId, actorId: me(), issueId, text: 'mentioned you on', read: false, createdAt: c.createdAt })),
                  ...notify(issue, 'commented on').filter((n) => !mentioned.includes(n.userId)),
                  ...s.notifications,
                ]
              : s.notifications,
          }))
          return c
        },
        updateComment: (id, body) => set((s) => ({ comments: s.comments.map((c) => (c.id === id ? { ...c, body, updatedAt: nowISO() } : c)) })),
        deleteComment: (id) => set((s) => ({ comments: s.comments.filter((c) => c.id !== id) })),
        logWork: (issueId, minutes, comment, startedAt, remaining) => {
          const w: WorkLog = { id: uid('w'), issueId, userId: me(), minutes, comment, startedAt: startedAt ?? nowISO() }
          set((s) => ({
            worklogs: [...s.worklogs, w],
            issues: s.issues.map((i) => {
              if (i.id !== issueId) return i
              const spent = i.timeSpent + minutes
              // Jira semantics: optionally set remaining estimate → original = spent + remaining
              const originalEstimate = remaining != null ? spent + remaining : i.originalEstimate
              return { ...i, timeSpent: spent, originalEstimate, updatedAt: nowISO() }
            }),
            history: [...s.history, { id: uid('h'), issueId, userId: me(), field: 'timespent', from: null, to: `${minutes}m logged`, createdAt: nowISO() }],
          }))
        },
        deleteWorklog: (id) =>
          set((s) => {
            const w = s.worklogs.find((x) => x.id === id)
            if (!w) return {}
            return {
              worklogs: s.worklogs.filter((x) => x.id !== id),
              issues: s.issues.map((i) => (i.id === w.issueId ? { ...i, timeSpent: Math.max(0, i.timeSpent - w.minutes) } : i)),
            }
          }),

        // ─────────── sprints ───────────
        createSprint: (projectId, patch) => {
          const s = get()
          const project = s.projects.find((p) => p.id === projectId)!
          const existing = s.sprints.filter((sp) => sp.projectId === projectId)
          const lastNum = existing.reduce((m, sp) => {
            const n = parseInt(sp.name.match(/(\d+)\s*$/)?.[1] ?? '0', 10)
            return Math.max(m, n)
          }, 0)
          const sprint: Sprint = {
            id: uid('s-'),
            projectId,
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
          }
          set((st) => ({ sprints: [...st.sprints, sprint] }))
          return sprint
        },
        updateSprint: (id, patch) => set((s) => ({ sprints: s.sprints.map((sp) => (sp.id === id ? { ...sp, ...patch } : sp)) })),
        startSprint: (id, opts) => {
          const s = get()
          const issues = s.issues.filter((i) => i.sprintId === id && i.type !== 'subtask')
          set((st) => ({
            sprints: st.sprints.map((sp) =>
              sp.id === id
                ? {
                    ...sp,
                    ...opts,
                    state: 'active',
                    committedIssueIds: issues.map((i) => i.id),
                    committedPoints: issues.reduce((n, i) => n + (i.storyPoints ?? 0), 0),
                  }
                : sp,
            ),
          }))
        },
        completeSprint: (id, moveTo) => {
          const s = get()
          const sprint = s.sprints.find((sp) => sp.id === id)
          if (!sprint) return
          const project = s.projects.find((p) => p.id === sprint.projectId)
          const doneIds = new Set(project?.statuses.filter((st) => st.category === 'done').map((st) => st.id))
          const inSprint = s.issues.filter((i) => i.sprintId === id && i.type !== 'subtask')
          const completed = inSprint.filter((i) => doneIds.has(i.statusId))
          const incomplete = inSprint.filter((i) => !doneIds.has(i.statusId))
          set((st) => ({
            sprints: st.sprints.map((sp) =>
              sp.id === id
                ? {
                    ...sp,
                    state: 'closed',
                    completedAt: nowISO(),
                    completedIssueIds: completed.map((i) => i.id),
                    completedPoints: completed.reduce((n, i) => n + (i.storyPoints ?? 0), 0),
                    incompleteIssueIds: incomplete.map((i) => i.id),
                  }
                : sp,
            ),
          }))
          let target: ID | null = null
          if (moveTo === 'new') target = get().createSprint(sprint.projectId).id
          else if (moveTo !== 'backlog') target = moveTo
          get().moveToSprint(
            incomplete.map((i) => i.id),
            target,
          )
        },
        deleteSprint: (id) =>
          set((s) => ({
            sprints: s.sprints.filter((sp) => sp.id !== id),
            issues: s.issues.map((i) => (i.sprintId === id ? { ...i, sprintId: null } : i)),
          })),

        // ─────────── notifications ───────────
        markNotificationRead: (id) => set((s) => ({ notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) })),
        markAllNotificationsRead: () =>
          set((s) => ({ notifications: s.notifications.map((n) => (n.userId === s.currentUserId ? { ...n, read: true } : n)) })),

        // ─────────── filters ───────────
        saveFilter: (name, jql) => {
          const f: SavedFilter = { id: uid('f'), name, jql, ownerId: me(), starred: true, createdAt: nowISO() }
          set((s) => ({ filters: [...s.filters, f] }))
          return f
        },
        updateFilter: (id, patch) => set((s) => ({ filters: s.filters.map((f) => (f.id === id ? { ...f, ...patch } : f)) })),
        deleteFilter: (id) => set((s) => ({ filters: s.filters.filter((f) => f.id !== id) })),

        // ─────────── team calendar ───────────
        createEvent: (input) => {
          const now = nowISO()
          const e: TeamEvent = { description: '', location: '', projectId: null, ...input, id: uid('ev'), createdById: me(), createdAt: now, updatedAt: now }
          set((s) => ({ events: [...s.events, e] }))
          return e
        },
        updateEvent: (id, patch) => set((s) => ({ events: s.events.map((e) => (e.id === id ? { ...e, ...patch, updatedAt: nowISO() } : e)) })),
        deleteEvent: (id) => set((s) => ({ events: s.events.filter((e) => e.id !== id) })),

        // ─────────── dashboards ───────────
        createDashboard: (name, description = '') => {
          const d: Dashboard = { id: uid('d'), name, description, ownerId: me(), starred: false, gadgets: [] }
          set((s) => ({ dashboards: [...s.dashboards, d] }))
          return d
        },
        updateDashboard: (id, patch) => set((s) => ({ dashboards: s.dashboards.map((d) => (d.id === id ? { ...d, ...patch } : d)) })),
        deleteDashboard: (id) => set((s) => ({ dashboards: s.dashboards.filter((d) => d.id !== id) })),
        addGadget: (dashboardId, g) =>
          set((s) => ({ dashboards: s.dashboards.map((d) => (d.id === dashboardId ? { ...d, gadgets: [...d.gadgets, { ...g, id: uid('g') }] } : d)) })),
        updateGadget: (dashboardId, gadgetId, patch) =>
          set((s) => ({
            dashboards: s.dashboards.map((d) =>
              d.id === dashboardId ? { ...d, gadgets: d.gadgets.map((g) => (g.id === gadgetId ? { ...g, ...patch } : g)) } : d,
            ),
          })),
        removeGadget: (dashboardId, gadgetId) =>
          set((s) => ({ dashboards: s.dashboards.map((d) => (d.id === dashboardId ? { ...d, gadgets: d.gadgets.filter((g) => g.id !== gadgetId) } : d)) })),
      }
    },
    {
      name: 'skatebored-scrum',
      version: 2,
      storage: createJSONStorage(() => safeLocalStorage),
      // v1 → v2: adds syncCursor. Missing fields are filled from defaults by `merge`.
      migrate: (persisted) => ({ ...(persisted as object), syncCursor: null }) as Store,
      // Deep-enough merge: keep every persisted field, fall back to defaults for new ones.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<State>
        const out = { ...current, ...p } as Store
        for (const k of ['users', 'projects', 'sprints', 'issues', 'comments', 'history', 'worklogs', 'notifications', 'filters', 'dashboards', 'events', 'recent'] as const) {
          if (!Array.isArray(out[k])) (out as unknown as Record<string, unknown>)[k] = current[k]
        }
        return out
      },
    },
  ),
)

// ─────────────────────────── selectors / hooks ───────────────────────────

export const useMe = () => {
  const id = useStore((s) => s.currentUserId)
  const users = useStore((s) => s.users)
  return users.find((u) => u.id === id) ?? users[0]!
}

export const useProjectByKey = (key: string | undefined) => {
  const projects = useStore((s) => s.projects)
  return projects.find((p) => p.key.toLowerCase() === key?.toLowerCase())
}

export const useUser = (id: ID | null | undefined) => {
  const users = useStore((s) => s.users)
  return id ? users.find((u) => u.id === id) : undefined
}

export const getIssueByKey = (key: string) => useStore.getState().issues.find((i) => i.key.toLowerCase() === key.toLowerCase())
