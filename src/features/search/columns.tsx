import type { ReactNode } from 'react'
import type { Issue, Project, Sprint, User } from '@/types'
import { Avatar, EpicTag, IssueTypeIcon, LabelTag, PriorityIcon, StatusLozenge } from '@/components/jira'
import { fmtDate, issueTypeLabel, priorityLabel } from '@/lib/utils'

export interface ColCtx {
  project?: Project
  users: Map<string, User>
  issues: Map<string, Issue>
  sprints: Map<string, Sprint>
}

export interface ColumnDef {
  id: string
  label: string
  /** JQL ORDER BY field */
  sort?: string
  width?: string
  render: (i: Issue, c: ColCtx) => ReactNode
  text: (i: Issue, c: ColCtx) => string
}

const userCell = (u?: User) =>
  u ? (
    <span className="flex items-center gap-2 whitespace-nowrap">
      <Avatar user={u} size="xs" showTooltip={false} />
      {u.name}
    </span>
  ) : (
    <span className="text-subtle">Unassigned</span>
  )

export const COLUMNS: ColumnDef[] = [
  { id: 'type', label: 'T', sort: 'type', width: 'w-10', render: (i) => <IssueTypeIcon type={i.type} />, text: (i) => issueTypeLabel(i.type) },
  { id: 'key', label: 'Key', sort: 'key', width: 'w-24', render: (i) => <span className="font-medium whitespace-nowrap text-muted">{i.key}</span>, text: (i) => i.key },
  { id: 'summary', label: 'Summary', sort: 'summary', render: (i) => <span className="line-clamp-1 font-medium">{i.summary}</span>, text: (i) => i.summary },
  { id: 'assignee', label: 'Assignee', sort: 'assignee', render: (i, c) => userCell(i.assigneeId ? c.users.get(i.assigneeId) : undefined), text: (i, c) => (i.assigneeId ? c.users.get(i.assigneeId)?.name ?? '' : '') },
  { id: 'reporter', label: 'Reporter', render: (i, c) => userCell(c.users.get(i.reporterId)), text: (i, c) => c.users.get(i.reporterId)?.name ?? '' },
  {
    id: 'priority',
    label: 'P',
    sort: 'priority',
    width: 'w-10',
    render: (i) => <PriorityIcon priority={i.priority} />,
    text: (i) => priorityLabel(i.priority),
  },
  {
    id: 'status',
    label: 'Status',
    sort: 'status',
    render: (i, c) => <StatusLozenge status={c.project?.statuses.find((s) => s.id === i.statusId)} />,
    text: (i, c) => c.project?.statuses.find((s) => s.id === i.statusId)?.name ?? '',
  },
  {
    id: 'resolution',
    label: 'Resolution',
    sort: 'resolved',
    render: (i) => (i.resolvedAt ? <span className="whitespace-nowrap">Done</span> : <span className="text-subtle italic">Unresolved</span>),
    text: (i) => (i.resolvedAt ? 'Done' : 'Unresolved'),
  },
  { id: 'created', label: 'Created', sort: 'created', render: (i) => <span className="whitespace-nowrap text-muted">{fmtDate(i.createdAt)}</span>, text: (i) => fmtDate(i.createdAt, 'yyyy-MM-dd HH:mm') },
  { id: 'updated', label: 'Updated', sort: 'updated', render: (i) => <span className="whitespace-nowrap text-muted">{fmtDate(i.updatedAt)}</span>, text: (i) => fmtDate(i.updatedAt, 'yyyy-MM-dd HH:mm') },
  { id: 'due', label: 'Due', sort: 'due', render: (i) => <span className="whitespace-nowrap text-muted">{fmtDate(i.dueDate)}</span>, text: (i) => fmtDate(i.dueDate, 'yyyy-MM-dd') },
  {
    id: 'sprint',
    label: 'Sprint',
    render: (i, c) => <span className="whitespace-nowrap text-muted">{i.sprintId ? c.sprints.get(i.sprintId)?.name : ''}</span>,
    text: (i, c) => (i.sprintId ? c.sprints.get(i.sprintId)?.name ?? '' : ''),
  },
  {
    id: 'points',
    label: 'Story points',
    sort: 'storyPoints',
    render: (i) => <span className="tabular-nums">{i.storyPoints ?? ''}</span>,
    text: (i) => (i.storyPoints == null ? '' : String(i.storyPoints)),
  },
  {
    id: 'labels',
    label: 'Labels',
    render: (i) => (
      <span className="flex flex-wrap gap-1">
        {i.labels.map((l) => (
          <LabelTag key={l} label={l} />
        ))}
      </span>
    ),
    text: (i) => i.labels.join(' '),
  },
  {
    id: 'epic',
    label: 'Epic',
    render: (i, c) => <EpicTag epic={i.epicId ? c.issues.get(i.epicId) : null} />,
    text: (i, c) => (i.epicId ? c.issues.get(i.epicId)?.summary ?? '' : ''),
  },
]

export const DEFAULT_COLUMNS = ['type', 'key', 'summary', 'assignee', 'reporter', 'priority', 'status', 'resolution', 'created', 'updated']

const LS_KEY = 'skatebored-issue-columns'
export function loadColumns(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(LS_KEY) ?? 'null')
    if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return v.filter((x) => COLUMNS.some((c) => c.id === x))
  } catch {
    /* ignore */
  }
  return DEFAULT_COLUMNS
}
export function saveColumns(cols: string[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(cols))
  } catch {
    /* ignore */
  }
}

/** Replaces (or toggles) the ORDER BY clause of a JQL string. */
export function withSort(jql: string, field: string): string {
  const m = jql.match(/\border\s+by\s+([\w"]+)(?:\s+(asc|desc))?/i)
  const base = jql.replace(/\s*\border\s+by[\s\S]*$/i, '').trim()
  let dir = field === 'created' || field === 'updated' || field === 'priority' || field === 'resolved' ? 'DESC' : 'ASC'
  if (m && m[1]!.toLowerCase() === field.toLowerCase()) dir = (m[2] ?? 'ASC').toUpperCase() === 'ASC' ? 'DESC' : 'ASC'
  return `${base}${base ? ' ' : ''}ORDER BY ${field} ${dir}`
}

export function currentSort(jql: string): { field: string; dir: 'asc' | 'desc' } | null {
  const m = jql.match(/\border\s+by\s+([\w"]+)(?:\s+(asc|desc))?/i)
  return m ? { field: m[1]!.toLowerCase(), dir: (m[2] ?? 'asc').toLowerCase() as 'asc' | 'desc' } : null
}
