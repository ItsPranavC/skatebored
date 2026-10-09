import { clsx, type ClassValue } from 'clsx'
import { formatDistanceToNowStrict, format, parseISO, isValid } from 'date-fns'
import type { Issue, IssueType, Priority, Project, Status, StatusCategory } from '@/types'

export const cn = (...v: ClassValue[]) => clsx(v)

export const uid = (prefix = '') =>
  prefix + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4)

export const nowISO = () => new Date().toISOString()

export function toDate(v: string | null | undefined): Date | null {
  if (!v) return null
  const d = parseISO(v)
  return isValid(d) ? d : null
}

export function fmtDate(v: string | null | undefined, pattern = 'd MMM yyyy') {
  const d = toDate(v)
  return d ? format(d, pattern) : ''
}

export function timeAgo(v: string | null | undefined) {
  const d = toDate(v)
  if (!d) return ''
  const diff = Date.now() - d.getTime()
  if (diff < 45_000) return 'just now'
  return formatDistanceToNowStrict(d, { addSuffix: true })
}

/** Jira-style duration: 90 → "1h 30m", 2400 → "1w" (5d weeks, 8h days). */
export function fmtDuration(minutes: number | null | undefined) {
  if (minutes == null || minutes <= 0) return minutes === 0 ? '0m' : ''
  const units: [string, number][] = [
    ['w', 5 * 8 * 60],
    ['d', 8 * 60],
    ['h', 60],
    ['m', 1],
  ]
  let rest = Math.round(minutes)
  const parts: string[] = []
  for (const [u, size] of units) {
    const n = Math.floor(rest / size)
    if (n) {
      parts.push(`${n}${u}`)
      rest -= n * size
    }
  }
  return parts.join(' ')
}

/** Parses "1w 2d 3h 30m" (or a bare number of hours) into minutes. Returns null if invalid. */
export function parseDuration(input: string): number | null {
  const s = input.trim().toLowerCase()
  if (!s) return null
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(parseFloat(s) * 60)
  const re = /(\d+(?:\.\d+)?)\s*([wdhm])/g
  let total = 0
  let matched = ''
  let m: RegExpExecArray | null
  while ((m = re.exec(s))) {
    const n = parseFloat(m[1])
    total += n * { w: 2400, d: 480, h: 60, m: 1 }[m[2] as 'w' | 'd' | 'h' | 'm']
    matched += m[0]
  }
  if (!matched || matched.replace(/\s/g, '') !== s.replace(/\s/g, '')) return null
  return Math.round(total)
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('')
}

export const ISSUE_TYPES: { id: IssueType; label: string }[] = [
  { id: 'task', label: 'Task' },
  { id: 'bug', label: 'Bug' },
  { id: 'epic', label: 'Epic' },
  { id: 'subtask', label: 'Sub-task' },
]

export const issueTypeLabel = (t: IssueType) => ISSUE_TYPES.find((x) => x.id === t)?.label ?? t

export const PRIORITIES: { id: Priority; label: string; color: string }[] = [
  { id: 'highest', label: 'Highest', color: '#ff5630' },
  { id: 'high', label: 'High', color: '#f04c4c' },
  { id: 'medium', label: 'Medium', color: '#f2a93b' },
  { id: 'low', label: 'Low', color: '#4c9aff' },
  { id: 'lowest', label: 'Lowest', color: '#7a9cc6' },
]
export const priorityLabel = (p: Priority) => PRIORITIES.find((x) => x.id === p)?.label ?? p
export const priorityWeight = (p: Priority) => PRIORITIES.findIndex((x) => x.id === p)

export const EPIC_COLORS = ['#f04c4c', '#f2a93b', '#5cc47e', '#6ea0ff', '#b48cff', '#ff7ab6', '#38c6c6', '#c9a27e']

export function statusOf(project: Project | undefined, statusId: string): Status | undefined {
  return project?.statuses.find((s) => s.id === statusId)
}

export function categoryOf(project: Project | undefined, statusId: string): StatusCategory {
  return statusOf(project, statusId)?.category ?? 'todo'
}

export const isDone = (project: Project | undefined, issue: Issue) => categoryOf(project, issue.statusId) === 'done'

export const byRank = (a: Issue, b: Issue) => a.rank - b.rank

export const sumPoints = (issues: Issue[]) => issues.reduce((n, i) => n + (i.storyPoints ?? 0), 0)

/** Deterministic hue for labels. */
export function labelColor(label: string) {
  let h = 0
  for (const c of label) h = (h * 31 + c.charCodeAt(0)) % 360
  return `hsl(${h} 55% 60%)`
}

export function download(filename: string, text: string, mime = 'text/plain') {
  const blob = new Blob([text], { type: mime })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

export function toCSV(rows: (string | number | null | undefined)[][]) {
  return rows
    .map((r) =>
      r
        .map((c) => {
          const s = c == null ? '' : String(c)
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
        })
        .join(','),
    )
    .join('\n')
}
