import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { Issue, Project } from '@/types'
import { useStore } from '@/store/store'
import { cn, download, fmtDate, fmtDuration, toCSV } from '@/lib/utils'
import { Select } from '@/components/ui/overlay'
import { Avatar, IssueTypeIcon } from '@/components/jira'
import { Donut, StatusSplitBar, WorkloadChart, useChartTheme } from './charts'
import { computeTimeTracking, computeWorkload, groupIssues, progressOf, type Estimation, type PieField } from './compute'
import { IssueTable, ModeToggle, Panel, ReportShell, Stat } from './common'

type Scope = 'all' | 'open' | 'sprint'

function useScopedIssues(project: Project, scope: Scope) {
  const issues = useStore((s) => s.issues)
  const sprints = useStore((s) => s.sprints)
  return useMemo(() => {
    const running = new Set(sprints.filter((s) => s.projectId === project.id && s.state === 'active').map((s) => s.id))
    const done = new Set(project.statuses.filter((s) => s.category === 'done').map((s) => s.id))
    return issues.filter(
      (i) =>
        i.projectId === project.id &&
        i.type !== 'epic' &&
        (scope === 'all' || (scope === 'open' && !done.has(i.statusId)) || (scope === 'sprint' && !!i.sprintId && running.has(i.sprintId))),
    )
  }, [issues, sprints, project, scope])
}

const scopeOptions = (project: Project) => [
  { value: 'all' as Scope, label: 'All issues' },
  { value: 'open' as Scope, label: 'Unresolved issues' },
  ...(project.type === 'scrum' ? [{ value: 'sprint' as Scope, label: 'Running sprints' }] : []),
]

// ───────────────────────────── pie ─────────────────────────────

export const PIE_FIELDS: { value: PieField; label: string }[] = [
  { value: 'status', label: 'Status' },
  { value: 'assignee', label: 'Assignee' },
  { value: 'priority', label: 'Priority' },
  { value: 'type', label: 'Issue type' },
  { value: 'epic', label: 'Epic' },
  { value: 'labels', label: 'Labels' },
  { value: 'component', label: 'Component' },
]

export function PieReport({ project }: { project: Project }) {
  const [params, setParams] = useSearchParams()
  const field = (params.get('field') as PieField) || 'status'
  const [scope, setScope] = useState<Scope>('all')
  const issues = useScopedIssues(project, scope)
  const projects = useStore((s) => s.projects)
  const users = useStore((s) => s.users)
  const all = useStore((s) => s.issues)
  const rows = useMemo(() => groupIssues(issues, field, { projects, users, all }), [issues, field, projects, users, all])
  const label = PIE_FIELDS.find((f) => f.value === field)!.label
  return (
    <ReportShell
      project={project}
      title="Pie chart report"
      description="See issues grouped by a single field, as a proportion of the whole."
      onExport={() => download(`${project.key}-by-${field}.csv`, toCSV([[label, 'Count'], ...rows.map((r) => [r.name, r.value])]), 'text/csv')}
      controls={
        <>
          <label className="flex items-center gap-2 text-[13px] text-muted">
            Statistic type
            <Select
              className="w-44"
              value={field}
              onChange={(v) => {
                const next = new URLSearchParams(params)
                next.set('field', v)
                setParams(next, { replace: true })
              }}
              options={PIE_FIELDS}
            />
          </label>
          <label className="flex items-center gap-2 text-[13px] text-muted">
            Issues
            <Select className="w-44" value={scope} onChange={setScope} options={scopeOptions(project)} />
          </label>
        </>
      }
    >
      <Panel title={`${project.name} · by ${label.toLowerCase()}`}>
        <Donut rows={rows} height={280} />
      </Panel>
    </ReportShell>
  )
}

// ───────────────────────────── epics ─────────────────────────────

export function EpicReport({ project }: { project: Project }) {
  const issues = useStore((s) => s.issues)
  const projects = useStore((s) => s.projects)
  const [params, setParams] = useSearchParams()
  const [mode, setMode] = useState<Estimation>(project.estimation)
  const epics = issues.filter((i) => i.projectId === project.id && i.type === 'epic')
  const selected = epics.find((e) => e.id === params.get('epic'))
  const children = (e: Issue) => issues.filter((i) => i.epicId === e.id && i.type !== 'subtask')
  const select = (id: string) => {
    const next = new URLSearchParams(params)
    next.set('epic', id)
    setParams(next, { replace: true })
  }
  return (
    <ReportShell
      project={project}
      title="Epic report"
      description="Progress towards completing each epic, by story points or issue count."
      controls={<ModeToggle value={mode} onChange={setMode} />}
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,380px)_1fr]">
        <Panel title="Epics">
          <ul className="-mx-2 space-y-1">
            {epics.map((e) => {
              const pr = progressOf(children(e), projects, mode)
              return (
                <li key={e.id}>
                  <button
                    onClick={() => select(e.id)}
                    className={cn('w-full rounded-lg px-2 py-2 text-left transition hover:bg-hover', selected?.id === e.id && 'bg-active')}
                  >
                    <div className="flex items-center gap-2">
                      <span className="size-2.5 shrink-0 rounded-sm" style={{ background: e.color ?? '#b48cff' }} />
                      <span className="flex-1 truncate text-[13px] font-medium">{e.summary}</span>
                      <span className="text-[11px] text-muted tabular-nums">{pr.total ? Math.round((pr.done / pr.total) * 100) : 0}%</span>
                    </div>
                    <StatusSplitBar className="mt-1.5" todo={pr.todo} inprogress={pr.inprogress} done={pr.done} />
                  </button>
                </li>
              )
            })}
            {!epics.length && <li className="px-2 py-4 text-[13px] text-muted">No epics in this project.</li>}
          </ul>
        </Panel>
        {selected ? (
          <EpicDetail epic={selected} issues={children(selected)} mode={mode} />
        ) : (
          <Panel>
            <div className="grid h-full min-h-48 place-items-center text-[13px] text-muted">Select an epic to see its issues.</div>
          </Panel>
        )}
      </div>
    </ReportShell>
  )
}

function EpicDetail({ epic, issues, mode }: { epic: Issue; issues: Issue[]; mode: Estimation }) {
  const projects = useStore((s) => s.projects)
  const pr = progressOf(issues, projects, mode)
  const unestimated = issues.filter((i) => i.storyPoints == null).length
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Total" value={pr.total} hint={mode === 'points' ? 'story points' : 'issues'} />
        <Stat label="Done" value={pr.done} tone="good" hint={`${pr.total ? Math.round((pr.done / pr.total) * 100) : 0}%`} />
        <Stat label="Remaining" value={pr.total - pr.done} />
        <Stat label="Unestimated" value={unestimated} hint="issues" tone={unestimated ? 'accent' : undefined} />
      </div>
      <Panel title={epic.summary} actions={epic.dueDate ? <span className="text-[13px] text-muted">Due {fmtDate(epic.dueDate)}</span> : undefined}>
        <StatusSplitBar todo={pr.todo} inprogress={pr.inprogress} done={pr.done} labels className="mb-4" />
        <IssueTable issues={issues} empty="No issues in this epic yet." />
      </Panel>
    </div>
  )
}

// ───────────────────────────── versions ─────────────────────────────

export function VersionReport({ project }: { project: Project }) {
  const issues = useStore((s) => s.issues)
  const projects = useStore((s) => s.projects)
  const [params, setParams] = useSearchParams()
  const versions = project.versions.filter((v) => !v.archived)
  const selected = versions.find((v) => v.id === params.get('version')) ?? versions.find((v) => !v.released) ?? versions[0]
  const of = (vid: string) => issues.filter((i) => i.fixVersionIds.includes(vid) && i.type !== 'subtask')
  if (!versions.length)
    return (
      <ReportShell project={project} title="Version report" description="Track projected release dates for a version.">
        <Panel>
          <div className="py-10 text-center text-[13px] text-muted">
            No versions yet.{' '}
            <Link className="text-accent hover:underline" to={`/projects/${project.key}/releases`}>
              Create a release
            </Link>
          </div>
        </Panel>
      </ReportShell>
    )
  return (
    <ReportShell
      project={project}
      title="Version report"
      description="Track progress towards each release and see what is still outstanding."
      controls={
        <Select
          className="w-64"
          value={selected?.id ?? null}
          onChange={(v) => {
            const next = new URLSearchParams(params)
            next.set('version', v)
            setParams(next, { replace: true })
          }}
          options={versions.map((v) => ({ value: v.id, label: v.name, hint: v.released ? 'Released' : fmtDate(v.releaseDate, 'd MMM') }))}
        />
      }
    >
      <div className="space-y-5">
        <div className="grid gap-3 md:grid-cols-3">
          {versions.map((v) => {
            const pr = progressOf(of(v.id), projects, 'count')
            return (
              <button
                key={v.id}
                onClick={() => {
                  const next = new URLSearchParams(params)
                  next.set('version', v.id)
                  setParams(next, { replace: true })
                }}
                className={cn('rounded-xl border bg-surface p-4 text-left transition hover:border-line-strong', selected?.id === v.id ? 'border-accent' : 'border-line')}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{v.name}</span>
                  <span
                    className={cn(
                      'rounded px-1.5 py-0.5 text-[10px] font-bold uppercase',
                      v.released ? 'bg-done text-done-fg' : v.releaseDate && Date.parse(v.releaseDate) < Date.now() ? 'bg-accent-soft text-accent' : 'bg-progress text-progress-fg',
                    )}
                  >
                    {v.released ? 'Released' : v.releaseDate && Date.parse(v.releaseDate) < Date.now() ? 'Overdue' : 'Unreleased'}
                  </span>
                </div>
                <div className="mt-1 text-xs text-muted">{v.releaseDate ? `Release ${fmtDate(v.releaseDate)}` : 'No release date'}</div>
                <StatusSplitBar className="mt-3" todo={pr.todo} inprogress={pr.inprogress} done={pr.done} labels />
              </button>
            )
          })}
        </div>
        {selected && (
          <Panel
            title={`${selected.name} — issues`}
            actions={
              <Link to={`/projects/${project.key}/releases/${selected.id}`} className="text-[13px] text-accent hover:underline">
                Open release page
              </Link>
            }
          >
            <IssueTable issues={of(selected.id)} empty="No issues have this fix version." />
          </Panel>
        )}
      </div>
    </ReportShell>
  )
}

// ───────────────────────────── time tracking ─────────────────────────────

export function TimeTrackingReport({ project }: { project: Project }) {
  const [scope, setScope] = useState<Scope>('sprint')
  const effective = project.type === 'scrum' ? scope : scope === 'sprint' ? 'all' : scope
  const issues = useScopedIssues(project, effective)
  const worklogs = useStore((s) => s.worklogs)
  const th = useChartTheme()
  const rows = useMemo(() => computeTimeTracking(issues, worklogs), [issues, worklogs])
  const tot = rows.reduce((a, r) => ({ est: a.est + r.est, spent: a.spent + r.spent, rem: a.rem + r.remaining }), { est: 0, spent: 0, rem: 0 })
  const max = Math.max(1, ...rows.map((r) => Math.max(r.est, r.spent + r.remaining)))
  return (
    <ReportShell
      project={project}
      title="Time tracking report"
      description="Original estimates compared with time logged and remaining. Shows whether work is running over or under estimate."
      onExport={() =>
        download(
          `${project.key}-time-tracking.csv`,
          toCSV([['Key', 'Summary', 'Original estimate (m)', 'Time spent (m)', 'Remaining (m)', 'Variance (m)'], ...rows.map((r) => [r.issue.key, r.issue.summary, r.est, r.spent, r.remaining, r.variance])]),
          'text/csv',
        )
      }
      controls={<Select className="w-48" value={effective} onChange={setScope} options={scopeOptions(project)} />}
    >
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-4">
          <Stat label="Original estimate" value={fmtDuration(tot.est) || '0m'} />
          <Stat label="Time spent" value={fmtDuration(tot.spent) || '0m'} />
          <Stat label="Remaining" value={fmtDuration(tot.rem) || '0m'} />
          <Stat
            label="Accuracy"
            value={tot.est ? `${Math.round(((tot.spent + tot.rem) / tot.est) * 100)}%` : '—'}
            hint="spent + remaining ÷ estimate"
            tone={tot.spent + tot.rem > tot.est ? 'accent' : 'good'}
          />
        </div>
        <Panel title="Issues">
          {rows.length ? (
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full text-[13px]">
                <thead className="bg-surface-2 text-left text-[11px] tracking-wide text-subtle uppercase">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Issue</th>
                    <th className="px-3 py-2 text-right font-semibold">Estimate</th>
                    <th className="px-3 py-2 text-right font-semibold">Spent</th>
                    <th className="px-3 py-2 text-right font-semibold">Remaining</th>
                    <th className="w-[30%] px-3 py-2 font-semibold">Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.issue.id} className="border-t border-line">
                      <td className="max-w-[360px] px-3 py-2">
                        <span className="flex min-w-0 items-center gap-2">
                          <IssueTypeIcon type={r.issue.type} />
                          <span className="shrink-0 text-[12px] text-muted">{r.issue.key}</span>
                          <span className="truncate">{r.issue.summary}</span>
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtDuration(r.est) || '–'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtDuration(r.spent) || '0m'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtDuration(r.remaining) || '0m'}</td>
                      <td className="px-3 py-2">
                        <div className="relative h-2 rounded-full bg-surface-3" title={`Estimate ${fmtDuration(r.est)}`}>
                          <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(Math.min(r.spent, max) / max) * 100}%`, background: r.spent > r.est && r.est ? th.series[7] : th.series[0] }} />
                          {r.est > 0 && <div className="absolute -top-0.5 h-3 w-0.5 rounded bg-fg" style={{ left: `calc(${(r.est / max) * 100}% - 1px)` }} />}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-8 text-center text-[13px] text-muted">No issues have estimates or logged time in this scope.</div>
          )}
          <p className="mt-2 text-[11px] text-subtle">Bar = time spent; tick = original estimate. Red bars ran over estimate.</p>
        </Panel>
      </div>
    </ReportShell>
  )
}

// ───────────────────────────── workload ─────────────────────────────

export function WorkloadReport({ project }: { project: Project }) {
  const [scope, setScope] = useState<Scope>(project.type === 'scrum' ? 'sprint' : 'open')
  const [mode, setMode] = useState<Estimation>(project.estimation)
  const issues = useScopedIssues(project, scope)
  const projects = useStore((s) => s.projects)
  const users = useStore((s) => s.users)
  const rows = useMemo(() => computeWorkload(issues, projects, users, mode), [issues, projects, users, mode])
  return (
    <ReportShell
      project={project}
      title="User workload report"
      description="How much work each person has, split by status category. Spot overloaded teammates before the sprint slips."
      onExport={() =>
        download(`${project.key}-workload.csv`, toCSV([['Assignee', 'Issues', 'To do', 'In progress', 'Done'], ...rows.map((r) => [r.name, r.issues, r.todo, r.inprogress, r.done])]), 'text/csv')
      }
      controls={
        <>
          <Select className="w-48" value={scope} onChange={setScope} options={scopeOptions(project)} />
          <ModeToggle value={mode} onChange={setMode} />
        </>
      }
    >
      <div className="grid gap-5 xl:grid-cols-[1fr_minmax(0,420px)]">
        <Panel>
          {rows.length ? <WorkloadChart rows={rows} mode={mode} /> : <div className="py-10 text-center text-[13px] text-muted">No issues in scope.</div>}
        </Panel>
        <Panel title="By person">
          <table className="w-full text-[13px]">
            <thead className="text-left text-[11px] tracking-wide text-subtle uppercase">
              <tr>
                <th className="pb-2 font-semibold">Assignee</th>
                <th className="pb-2 text-right font-semibold">Issues</th>
                <th className="pb-2 text-right font-semibold">Open</th>
                <th className="pb-2 text-right font-semibold">Done</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="py-2">
                    <span className="flex items-center gap-2">
                      <Avatar user={r.user} size="xs" showTooltip={false} />
                      {r.name}
                    </span>
                  </td>
                  <td className="py-2 text-right tabular-nums">{r.issues}</td>
                  <td className="py-2 text-right tabular-nums">{r.todo + r.inprogress}</td>
                  <td className="py-2 text-right text-muted tabular-nums">{r.done}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </ReportShell>
  )
}
