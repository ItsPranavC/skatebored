import { useMemo, useState } from 'react'
import { differenceInCalendarDays } from 'date-fns'
import type { Project } from '@/types'
import { useStore } from '@/store/store'
import { download, fmtDate, toCSV, cn } from '@/lib/utils'
import { EmptyState } from '@/components/ui/primitives'
import { IssueKey } from '@/components/jira'
import { BurndownChart, BurnupChart, VelocityChart } from './charts'
import { computeBurndown, computeSprintReport, computeVelocity, fmtDayTime, indexHistory, type Estimation } from './compute'
import { IssueTable, ModeToggle, Panel, ReportShell, SprintSelect, Stat, useSprintParam } from './common'

function NoSprints({ project, title }: { project: Project; title: string }) {
  return (
    <ReportShell project={project} title={title} description="">
      <EmptyState icon="🛹" title="No sprints to report on yet">
        Start a sprint from the backlog and this report will fill in as work moves across the board.
      </EmptyState>
    </ReportShell>
  )
}

const EVENT_LABEL = {
  start: 'Sprint start',
  added: 'Scope change — issue added to sprint',
  removed: 'Scope change — issue removed from sprint',
  completed: 'Issue completed',
  reopened: 'Issue reopened',
  end: 'Sprint end',
} as const

export function BurndownReport({ project }: { project: Project }) {
  const { sprints, sprint, setSprint } = useSprintParam(project)
  const [mode, setMode] = useState<Estimation>(project.estimation)
  const issues = useStore((s) => s.issues)
  const history = useStore((s) => s.history)
  const data = useMemo(() => (sprint ? computeBurndown(sprint, project, issues, indexHistory(history), mode) : null), [sprint, project, issues, history, mode])
  if (!sprint) return <NoSprints project={project} title="Burndown chart" />
  const unitLabel = mode === 'points' ? 'Story points' : 'Issue count'
  const exportCsv = () =>
    data &&
    download(
      `${sprint.name}-burndown.csv`,
      toCSV([
        ['Date', 'Issue', 'Event', 'Change', 'Remaining'],
        ...data.events.map((e) => [fmtDayTime(e.t), e.issue?.key ?? '', EVENT_LABEL[e.kind], e.change, e.remaining]),
      ]),
      'text/csv',
    )
  const daysLeft = sprint.endDate ? differenceInCalendarDays(new Date(sprint.endDate), new Date()) : null
  const last = data?.events.at(-1)
  return (
    <ReportShell
      project={project}
      title="Burndown chart"
      description="Track the total work remaining in the sprint and project the likelihood of achieving the sprint goal."
      onExport={exportCsv}
      controls={
        <>
          <SprintSelect sprints={sprints} sprint={sprint} onChange={setSprint} />
          <ModeToggle value={mode} onChange={setMode} />
        </>
      }
    >
      {data && (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Committed at start" value={data.startScope} hint={unitLabel.toLowerCase()} />
            <Stat label="Remaining" value={last?.remaining ?? 0} hint={unitLabel.toLowerCase()} tone="accent" />
            <Stat label="Completed" value={last?.done ?? 0} hint={unitLabel.toLowerCase()} tone="good" />
            <Stat
              label={sprint.state === 'closed' ? 'Completed on' : 'Time left'}
              value={sprint.state === 'closed' ? fmtDate(sprint.completedAt, 'd MMM') : daysLeft != null ? `${Math.max(0, daysLeft)}d` : '—'}
              hint={`${fmtDate(sprint.startDate, 'd MMM')} – ${fmtDate(sprint.endDate, 'd MMM yyyy')}`}
            />
          </div>
          <Panel title={sprint.name} actions={sprint.goal ? <span className="max-w-md truncate text-[13px] text-muted">Goal: {sprint.goal}</span> : undefined}>
            <BurndownChart sprint={sprint} project={project} mode={mode} height={340} />
            <p className="mt-2 text-[11px] text-subtle">Shaded bands are non-working days.</p>
          </Panel>
          <Panel title="Events">
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full text-[13px]">
                <thead className="bg-surface-2 text-left text-[11px] tracking-wide text-subtle uppercase">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Date</th>
                    <th className="px-3 py-2 font-semibold">Issue</th>
                    <th className="px-3 py-2 font-semibold">Event type</th>
                    <th className="px-3 py-2 text-right font-semibold">Inc.</th>
                    <th className="px-3 py-2 text-right font-semibold">Dec.</th>
                    <th className="px-3 py-2 text-right font-semibold">Remaining</th>
                  </tr>
                </thead>
                <tbody>
                  {data.events.map((e, k) => (
                    <tr key={k} className={cn('border-t border-line', (e.kind === 'start' || e.kind === 'end') && 'bg-surface-2/60 font-semibold')}>
                      <td className="px-3 py-2 whitespace-nowrap text-muted">{fmtDayTime(e.t)}</td>
                      <td className="px-3 py-2">
                        {e.issue ? (
                          <span className="flex min-w-0 items-center gap-2">
                            <IssueKey issue={e.issue} />
                            <span className="truncate">{e.issue.summary}</span>
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted">{EVENT_LABEL[e.kind]}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{e.change > 0 ? e.change : ''}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{e.change < 0 ? -e.change : ''}</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">{e.remaining}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      )}
    </ReportShell>
  )
}

export function BurnupReport({ project }: { project: Project }) {
  const { sprints, sprint, setSprint } = useSprintParam(project)
  const [mode, setMode] = useState<Estimation>(project.estimation)
  if (!sprint) return <NoSprints project={project} title="Burnup chart" />
  return (
    <ReportShell
      project={project}
      title="Burnup chart"
      description="Compare work completed against total scope. A rising scope line means work was added after the sprint started."
      controls={
        <>
          <SprintSelect sprints={sprints} sprint={sprint} onChange={setSprint} />
          <ModeToggle value={mode} onChange={setMode} />
        </>
      }
    >
      <Panel title={sprint.name}>
        <BurnupChart sprint={sprint} project={project} mode={mode} height={360} />
      </Panel>
    </ReportShell>
  )
}

export function SprintReportView({ project }: { project: Project }) {
  const { sprints, sprint, setSprint } = useSprintParam(project)
  const issues = useStore((s) => s.issues)
  const history = useStore((s) => s.history)
  const rep = useMemo(() => (sprint ? computeSprintReport(sprint, project, issues, indexHistory(history)) : null), [sprint, project, issues, history])
  if (!sprint) return <NoSprints project={project} title="Sprint report" />
  const pts = (list: { storyPoints: number | null }[]) => list.reduce((n, i) => n + (i.storyPoints ?? 0), 0)
  const exportCsv = () =>
    rep &&
    download(
      `${sprint.name}-report.csv`,
      toCSV([
        ['Group', 'Key', 'Summary', 'Points', 'Added after start'],
        ...(
          [
            ['Completed', rep.completed],
            ['Not completed', rep.notCompleted],
            ['Removed', rep.removed],
          ] as const
        ).flatMap(([g, list]) => list.map((i) => [g, i.key, i.summary, i.storyPoints, rep.addedAfterStart.has(i.id) ? 'yes' : ''])),
      ]),
      'text/csv',
    )
  return (
    <ReportShell
      project={project}
      title="Sprint report"
      description="Understand the work completed or pushed back to the backlog in each sprint."
      onExport={exportCsv}
      controls={<SprintSelect sprints={sprints} sprint={sprint} onChange={setSprint} />}
    >
      {rep && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-[13px] text-muted">
            <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-bold uppercase', sprint.state === 'active' ? 'bg-progress text-progress-fg' : 'bg-done text-done-fg')}>
              {sprint.state === 'active' ? 'Active' : 'Closed'}
            </span>
            <span>
              {fmtDate(sprint.startDate, 'd MMM yyyy, HH:mm')} – {fmtDate(sprint.completedAt ?? sprint.endDate, 'd MMM yyyy, HH:mm')}
            </span>
            {sprint.goal && <span>Goal: {sprint.goal}</span>}
          </div>
          <Panel>
            <BurndownChart sprint={sprint} project={project} mode={project.estimation} height={220} compact />
          </Panel>
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Completed" value={rep.completed.length} hint={`${pts(rep.completed)} pts`} tone="good" />
            <Stat label="Not completed" value={rep.notCompleted.length} hint={`${pts(rep.notCompleted)} pts`} />
            <Stat label="Removed" value={rep.removed.length} hint={`${pts(rep.removed)} pts`} />
            <Stat label="Added after start" value={rep.addedAfterStart.size} hint="marked with *" tone={rep.addedAfterStart.size ? 'accent' : undefined} />
          </div>
          <Panel title="Completed issues">
            <IssueTable issues={rep.completed} marks={rep.addedAfterStart} empty="No issues were completed in this sprint." />
          </Panel>
          <Panel title={sprint.state === 'closed' ? 'Issues not completed' : 'Issues not yet completed'}>
            <IssueTable issues={rep.notCompleted} marks={rep.addedAfterStart} empty="Everything committed was completed." />
          </Panel>
          <Panel title="Issues removed from sprint">
            <IssueTable issues={rep.removed} empty="No issues were removed." />
          </Panel>
          <p className="text-[12px] text-subtle">* Issue added to sprint after start time.</p>
        </div>
      )}
    </ReportShell>
  )
}

export function VelocityReport({ project }: { project: Project }) {
  const sprints = useStore((s) => s.sprints)
  const issues = useStore((s) => s.issues)
  const [mode, setMode] = useState<Estimation>(project.estimation)
  const data = useMemo(() => computeVelocity(sprints.filter((s) => s.projectId === project.id), issues, mode), [sprints, issues, project.id, mode])
  if (!data.rows.length) return <NoSprints project={project} title="Velocity chart" />
  const exportCsv = () =>
    download(`${project.key}-velocity.csv`, toCSV([['Sprint', 'Commitment', 'Completed'], ...data.rows.map((r) => [r.name, r.committed, r.completed])]), 'text/csv')
  const lastThree = data.rows.slice(-3)
  const avg3 = lastThree.reduce((n, r) => n + r.completed, 0) / lastThree.length
  return (
    <ReportShell
      project={project}
      title="Velocity chart"
      description="Track the amount of work completed from sprint to sprint. Use it to forecast how much the team can commit to next."
      onExport={exportCsv}
      controls={<ModeToggle value={mode} onChange={setMode} />}
    >
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Average velocity" value={data.avg.toFixed(1)} hint={`last ${data.rows.length} sprints`} />
          <Stat label="Last 3 sprints" value={avg3.toFixed(1)} hint="rolling average" />
          <Stat
            label="Say / do ratio"
            value={`${Math.round((data.rows.reduce((n, r) => n + r.completed, 0) / Math.max(1, data.rows.reduce((n, r) => n + r.committed, 0))) * 100)}%`}
            hint="completed ÷ committed"
          />
        </div>
        <Panel>
          <VelocityChart rows={data.rows} mode={mode} height={340} />
        </Panel>
        <Panel title="Sprints">
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-[13px]">
              <thead className="bg-surface-2 text-left text-[11px] tracking-wide text-subtle uppercase">
                <tr>
                  <th className="px-3 py-2 font-semibold">Sprint</th>
                  <th className="px-3 py-2 text-right font-semibold">Commitment</th>
                  <th className="px-3 py-2 text-right font-semibold">Completed</th>
                  <th className="px-3 py-2 text-right font-semibold">%</th>
                </tr>
              </thead>
              <tbody>
                {[...data.rows].reverse().map((r) => (
                  <tr key={r.id} className="border-t border-line">
                    <td className="px-3 py-2 font-medium">{r.name}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.committed}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.completed}</td>
                    <td className="px-3 py-2 text-right text-muted tabular-nums">{r.committed ? Math.round((r.completed / r.committed) * 100) : 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </ReportShell>
  )
}
