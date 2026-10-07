import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { differenceInCalendarDays } from 'date-fns'
import { Activity, BarChart3, Gauge, PieChart as PieIcon, Search, TrendingUp, UserRound, Users } from 'lucide-react'
import type { Gadget, GadgetType, Issue } from '@/types'
import { useStore } from '@/store/store'
import { useJql } from '@/lib/useJql'
import { cn, timeAgo } from '@/lib/utils'
import { Avatar, IssueKey, IssueTypeIcon, PriorityIcon, StatusLozenge, useIssueModal } from '@/components/jira'
import { BurndownChart, CreatedResolvedChart, Donut, StatusSplitBar, WorkloadChart } from '@/features/reports/charts'
import { computeBurndown, computeWorkload, groupIssues, indexHistory, progressOf, type PieField } from '@/features/reports/compute'

export interface GadgetDef {
  type: GadgetType
  title: string
  description: string
  icon: ReactNode
  needs: ('project' | 'filter')[]
}

export const GADGETS: GadgetDef[] = [
  { type: 'sprint-health', title: 'Sprint health', description: 'Time elapsed, work complete, scope change and blockers for the active sprint.', icon: <Gauge className="size-5" />, needs: ['project'] },
  { type: 'sprint-burndown', title: 'Sprint burndown', description: 'Remaining work in the active sprint against the ideal guideline.', icon: <TrendingUp className="size-5" />, needs: ['project'] },
  { type: 'assigned-to-me', title: 'Assigned to me', description: 'Your unresolved issues across every project, highest priority first.', icon: <UserRound className="size-5" />, needs: [] },
  { type: 'filter-results', title: 'Filter results', description: 'Show the issues returned by any saved filter.', icon: <Search className="size-5" />, needs: ['filter'] },
  { type: 'pie-by-status', title: 'Pie chart — status', description: 'Issues in a project grouped by status.', icon: <PieIcon className="size-5" />, needs: ['project'] },
  { type: 'pie-by-assignee', title: 'Pie chart — assignee', description: 'Unresolved issues grouped by assignee.', icon: <PieIcon className="size-5" />, needs: ['project'] },
  { type: 'pie-by-priority', title: 'Pie chart — priority', description: 'Unresolved issues grouped by priority.', icon: <PieIcon className="size-5" />, needs: ['project'] },
  { type: 'created-vs-resolved', title: 'Created vs. resolved', description: 'Cumulative created and resolved issues over the last 30 days.', icon: <BarChart3 className="size-5" />, needs: ['project'] },
  { type: 'workload', title: 'Team workload', description: 'Work per person in the active sprint, split by status category.', icon: <Users className="size-5" />, needs: ['project'] },
  { type: 'activity-stream', title: 'Activity stream', description: 'Latest changes and comments across your projects.', icon: <Activity className="size-5" />, needs: [] },
]

export const gadgetDef = (t: GadgetType) => GADGETS.find((g) => g.type === t)!

function Empty({ children }: { children: ReactNode }) {
  return <div className="grid min-h-28 place-items-center px-4 py-6 text-center text-[13px] text-muted">{children}</div>
}

function MiniIssueTable({ issues, max = 8, more }: { issues: Issue[]; max?: number; more?: ReactNode }) {
  const projects = useStore((s) => s.projects)
  const users = useStore((s) => s.users)
  const { open } = useIssueModal()
  if (!issues.length) return <Empty>Nothing here — nice.</Empty>
  return (
    <div>
      <table className="w-full text-[13px]">
        <tbody>
          {issues.slice(0, max).map((i) => {
            const st = projects.find((p) => p.id === i.projectId)?.statuses.find((s) => s.id === i.statusId)
            return (
              <tr key={i.id} onClick={() => open(i.key)} className="cursor-pointer border-t border-line first:border-t-0 hover:bg-hover">
                <td className="w-5 py-1.5 pr-2">
                  <IssueTypeIcon type={i.type} />
                </td>
                <td className="py-1.5 pr-2 whitespace-nowrap">
                  <IssueKey issue={i} />
                </td>
                <td className="w-full max-w-0 truncate py-1.5 pr-2" title={i.summary}>{i.summary}</td>
                <td className="w-5 py-1.5 pr-2">
                  <PriorityIcon priority={i.priority} />
                </td>
                <td className="py-1.5 pr-2 whitespace-nowrap">
                  <StatusLozenge status={st} />
                </td>
                <td className="w-6 py-1.5">
                  <Avatar user={users.find((u) => u.id === i.assigneeId)} size="xs" />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {(issues.length > max || more) && (
        <div className="mt-2 flex items-center justify-between text-[12px] text-muted">
          <span>
            Showing {Math.min(max, issues.length)} of {issues.length}
          </span>
          {more}
        </div>
      )}
    </div>
  )
}

function useProjectCfg(g: Gadget) {
  const projects = useStore((s) => s.projects)
  return projects.find((p) => p.id === g.config.projectId)
}

function useActiveSprint(projectId?: string) {
  const sprints = useStore((s) => s.sprints)
  return sprints.find((s) => s.projectId === projectId && s.state === 'active')
}

// ───────────────────────────── gadgets ─────────────────────────────

function AssignedToMe() {
  const r = useJql('assignee = currentUser() AND statusCategory != Done ORDER BY priority DESC, updated DESC')
  return (
    <MiniIssueTable
      issues={r.issues}
      more={
        <Link to={`/issues?jql=${encodeURIComponent('assignee = currentUser() AND statusCategory != Done ORDER BY priority DESC')}`} className="text-accent hover:underline">
          View all
        </Link>
      }
    />
  )
}

function FilterResults({ g }: { g: Gadget }) {
  const filter = useStore((s) => s.filters.find((f) => f.id === g.config.filterId))
  const r = useJql(filter?.jql ?? '')
  if (!filter) return <Empty>Choose a saved filter from the gadget menu → Configure.</Empty>
  if (r.error) return <Empty>Filter error: {r.error}</Empty>
  return (
    <MiniIssueTable
      issues={r.issues}
      more={
        <Link to={`/issues?filter=${filter.id}`} className="text-accent hover:underline">
          Open “{filter.name}”
        </Link>
      }
    />
  )
}

function SprintBurndownGadget({ g }: { g: Gadget }) {
  const project = useProjectCfg(g)
  const sprint = useActiveSprint(project?.id)
  if (!project) return <Empty>Choose a project in Configure.</Empty>
  if (!sprint) return <Empty>{project.name} has no active sprint.</Empty>
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-[12px] text-muted">
        <span className="font-medium text-fg">{sprint.name}</span>
        <Link to={`/projects/${project.key}/reports/burndown?sprint=${sprint.id}`} className="text-accent hover:underline">
          Full report
        </Link>
      </div>
      <BurndownChart sprint={sprint} project={project} mode={project.estimation} height={200} compact />
    </div>
  )
}

function SprintHealth({ g }: { g: Gadget }) {
  const project = useProjectCfg(g)
  const sprint = useActiveSprint(project?.id)
  const issues = useStore((s) => s.issues)
  const history = useStore((s) => s.history)
  const projects = useStore((s) => s.projects)
  const bd = useMemo(() => (sprint && project ? computeBurndown(sprint, project, issues, indexHistory(history), project.estimation) : null), [sprint, project, issues, history])
  if (!project) return <Empty>Choose a project in Configure.</Empty>
  if (!sprint || !bd) return <Empty>{project.name} has no active sprint.</Empty>
  const inSprint = issues.filter((i) => i.sprintId === sprint.id && i.type !== 'subtask')
  const pr = progressOf(inSprint, projects, project.estimation)
  const elapsed = Math.min(1, Math.max(0, (Date.now() - bd.window.start) / (bd.window.end - bd.window.start)))
  const daysLeft = Math.max(0, differenceInCalendarDays(new Date(bd.window.end), new Date()))
  const added = bd.events.filter((e) => e.kind === 'added').reduce((n, e) => n + e.change, 0)
  const scopeChange = bd.startScope ? Math.round((added / bd.startScope) * 100) : 0
  const blockers = inSprint.filter((i) => i.flagged).length
  const donePct = pr.total ? pr.done / pr.total : 0
  const behind = donePct + 0.1 < elapsed
  const metric = (label: string, value: ReactNode, hint: ReactNode, tone?: 'bad' | 'good') => (
    <div className="rounded-xl bg-surface-2 px-3 py-2.5">
      <div className="text-[11px] font-semibold tracking-wide text-subtle uppercase">{label}</div>
      <div className={cn('display mt-0.5 text-[22px] tabular-nums', tone === 'bad' && 'text-accent', tone === 'good' && 'text-success')}>{value}</div>
      <div className="text-[11px] text-muted">{hint}</div>
    </div>
  )
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2 text-[13px]">
        <Link to={`/projects/${project.key}/board`} className="font-semibold hover:text-accent">
          {sprint.name}
        </Link>
        <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-bold uppercase', behind ? 'bg-accent-soft text-accent' : 'bg-done text-done-fg')}>{behind ? '⚠ Behind' : '✓ On track'}</span>
      </div>
      {sprint.goal && <p className="mb-3 text-[13px] text-muted">{sprint.goal}</p>}
      <div className="grid grid-cols-2 gap-2">
        {metric('Time elapsed', `${Math.round(elapsed * 100)}%`, `${daysLeft} days left`)}
        {metric('Work complete', `${Math.round(donePct * 100)}%`, `${pr.done} of ${pr.total} ${project.estimation === 'points' ? 'pts' : 'issues'}`, behind ? 'bad' : 'good')}
        {metric('Scope change', `${scopeChange > 0 ? '+' : ''}${scopeChange}%`, `${added} added since start`, scopeChange > 15 ? 'bad' : undefined)}
        {metric('Blockers', blockers, blockers === 1 ? 'flagged issue' : 'flagged issues', blockers ? 'bad' : 'good')}
      </div>
      <StatusSplitBar className="mt-3" todo={pr.todo} inprogress={pr.inprogress} done={pr.done} labels />
    </div>
  )
}

function PieGadget({ g, field }: { g: Gadget; field: PieField }) {
  const project = useProjectCfg(g)
  const issues = useStore((s) => s.issues)
  const projects = useStore((s) => s.projects)
  const users = useStore((s) => s.users)
  const rows = useMemo(() => {
    if (!project) return []
    const done = new Set(project.statuses.filter((s) => s.category === 'done').map((s) => s.id))
    const scoped = issues.filter((i) => i.projectId === project.id && i.type !== 'epic' && (field === 'status' || !done.has(i.statusId)))
    return groupIssues(scoped, field, { projects, users, all: issues })
  }, [project, issues, projects, users, field])
  if (!project) return <Empty>Choose a project in Configure.</Empty>
  return <Donut rows={rows} height={170} />
}

function CreatedResolvedGadget({ g }: { g: Gadget }) {
  const project = useProjectCfg(g)
  const all = useStore((s) => s.issues)
  const issues = useMemo(() => all.filter((i) => i.projectId === project?.id), [all, project?.id])
  if (!project) return <Empty>Choose a project in Configure.</Empty>
  return <CreatedResolvedChart issues={issues} days={30} cumulative height={200} />
}

function WorkloadGadget({ g }: { g: Gadget }) {
  const project = useProjectCfg(g)
  const sprint = useActiveSprint(project?.id)
  const issues = useStore((s) => s.issues)
  const projects = useStore((s) => s.projects)
  const users = useStore((s) => s.users)
  const rows = useMemo(() => {
    if (!project) return []
    const done = new Set(project.statuses.filter((s) => s.category === 'done').map((s) => s.id))
    const scoped = issues.filter((i) => i.projectId === project.id && i.type !== 'epic' && i.type !== 'subtask' && (sprint ? i.sprintId === sprint.id : !done.has(i.statusId)))
    return computeWorkload(scoped, projects, users, project.estimation)
  }, [project, sprint, issues, projects, users])
  if (!project) return <Empty>Choose a project in Configure.</Empty>
  if (!rows.length) return <Empty>No work in scope.</Empty>
  return (
    <div>
      <div className="mb-2 text-[12px] text-muted">{sprint ? sprint.name : 'Unresolved issues'}</div>
      <WorkloadChart rows={rows} mode={project.estimation} />
    </div>
  )
}

function ActivityStream({ g }: { g: Gadget }) {
  const history = useStore((s) => s.history)
  const comments = useStore((s) => s.comments)
  const issues = useStore((s) => s.issues)
  const users = useStore((s) => s.users)
  const items = useMemo(() => {
    const byId = new Map(issues.map((i) => [i.id, i]))
    const inScope = (i?: Issue) => !!i && (!g.config.projectId || i.projectId === g.config.projectId)
    const h = history
      .filter((x) => inScope(byId.get(x.issueId)) && x.field !== 'Link')
      .map((x) => ({ id: x.id, at: x.createdAt, userId: x.userId, issue: byId.get(x.issueId)!, kind: 'h' as const, field: x.field, to: x.to }))
    const c = comments.filter((x) => inScope(byId.get(x.issueId))).map((x) => ({ id: x.id, at: x.createdAt, userId: x.authorId, issue: byId.get(x.issueId)!, kind: 'c' as const, field: '', to: x.body }))
    return [...h, ...c].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 14)
  }, [history, comments, issues, g.config.projectId])
  if (!items.length) return <Empty>No activity yet.</Empty>
  const verb = (it: (typeof items)[number]) => {
    if (it.kind === 'c') return 'commented on'
    if (it.field === 'created') return 'created'
    if (it.field === 'status') return <>changed the status to <b className="font-semibold">{it.to}</b> on</>
    if (it.field === 'assignee') return it.to ? <>assigned <b className="font-semibold">{it.to}</b> to</> : 'unassigned'
    if (it.field === 'Sprint') return it.to ? <>moved to <b className="font-semibold">{it.to}</b></> : 'removed from sprint'
    if (it.field === 'timespent') return 'logged work on'
    return <>updated {it.field} on</>
  }
  return (
    <ul className="space-y-3">
      {items.map((it) => {
        const u = users.find((x) => x.id === it.userId)
        return (
          <li key={it.id} className="flex gap-2.5 text-[13px]">
            <Avatar user={u} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="leading-snug">
                <span className="font-semibold">{u?.name ?? 'Someone'}</span> <span className="text-muted">{verb(it)}</span> <IssueKey issue={it.issue} />{' '}
                <span className="text-muted">{it.issue.summary}</span>
              </div>
              {it.kind === 'c' && <div className="mt-1 line-clamp-2 rounded-lg bg-surface-2 px-2.5 py-1.5 text-[12px] text-muted">{it.to}</div>}
              <div className="mt-0.5 text-[11px] text-subtle">{timeAgo(it.at)}</div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

export function GadgetBody({ g }: { g: Gadget }) {
  switch (g.type) {
    case 'assigned-to-me':
      return <AssignedToMe />
    case 'filter-results':
      return <FilterResults g={g} />
    case 'sprint-burndown':
      return <SprintBurndownGadget g={g} />
    case 'sprint-health':
      return <SprintHealth g={g} />
    case 'pie-by-status':
      return <PieGadget g={g} field="status" />
    case 'pie-by-assignee':
      return <PieGadget g={g} field="assignee" />
    case 'pie-by-priority':
      return <PieGadget g={g} field="priority" />
    case 'created-vs-resolved':
      return <CreatedResolvedGadget g={g} />
    case 'workload':
      return <WorkloadGadget g={g} />
    case 'activity-stream':
      return <ActivityStream g={g} />
  }
}

