/**
 * Report math. Everything is reconstructed from the issue history log so charts
 * reflect what actually happened (scope changes, reopenings), not just today's state.
 */
import { addDays, differenceInCalendarDays, format, startOfDay, endOfDay, isWeekend } from 'date-fns'
import type { HistoryEntry, Issue, Project, Sprint, StatusCategory, User, WorkLog } from '@/types'
import { priorityLabel, issueTypeLabel } from '@/lib/utils'

export type Estimation = 'points' | 'count'

export const valueOf = (issue: Issue, mode: Estimation) => (mode === 'count' ? 1 : (issue.storyPoints ?? 0))

/** Groups history by issue, sorted ascending by time. */
export function indexHistory(history: HistoryEntry[]) {
  const map = new Map<string, HistoryEntry[]>()
  for (const h of history) {
    const arr = map.get(h.issueId)
    if (arr) arr.push(h)
    else map.set(h.issueId, [h])
  }
  for (const arr of map.values()) arr.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  return map
}
export type HistoryIndex = ReturnType<typeof indexHistory>

const ts = (v: string) => Date.parse(v)

// ───────────────────────────── status over time ─────────────────────────────

/** Status id of an issue at time t (ms), reconstructed from 'status' history. */
export function statusIdAt(issue: Issue, project: Project, hist: HistoryEntry[] | undefined, t: number): string | null {
  if (ts(issue.createdAt) > t) return null
  const entries = (hist ?? []).filter((h) => h.field === 'status')
  const byName = (name: string | null) => project.statuses.find((s) => s.name === name)?.id
  let last: HistoryEntry | undefined
  for (const h of entries) {
    if (ts(h.createdAt) <= t) last = h
    else break
  }
  if (last) return byName(last.to) ?? issue.statusId
  const first = entries[0]
  if (first) return byName(first.from) ?? project.statuses.find((s) => s.category === 'todo')?.id ?? issue.statusId
  return issue.statusId
}

export function categoryAt(issue: Issue, project: Project, hist: HistoryEntry[] | undefined, t: number): StatusCategory | null {
  const id = statusIdAt(issue, project, hist, t)
  if (!id) return null
  const cat = project.statuses.find((s) => s.id === id)?.category
  if (cat) return cat
  return issue.resolvedAt && ts(issue.resolvedAt) <= t ? 'done' : 'todo'
}

// ───────────────────────────── sprint membership ─────────────────────────────

const sprintEntries = (hist: HistoryEntry[] | undefined, sprint: Sprint) =>
  (hist ?? []).filter((h) => h.field === 'Sprint' && (h.to === sprint.name || h.from === sprint.name))

/** Was the issue in the sprint at t? `strict` evaluates just before t. */
export function inSprintAt(issue: Issue, sprint: Sprint, hist: HistoryEntry[] | undefined, t: number, strict = false) {
  if (ts(issue.createdAt) > t) return false
  const ev = sprintEntries(hist, sprint)
  let last: HistoryEntry | undefined
  let next: HistoryEntry | undefined
  for (const h of ev) {
    const ht = ts(h.createdAt)
    if (strict ? ht < t : ht <= t) last = h
    else {
      next = h
      break
    }
  }
  if (last) return last.to === sprint.name
  if (next) return next.from === sprint.name
  return issue.sprintId === sprint.id || sprint.committedIssueIds.includes(issue.id)
}

export interface SprintWindow {
  start: number
  end: number
  /** last moment with data (now for active sprints) */
  cutoff: number
  closed: boolean
}

export function sprintWindow(sprint: Sprint): SprintWindow | null {
  if (!sprint.startDate) return null
  const start = ts(sprint.startDate)
  const plannedEnd = sprint.endDate ? ts(sprint.endDate) : start + 14 * 864e5
  const closed = sprint.state === 'closed'
  const end = closed && sprint.completedAt ? ts(sprint.completedAt) : plannedEnd
  const cutoff = closed ? end : Math.min(Date.now(), plannedEnd)
  return { start, end: Math.max(end, plannedEnd), cutoff, closed }
}

/** Issues that touched the sprint at any point (parents only — like Jira). */
export function sprintCandidates(sprint: Sprint, issues: Issue[], hIndex: HistoryIndex) {
  const ids = new Set([...sprint.committedIssueIds, ...sprint.completedIssueIds, ...sprint.incompleteIssueIds])
  return issues.filter(
    (i) => i.type !== 'subtask' && i.type !== 'epic' && (i.sprintId === sprint.id || ids.has(i.id) || sprintEntries(hIndex.get(i.id), sprint).length > 0),
  )
}

// ───────────────────────────── burndown ─────────────────────────────

export interface BurnEvent {
  t: number
  issue: Issue | null
  kind: 'start' | 'added' | 'removed' | 'completed' | 'reopened' | 'end'
  change: number
  remaining: number
  scope: number
  done: number
}

export interface BurndownResult {
  window: SprintWindow
  startScope: number
  events: BurnEvent[]
  /** step series for the chart */
  series: { t: number; remaining: number | null; scope: number | null; done: number | null; ideal: number | null }[]
  weekends: [number, number][]
}

export function computeBurndown(sprint: Sprint, project: Project, issues: Issue[], hIndex: HistoryIndex, mode: Estimation): BurndownResult | null {
  const win = sprintWindow(sprint)
  if (!win) return null
  const cands = sprintCandidates(sprint, issues, hIndex)
  const state = (t: number, strict = false) => {
    let scope = 0
    let done = 0
    const per = new Map<string, { inS: boolean; done: boolean }>()
    for (const i of cands) {
      const hist = hIndex.get(i.id)
      const inS = inSprintAt(i, sprint, hist, t, strict)
      const d = categoryAt(i, project, hist, t) === 'done'
      per.set(i.id, { inS, done: d })
      if (inS) {
        scope += valueOf(i, mode)
        if (d) done += valueOf(i, mode)
      }
    }
    return { scope, done, per }
  }

  // candidate event times inside the window
  const times = new Set<number>()
  for (const i of cands) {
    for (const h of hIndex.get(i.id) ?? []) {
      if (h.field !== 'status' && h.field !== 'Sprint') continue
      const t = ts(h.createdAt)
      if (t > win.start && (win.closed ? t < win.cutoff : t <= win.cutoff)) times.add(t)
    }
    const c = ts(i.createdAt)
    if (c > win.start && c <= win.cutoff && i.sprintId === sprint.id && !(hIndex.get(i.id) ?? []).some((h) => h.field === 'Sprint')) times.add(c)
  }
  const sorted = [...times].sort((a, b) => a - b)

  const s0 = state(win.start)
  const startScope = s0.scope - s0.done
  const events: BurnEvent[] = [
    { t: win.start, issue: null, kind: 'start', change: 0, remaining: s0.scope - s0.done, scope: s0.scope, done: s0.done },
  ]
  let prev = s0
  for (const t of sorted) {
    const cur = state(t)
    let running = prev.scope - prev.done
    for (const i of cands) {
      const a = prev.per.get(i.id)!
      const b = cur.per.get(i.id)!
      const v = valueOf(i, mode)
      let kind: BurnEvent['kind'] | null = null
      let change = 0
      if (!a.inS && b.inS) [kind, change] = ['added', b.done ? 0 : v]
      else if (a.inS && !b.inS) [kind, change] = ['removed', a.done ? 0 : -v]
      else if (a.inS && b.inS && !a.done && b.done) [kind, change] = ['completed', -v]
      else if (a.inS && b.inS && a.done && !b.done) [kind, change] = ['reopened', v]
      if (!kind) continue
      // running total so simultaneous events each show their own step
      running += change
      events.push({ t, issue: i, kind, change, remaining: running, scope: cur.scope, done: cur.done })
    }
    if (events.length) events[events.length - 1]!.remaining = cur.scope - cur.done
    prev = cur
  }
  if (win.closed) {
    const last = state(win.cutoff, true)
    events.push({ t: win.cutoff, issue: null, kind: 'end', change: 0, remaining: last.scope - last.done, scope: last.scope, done: last.done })
  }

  // Step series: duplicate points so the line is a true step even on a time axis.
  const series: BurndownResult['series'] = []
  let lastRem = events[0]!.remaining
  for (const e of events) {
    if (series.length) series.push({ t: e.t, remaining: lastRem, scope: null, done: null, ideal: null })
    series.push({ t: e.t, remaining: e.remaining, scope: e.scope, done: e.done, ideal: null })
    lastRem = e.remaining
  }
  if (!win.closed) series.push({ t: win.cutoff, remaining: lastRem, scope: events.at(-1)!.scope, done: events.at(-1)!.done, ideal: null })
  // ideal guideline endpoints
  series[0]!.ideal = startScope
  series.push({ t: win.end, remaining: null, scope: null, done: null, ideal: 0 })

  return { window: win, startScope, events, series, weekends: weekendBands(win.start, win.end) }
}

export function weekendBands(start: number, end: number): [number, number][] {
  const out: [number, number][] = []
  let d = startOfDay(new Date(start))
  while (d.getTime() < end) {
    if (isWeekend(d)) {
      const a = Math.max(d.getTime(), start)
      const b = Math.min(endOfDay(d).getTime(), end)
      const prev = out.at(-1)
      if (prev && a - prev[1] < 2) prev[1] = b
      else out.push([a, b])
    }
    d = addDays(d, 1)
  }
  return out
}

/** Daily burnup samples: total scope + completed. */
export function computeBurnup(sprint: Sprint, project: Project, issues: Issue[], hIndex: HistoryIndex, mode: Estimation) {
  const bd = computeBurndown(sprint, project, issues, hIndex, mode)
  if (!bd) return null
  const { window: win } = bd
  const days = Math.max(1, differenceInCalendarDays(new Date(win.end), new Date(win.start)))
  const startEv = bd.events[0]!
  const points: { t: number; scope: number | null; done: number | null; guide: number }[] = []
  for (let k = 0; k <= days; k++) {
    const t = Math.min(win.start + k * 864e5, win.end)
    const ev = [...bd.events].reverse().find((e) => e.t <= t)!
    const has = t <= win.cutoff + 1
    points.push({ t, scope: has ? ev.scope : null, done: has ? ev.done : null, guide: startEv.scope * (k / days) })
  }
  return { window: win, points, weekends: bd.weekends }
}

// ───────────────────────────── sprint report ─────────────────────────────

export function computeSprintReport(sprint: Sprint, project: Project, issues: Issue[], hIndex: HistoryIndex) {
  const win = sprintWindow(sprint)
  if (!win) return null
  const cands = sprintCandidates(sprint, issues, hIndex)
  const doneAtEnd = (i: Issue) => categoryAt(i, project, hIndex.get(i.id), win.closed ? win.cutoff - 1 : win.cutoff) === 'done'
  const completed: Issue[] = []
  const notCompleted: Issue[] = []
  const removed: Issue[] = []
  const addedAfterStart = new Set<string>()
  for (const i of cands) {
    const h = hIndex.get(i.id)
    const atStart = inSprintAt(i, sprint, h, win.start)
    const atEnd = win.closed
      ? sprint.completedIssueIds.includes(i.id) || sprint.incompleteIssueIds.includes(i.id) || inSprintAt(i, sprint, h, win.cutoff, true)
      : inSprintAt(i, sprint, h, win.cutoff)
    if (!atStart && atEnd) addedAfterStart.add(i.id)
    if (!atEnd) {
      removed.push(i)
      continue
    }
    const isDoneEnd = win.closed && (sprint.completedIssueIds.length || sprint.incompleteIssueIds.length) ? sprint.completedIssueIds.includes(i.id) : doneAtEnd(i)
    ;(isDoneEnd ? completed : notCompleted).push(i)
  }
  return { window: win, completed, notCompleted, removed, addedAfterStart }
}

// ───────────────────────────── velocity ─────────────────────────────

export function computeVelocity(sprints: Sprint[], issues: Issue[], mode: Estimation, limit = 7) {
  const byId = new Map(issues.map((i) => [i.id, i]))
  const closed = sprints
    .filter((s) => s.state === 'closed')
    .sort((a, b) => a.order - b.order)
    .slice(-limit)
  const rows = closed.map((s) => {
    const committed = mode === 'count' ? s.committedIssueIds.length : s.committedPoints
    const completed = mode === 'count' ? s.completedIssueIds.length : s.completedPoints
    return {
      id: s.id,
      name: s.name,
      committed,
      completed,
      completedIssues: s.completedIssueIds.map((id) => byId.get(id)).filter(Boolean) as Issue[],
    }
  })
  const avg = rows.length ? rows.reduce((n, r) => n + r.completed, 0) / rows.length : 0
  return { rows, avg }
}

// ───────────────────────────── CFD ─────────────────────────────

export function computeCFD(project: Project, issues: Issue[], hIndex: HistoryIndex, days: number) {
  const projIssues = issues.filter((i) => i.projectId === project.id && i.type !== 'subtask')
  const today = startOfDay(new Date())
  const rows: Record<string, number | string>[] = []
  for (let k = days; k >= 0; k--) {
    const day = addDays(today, -k)
    const t = Math.min(endOfDay(day).getTime(), Date.now())
    const row: Record<string, number | string> = { t: day.getTime(), label: format(day, 'd MMM') }
    for (const s of project.statuses) row[s.id] = 0
    for (const i of projIssues) {
      const sid = statusIdAt(i, project, hIndex.get(i.id), t)
      if (sid && row[sid] !== undefined) (row[sid] as number)++
    }
    rows.push(row)
  }
  return rows
}

// ───────────────────────────── control chart ─────────────────────────────

export function computeControl(project: Project, issues: Issue[], hIndex: HistoryIndex, days: number) {
  const since = Date.now() - days * 864e5
  const inProgNames = new Set(project.statuses.filter((s) => s.category !== 'todo').map((s) => s.name))
  const pts: { t: number; days: number; issue: Issue }[] = []
  for (const i of issues) {
    if (i.projectId !== project.id || !i.resolvedAt || i.type === 'epic') continue
    const r = ts(i.resolvedAt)
    if (r < since) continue
    const firstStart = (hIndex.get(i.id) ?? []).find((h) => h.field === 'status' && h.to && inProgNames.has(h.to))
    const start = firstStart ? ts(firstStart.createdAt) : ts(i.createdAt)
    pts.push({ t: r, days: Math.max(0, (r - start) / 864e5), issue: i })
  }
  pts.sort((a, b) => a.t - b.t)
  const window = Math.max(3, Math.round(pts.length / 5))
  const rolling = pts.map((p, k) => {
    const slice = pts.slice(Math.max(0, k - window + 1), k + 1)
    return { t: p.t, avg: slice.reduce((n, x) => n + x.days, 0) / slice.length }
  })
  const sortedDays = pts.map((p) => p.days).sort((a, b) => a - b)
  const median = sortedDays.length ? sortedDays[Math.floor(sortedDays.length / 2)]! : 0
  const average = sortedDays.length ? sortedDays.reduce((a, b) => a + b, 0) / sortedDays.length : 0
  return { pts, rolling, median, average, window }
}

// ───────────────────────────── created vs resolved ─────────────────────────────

export function computeCreatedResolved(issues: Issue[], days: number, cumulative: boolean) {
  const today = startOfDay(new Date())
  const start = addDays(today, -days)
  const rows: { t: number; label: string; created: number; resolved: number }[] = []
  let cC = 0
  let cR = 0
  for (let k = 0; k <= days; k++) {
    const d = addDays(start, k)
    const a = d.getTime()
    const b = endOfDay(d).getTime()
    const created = issues.filter((i) => {
      const t = ts(i.createdAt)
      return t >= a && t <= b
    }).length
    const resolved = issues.filter((i) => {
      if (!i.resolvedAt) return false
      const t = ts(i.resolvedAt)
      return t >= a && t <= b
    }).length
    cC += created
    cR += resolved
    rows.push({ t: a, label: format(d, 'd MMM'), created: cumulative ? cC : created, resolved: cumulative ? cR : resolved })
  }
  return { rows, totalCreated: cC, totalResolved: cR }
}

// ───────────────────────────── pie / grouping ─────────────────────────────

export type PieField = 'status' | 'assignee' | 'priority' | 'type' | 'epic' | 'labels' | 'component'

export function groupIssues(issues: Issue[], field: PieField, ctx: { projects: Project[]; users: User[]; all: Issue[] }) {
  const counts = new Map<string, number>()
  const add = (k: string) => counts.set(k, (counts.get(k) ?? 0) + 1)
  for (const i of issues) {
    const project = ctx.projects.find((p) => p.id === i.projectId)
    switch (field) {
      case 'status':
        add(project?.statuses.find((s) => s.id === i.statusId)?.name ?? 'Unknown')
        break
      case 'assignee':
        add(ctx.users.find((u) => u.id === i.assigneeId)?.name ?? 'Unassigned')
        break
      case 'priority':
        add(priorityLabel(i.priority))
        break
      case 'type':
        add(issueTypeLabel(i.type))
        break
      case 'epic':
        add(ctx.all.find((e) => e.id === i.epicId)?.summary ?? 'No epic')
        break
      case 'labels':
        if (!i.labels.length) add('No labels')
        i.labels.forEach(add)
        break
      case 'component':
        if (!i.componentIds.length) add('No component')
        i.componentIds.forEach((c) => add(project?.components.find((x) => x.id === c)?.name ?? c))
        break
    }
  }
  const rows = [...counts.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  // fold the tail into "Other" — never generate a 9th hue
  if (rows.length > 8) {
    const head = rows.slice(0, 7)
    const other = rows.slice(7).reduce((n, r) => n + r.value, 0)
    return [...head, { name: `Other (${rows.length - 7})`, value: other }]
  }
  return rows
}

// ───────────────────────────── progress by category ─────────────────────────────

export function progressOf(issues: Issue[], projects: Project[], mode: Estimation) {
  const res = { todo: 0, inprogress: 0, done: 0, total: 0, count: issues.length }
  for (const i of issues) {
    const p = projects.find((x) => x.id === i.projectId)
    const cat = p?.statuses.find((s) => s.id === i.statusId)?.category ?? 'todo'
    const v = valueOf(i, mode)
    res[cat] += v
    res.total += v
  }
  return res
}

// ───────────────────────────── workload ─────────────────────────────

export function computeWorkload(issues: Issue[], projects: Project[], users: User[], mode: Estimation) {
  const rows = new Map<string, { id: string; name: string; user?: User; todo: number; inprogress: number; done: number; issues: number }>()
  for (const i of issues) {
    const p = projects.find((x) => x.id === i.projectId)
    const cat = p?.statuses.find((s) => s.id === i.statusId)?.category ?? 'todo'
    const key = i.assigneeId ?? '__none'
    const user = users.find((u) => u.id === i.assigneeId)
    const row = rows.get(key) ?? { id: key, name: user?.name ?? 'Unassigned', user, todo: 0, inprogress: 0, done: 0, issues: 0 }
    row[cat] += valueOf(i, mode)
    row.issues++
    rows.set(key, row)
  }
  return [...rows.values()].sort((a, b) => b.todo + b.inprogress + b.done - (a.todo + a.inprogress + a.done))
}

// ───────────────────────────── time tracking ─────────────────────────────

export function computeTimeTracking(issues: Issue[], worklogs: WorkLog[]) {
  return issues
    .filter((i) => i.originalEstimate != null || i.timeSpent > 0)
    .map((i) => {
      const est = i.originalEstimate ?? 0
      const spent = i.timeSpent
      const remaining = Math.max(0, est - spent)
      const logs = worklogs.filter((w) => w.issueId === i.id).length
      return { issue: i, est, spent, remaining, variance: est ? spent + remaining - est : 0, logs }
    })
}

export const fmtDay = (t: number) => format(new Date(t), 'd MMM')
export const fmtDayTime = (t: number) => format(new Date(t), 'd MMM, HH:mm')
