import { useMemo, useState } from 'react'
import type { Project } from '@/types'
import { useStore } from '@/store/store'
import { download, toCSV } from '@/lib/utils'
import { Checkbox } from '@/components/ui/primitives'
import { useIssueModal } from '@/components/jira'
import { CFDChart, ControlChart, CreatedResolvedChart } from './charts'
import { computeCFD, computeControl, computeCreatedResolved, fmtDay, indexHistory } from './compute'
import { IssueTable, Panel, ReportShell, Segmented, Stat } from './common'

const RANGE = [
  { value: '14', label: '2 weeks' },
  { value: '30', label: '1 month' },
  { value: '90', label: '3 months' },
] as const

export function CFDReport({ project }: { project: Project }) {
  const [days, setDays] = useState('30')
  const [hidden, setHidden] = useState<string[]>([])
  const issues = useStore((s) => s.issues)
  const history = useStore((s) => s.history)
  const exportCsv = () => {
    const rows = computeCFD(project, issues, indexHistory(history), Number(days))
    download(
      `${project.key}-cfd.csv`,
      toCSV([['Date', ...project.statuses.map((s) => s.name)], ...rows.map((r) => [r.label as string, ...project.statuses.map((s) => r[s.id] as number)])]),
      'text/csv',
    )
  }
  return (
    <ReportShell
      project={project}
      title="Cumulative flow diagram"
      description="Shows the statuses of issues over time. Widening bands reveal bottlenecks in your workflow."
      onExport={exportCsv}
      controls={
        <>
          <Segmented value={days} onChange={setDays} options={[...RANGE]} />
          <div className="flex flex-wrap items-center gap-3 text-[13px]">
            <span className="text-muted">Columns:</span>
            {project.statuses.map((s) => (
              <Checkbox
                key={s.id}
                label={s.name}
                checked={!hidden.includes(s.id)}
                onChange={(v) => setHidden((h) => (v ? h.filter((x) => x !== s.id) : [...h, s.id]))}
              />
            ))}
          </div>
        </>
      }
    >
      <Panel>
        <CFDChart project={project} days={Number(days)} height={400} hidden={hidden} />
      </Panel>
    </ReportShell>
  )
}

export function ControlReport({ project }: { project: Project }) {
  const [days, setDays] = useState('90')
  const issues = useStore((s) => s.issues)
  const history = useStore((s) => s.history)
  const { open } = useIssueModal()
  const d = useMemo(() => computeControl(project, issues, indexHistory(history), Number(days)), [project, issues, history, days])
  const exportCsv = () =>
    download(`${project.key}-control-chart.csv`, toCSV([['Key', 'Summary', 'Resolved', 'Cycle time (days)'], ...d.pts.map((p) => [p.issue.key, p.issue.summary, fmtDay(p.t), p.days.toFixed(2)])]), 'text/csv')
  const slowest = [...d.pts].sort((a, b) => b.days - a.days).slice(0, 5)
  return (
    <ReportShell
      project={project}
      title="Control chart"
      description="Cycle time for each issue: from the first time it moved into progress until it was resolved. Click a dot to open the issue."
      onExport={exportCsv}
      controls={<Segmented value={days} onChange={setDays} options={[...RANGE]} />}
    >
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Issues" value={d.pts.length} hint="resolved in period" />
          <Stat label="Average cycle time" value={`${d.average.toFixed(1)}d`} />
          <Stat label="Median cycle time" value={`${d.median.toFixed(1)}d`} />
        </div>
        <Panel>
          <ControlChart project={project} days={Number(days)} height={380} onPick={(i) => open(i.key)} />
        </Panel>
        <Panel title="Longest cycle times">
          <IssueTable issues={slowest.map((p) => p.issue)} extra={[{ header: 'Cycle time', align: 'right', cell: (i) => `${d.pts.find((p) => p.issue.id === i.id)!.days.toFixed(1)}d` }]} />
        </Panel>
      </div>
    </ReportShell>
  )
}

export function CreatedResolvedReport({ project }: { project: Project }) {
  const [days, setDays] = useState('30')
  const [cumulative, setCumulative] = useState(true)
  const all = useStore((s) => s.issues)
  const issues = useMemo(() => all.filter((i) => i.projectId === project.id), [all, project.id])
  const exportCsv = () => {
    const d = computeCreatedResolved(issues, Number(days), cumulative)
    download(`${project.key}-created-vs-resolved.csv`, toCSV([['Date', 'Created', 'Resolved'], ...d.rows.map((r) => [r.label, r.created, r.resolved])]), 'text/csv')
  }
  const d = useMemo(() => computeCreatedResolved(issues, Number(days), false), [issues, days])
  return (
    <ReportShell
      project={project}
      title="Created vs. resolved issues"
      description="Is the backlog growing or shrinking? Compare issues created against issues resolved over a period."
      onExport={exportCsv}
      controls={
        <>
          <Segmented value={days} onChange={setDays} options={[{ value: '7', label: '7 days' }, ...RANGE.slice(1)]} />
          <Segmented
            value={cumulative ? 'cum' : 'daily'}
            onChange={(v) => setCumulative(v === 'cum')}
            options={[
              { value: 'cum', label: 'Cumulative' },
              { value: 'daily', label: 'Per day' },
            ]}
          />
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Created" value={d.totalCreated} />
          <Stat label="Resolved" value={d.totalResolved} tone="good" />
          <Stat
            label="Net change"
            value={`${d.totalCreated - d.totalResolved > 0 ? '+' : ''}${d.totalCreated - d.totalResolved}`}
            hint={d.totalCreated > d.totalResolved ? 'backlog growing' : 'backlog shrinking'}
            tone={d.totalCreated > d.totalResolved ? 'accent' : 'good'}
          />
        </div>
        <Panel>
          <CreatedResolvedChart issues={issues} days={Number(days)} cumulative={cumulative} height={360} />
        </Panel>
      </div>
    </ReportShell>
  )
}
