import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import type { Project } from '@/types'
import { useProjectByKey } from '@/store/store'
import { BurndownReport, BurnupReport, SprintReportView, VelocityReport } from '@/features/reports/SprintReports'
import { CFDReport, ControlReport, CreatedResolvedReport } from '@/features/reports/FlowReports'
import { EpicReport, PieReport, TimeTrackingReport, VersionReport, WorkloadReport } from '@/features/reports/IssueReports'
import NotFoundPage from '@/pages/NotFoundPage'

// Tiny illustrative thumbnails. Classes (not attributes) carry colour so they follow the theme.
const T = {
  burndown: (
    <>
      <path d="M8 10 L92 50" className="stroke-subtle" strokeDasharray="4 3" strokeWidth="1.5" fill="none" />
      <path d="M8 10 H26 V18 H44 V16 H58 V30 H74 V38 H92" className="stroke-info" strokeWidth="2.5" fill="none" />
    </>
  ),
  burnup: (
    <>
      <path d="M8 18 H40 V12 H92" className="stroke-warn" strokeWidth="2.5" fill="none" />
      <path d="M8 52 H22 V44 H40 V36 H58 V28 H76 V20 H92" className="stroke-success" strokeWidth="2.5" fill="none" />
    </>
  ),
  sprint: (
    <>
      <rect x="8" y="10" width="84" height="8" rx="3" className="fill-done" />
      <rect x="8" y="24" width="60" height="8" rx="3" className="fill-progress" />
      <rect x="8" y="38" width="36" height="8" rx="3" className="fill-todo" />
    </>
  ),
  velocity: (
    <>
      {[0, 1, 2, 3].map((k) => (
        <g key={k}>
          <rect x={10 + k * 21} y={52 - [26, 34, 30, 38][k]!} width="8" height={[26, 34, 30, 38][k]} rx="2" className="fill-subtle" />
          <rect x={19 + k * 21} y={52 - [22, 30, 30, 34][k]!} width="8" height={[22, 30, 30, 34][k]} rx="2" className="fill-info" />
        </g>
      ))}
    </>
  ),
  cfd: (
    <>
      <path d="M8 52 L8 40 C30 36 60 30 92 18 L92 52 Z" className="fill-success" opacity=".8" />
      <path d="M8 40 C30 36 60 30 92 18 L92 12 C60 22 30 28 8 32 Z" className="fill-info" opacity=".8" />
      <path d="M8 32 C30 28 60 22 92 12 L92 6 C60 14 30 20 8 24 Z" className="fill-warn" opacity=".8" />
    </>
  ),
  control: (
    <>
      {[
        [14, 38], [22, 30], [30, 42], [38, 22], [46, 34], [54, 28], [62, 40], [70, 18], [78, 30], [86, 26],
      ].map(([x, y]) => (
        <circle key={x} cx={x} cy={y} r="2.6" className="fill-info" />
      ))}
      <path d="M10 36 C30 32 50 30 90 27" className="stroke-warn" strokeWidth="2" fill="none" />
    </>
  ),
  created: (
    <>
      <path d="M8 46 C26 40 40 30 56 24 S80 14 92 10" className="stroke-accent" strokeWidth="2.5" fill="none" />
      <path d="M8 50 C26 46 40 38 56 32 S80 22 92 18" className="stroke-success" strokeWidth="2.5" fill="none" />
    </>
  ),
  pie: (
    <>
      <circle cx="50" cy="30" r="18" className="stroke-info" strokeWidth="9" fill="none" strokeDasharray="50 200" />
      <circle cx="50" cy="30" r="18" className="stroke-warn" strokeWidth="9" fill="none" strokeDasharray="0 52 34 200" />
      <circle cx="50" cy="30" r="18" className="stroke-success" strokeWidth="9" fill="none" strokeDasharray="0 88 25 200" />
    </>
  ),
  epic: (
    <>
      {[0, 1, 2].map((k) => (
        <g key={k}>
          <rect x="8" y={12 + k * 14} width="84" height="6" rx="3" className="fill-surface-3" />
          <rect x="8" y={12 + k * 14} width={[70, 44, 22][k]} height="6" rx="3" className="fill-success" />
        </g>
      ))}
    </>
  ),
  version: (
    <>
      <path d="M8 46 L92 46" className="stroke-line-strong" strokeWidth="2" />
      {[20, 50, 80].map((x, k) => (
        <g key={x}>
          <circle cx={x} cy="46" r="5" className={k === 0 ? 'fill-success' : k === 1 ? 'fill-info' : 'fill-subtle'} />
          <rect x={x - 10} y={14 + k * 4} width="20" height={22 - k * 4} rx="3" className={k === 0 ? 'fill-done' : k === 1 ? 'fill-progress' : 'fill-todo'} />
        </g>
      ))}
    </>
  ),
  time: (
    <>
      {[0, 1, 2].map((k) => (
        <g key={k}>
          <rect x="8" y={12 + k * 14} width={[60, 80, 40][k]} height="6" rx="3" className={k === 1 ? 'fill-accent' : 'fill-info'} />
          <rect x={[70, 62, 56][k]} y={10 + k * 14} width="2" height="10" className="fill-fg" />
        </g>
      ))}
    </>
  ),
  workload: (
    <>
      {[0, 1, 2].map((k) => (
        <g key={k}>
          <rect x="8" y={12 + k * 14} width={[30, 20, 40][k]} height="7" className="fill-success" />
          <rect x={8 + [30, 20, 40][k]!} y={12 + k * 14} width={[20, 30, 14][k]} height="7" className="fill-info" />
          <rect x={8 + [50, 50, 54][k]!} y={12 + k * 14} width={[24, 10, 30][k]} height="7" className="fill-subtle" />
        </g>
      ))}
    </>
  ),
}

interface ReportDef {
  id: string
  title: string
  description: string
  thumb: ReactNode
  scrumOnly?: boolean
  render: (p: Project) => ReactNode
}

const AGILE: ReportDef[] = [
  { id: 'burndown', title: 'Burndown chart', description: 'Track the total work remaining and project the likelihood of achieving the sprint goal.', thumb: T.burndown, scrumOnly: true, render: (p) => <BurndownReport project={p} /> },
  { id: 'burnup', title: 'Burnup chart', description: 'Compare completed work with total scope to spot scope creep.', thumb: T.burnup, scrumOnly: true, render: (p) => <BurnupReport project={p} /> },
  { id: 'sprint-report', title: 'Sprint report', description: 'Understand the work completed or pushed back to the backlog in each sprint.', thumb: T.sprint, scrumOnly: true, render: (p) => <SprintReportView project={p} /> },
  { id: 'velocity', title: 'Velocity chart', description: 'Track the amount of work completed from sprint to sprint to forecast future sprints.', thumb: T.velocity, scrumOnly: true, render: (p) => <VelocityReport project={p} /> },
  { id: 'cfd', title: 'Cumulative flow diagram', description: 'Shows the statuses of issues over time to identify bottlenecks.', thumb: T.cfd, render: (p) => <CFDReport project={p} /> },
  { id: 'control-chart', title: 'Control chart', description: 'Shows the cycle time for issues so you can identify whether data from the current process predicts future performance.', thumb: T.control, render: (p) => <ControlReport project={p} /> },
]

const ANALYSIS: ReportDef[] = [
  { id: 'created-vs-resolved', title: 'Created vs. resolved issues', description: 'Is the backlog growing or shrinking? Compare issues created with issues resolved.', thumb: T.created, render: (p) => <CreatedResolvedReport project={p} /> },
  { id: 'pie', title: 'Pie chart report', description: 'Issues grouped by status, assignee, priority, type, epic, label or component.', thumb: T.pie, render: (p) => <PieReport project={p} /> },
  { id: 'epic', title: 'Epic report', description: 'Progress towards completing each epic over time.', thumb: T.epic, render: (p) => <EpicReport project={p} /> },
  { id: 'version', title: 'Version report', description: 'Track progress and outstanding work for each release.', thumb: T.version, render: (p) => <VersionReport project={p} /> },
  { id: 'time-tracking', title: 'Time tracking report', description: 'Original estimates compared with time logged and remaining.', thumb: T.time, render: (p) => <TimeTrackingReport project={p} /> },
  { id: 'workload', title: 'User workload report', description: 'How much work each teammate has, split by status category.', thumb: T.workload, render: (p) => <WorkloadReport project={p} /> },
]

function Card({ project, r }: { project: Project; r: ReportDef }) {
  return (
    <Link
      to={`/projects/${project.key}/reports/${r.id}`}
      className="group flex gap-4 rounded-2xl border border-line bg-surface p-4 transition hover:-translate-y-0.5 hover:border-line-strong hover:bg-surface-2"
    >
      <svg viewBox="0 0 100 60" className="h-[60px] w-[100px] shrink-0 rounded-lg bg-surface-2 group-hover:bg-surface-3" aria-hidden>
        {r.thumb}
      </svg>
      <div className="min-w-0">
        <div className="flex items-center gap-1 font-semibold tracking-[-0.01em] group-hover:text-accent">
          {r.title}
          <ChevronRight className="size-4 opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
        </div>
        <p className="mt-1 line-clamp-2 text-[13px] text-muted">{r.description}</p>
      </div>
    </Link>
  )
}

export default function ReportsPage() {
  const { projectKey, report } = useParams()
  const project = useProjectByKey(projectKey)
  if (!project) return null
  const agile = AGILE.filter((r) => !r.scrumOnly || project.type === 'scrum')
  if (report) {
    const def = [...AGILE, ...ANALYSIS].find((r) => r.id === report)
    if (!def || (def.scrumOnly && project.type !== 'scrum')) return <NotFoundPage />
    return <div key={def.id}>{def.render(project)}</div>
  }
  return (
    <div className="px-8 pt-6 pb-16">
      <div className="mb-2 flex items-center gap-1.5 text-[13px] text-muted">
        <Link to="/projects" className="hover:text-fg hover:underline">
          Projects
        </Link>
        <ChevronRight className="size-3.5" />
        <span>{project.name}</span>
      </div>
      <h1 className="display text-[28px]">Reports</h1>
      <p className="mt-1 max-w-2xl text-[13px] text-muted">Every report is reconstructed from the issue history, so it reflects what actually happened — scope changes, reopenings and all.</p>

      <h2 className="mt-8 mb-3 text-[11px] font-semibold tracking-wide text-subtle uppercase">Agile</h2>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {agile.map((r) => (
          <Card key={r.id} project={project} r={r} />
        ))}
      </div>
      <h2 className="mt-8 mb-3 text-[11px] font-semibold tracking-wide text-subtle uppercase">Issue analysis</h2>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {ANALYSIS.map((r) => (
          <Card key={r.id} project={project} r={r} />
        ))}
      </div>
    </div>
  )
}
