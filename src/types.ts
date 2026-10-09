export type ID = string

export type IssueType = 'epic' | 'task' | 'bug' | 'subtask'
export type Priority = 'highest' | 'high' | 'medium' | 'low' | 'lowest'
export type StatusCategory = 'todo' | 'inprogress' | 'done'

export interface User {
  id: ID
  name: string
  email: string
  title: string
  color: string
  active: boolean
  /** Profile photo from the identity provider (Clerk) */
  avatarUrl?: string | null
  /** Clerk user id once this person has signed in */
  clerkId?: string | null
}

export interface Status {
  id: ID
  name: string
  category: StatusCategory
}

/** A board column maps one or more statuses. */
export interface BoardColumn {
  id: ID
  name: string
  statusIds: ID[]
  wipLimit?: number | null
}

export interface Component {
  id: ID
  name: string
  description: string
  leadId: ID | null
}

export interface Version {
  id: ID
  name: string
  description: string
  startDate: string | null
  releaseDate: string | null
  released: boolean
  archived: boolean
}

export interface Project {
  id: ID
  key: string
  name: string
  description: string
  type: 'scrum'
  category: string
  leadId: ID
  color: string
  icon: string
  memberIds: ID[]
  statuses: Status[]
  columns: BoardColumn[]
  components: Component[]
  versions: Version[]
  issueCounter: number
  starred: boolean
  /** GitHub "owner/name" slug — lets coding agents open the right local clone. */
  repo?: string | null
  /** Board "estimation statistic" — story points or issue count. */
  estimation: 'points' | 'count'
  createdAt: string
}

export type SprintState = 'future' | 'active' | 'closed'

export interface Sprint {
  id: ID
  projectId: ID
  name: string
  goal: string
  state: SprintState
  startDate: string | null
  endDate: string | null
  completedAt: string | null
  /** Snapshot taken at start: issue ids and total points committed. */
  committedIssueIds: ID[]
  committedPoints: number
  /** Snapshot taken at completion. */
  completedIssueIds: ID[]
  completedPoints: number
  incompleteIssueIds: ID[]
  order: number
}

export type LinkType = 'blocks' | 'is blocked by' | 'relates to' | 'duplicates' | 'is duplicated by' | 'clones' | 'is cloned by'

export interface IssueLink {
  id: ID
  type: LinkType
  issueId: ID
}

export interface Attachment {
  id: ID
  name: string
  size: number
  mime: string
  /** data: URL for small files */
  url: string
  authorId: ID
  createdAt: string
}

export interface Issue {
  id: ID
  key: string
  projectId: ID
  type: IssueType
  summary: string
  description: string
  statusId: ID
  priority: Priority
  assigneeId: ID | null
  reporterId: ID
  storyPoints: number | null
  labels: string[]
  sprintId: ID | null
  epicId: ID | null
  parentId: ID | null
  componentIds: ID[]
  fixVersionIds: ID[]
  dueDate: string | null
  startDate: string | null
  /** Epic colour (epics only) */
  color: string | null
  /** minutes */
  originalEstimate: number | null
  timeSpent: number
  rank: number
  watcherIds: ID[]
  links: IssueLink[]
  attachments: Attachment[]
  flagged: boolean
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
}

export interface Comment {
  id: ID
  issueId: ID
  authorId: ID
  body: string
  createdAt: string
  updatedAt: string | null
}

export interface HistoryEntry {
  id: ID
  issueId: ID
  userId: ID
  /** field name, or 'created' */
  field: string
  from: string | null
  to: string | null
  createdAt: string
}

export interface WorkLog {
  id: ID
  issueId: ID
  userId: ID
  minutes: number
  comment: string
  startedAt: string
}

export interface Notification {
  id: ID
  userId: ID
  actorId: ID
  issueId: ID
  text: string
  read: boolean
  createdAt: string
}

export interface SavedFilter {
  id: ID
  name: string
  jql: string
  ownerId: ID
  starred: boolean
  createdAt: string
}

export type GadgetType =
  | 'assigned-to-me'
  | 'sprint-burndown'
  | 'pie-by-status'
  | 'pie-by-assignee'
  | 'pie-by-priority'
  | 'activity-stream'
  | 'created-vs-resolved'
  | 'filter-results'
  | 'sprint-health'
  | 'workload'

export interface Gadget {
  id: ID
  type: GadgetType
  title: string
  /** e.g. projectId, filterId */
  config: Record<string, string>
  column: 0 | 1
}

export interface Dashboard {
  id: ID
  name: string
  description: string
  ownerId: ID
  starred: boolean
  gadgets: Gadget[]
}

export interface RecentItem {
  kind: 'issue' | 'project' | 'board' | 'filter' | 'dashboard'
  id: ID
  at: string
}
