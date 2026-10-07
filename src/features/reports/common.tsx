import type { ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronRight, Download } from 'lucide-react'
import type { Issue, Project, Sprint } from '@/types'
import { useStore } from '@/store/store'
import { cn, fmtDate } from '@/lib/utils'
import { Avatar, IssueKey, IssueTypeIcon, PriorityIcon, StatusLozenge, useIssueModal } from '@/components/jira'
import { Select } from '@/components/ui/overlay'
import { Button } from '@/components/ui/primitives'
import type { Estimation } from './compute'

export function Segmented<T extends string>({ value, onChange, options, size = 'sm' }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; size?: 'xs' | 'sm' }) {
  return (
    <div role="radiogroup" className="inline-flex rounded-lg border border-line bg-surface-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-md font-medium transition',
            size === 'xs' ? 'h-6 px-2 text-[11px]' : 'h-7 px-2.5 text-[12px]',
            value === o.value ? 'bg-surface-3 text-fg shadow-sm ring-1 ring-line' : 'text-muted hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function ReportShell({
  project,
  title,
  description,
  controls,
  onExport,
  children,
}: {
  project: Project
  title: string
  description: ReactNode
  controls?: ReactNode
  onExport?: () => void
  children: ReactNode
}) {
  return (
    <div className="px-8 pt-6 pb-16">
      <div className="mb-2 flex items-center gap-1.5 text-[13px] text-muted">
        <Link to="/projects" className="hover:text-fg hover:underline">
          Projects
        </Link>
        <ChevronRight className="size-3.5" />
        <Link to={`/projects/${project.key}/board`} className="hover:text-fg hover:underline">
          {project.name}
        </Link>
        <ChevronRight className="size-3.5" />
        <Link to={`/projects/${project.key}/reports`} className="hover:text-fg hover:underline">
          Reports
        </Link>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="display text-[28px]">{title}</h1>
          <p className="mt-1 max-w-2xl text-[13px] text-muted">{description}</p>
        </div>
        {onExport && (
          <Button size="sm" icon={<Download className="size-4" />} onClick={onExport}>
            Export CSV
          </Button>
        )}
      </div>
      {controls && <div className="mt-5 flex flex-wrap items-center gap-3">{controls}</div>}
      <div className="mt-5">{children}</div>
    </div>
  )
}

export function Panel({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-2xl border border-line bg-surface p-5', className)}>
      {(title || actions) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-[15px] font-semibold tracking-[-0.02em]">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  )
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'accent' | 'good' }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <div className="text-[11px] font-semibold tracking-wide text-subtle uppercase">{label}</div>
      <div className={cn('display mt-1 text-[26px] tabular-nums', tone === 'accent' && 'text-accent', tone === 'good' && 'text-success')}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </div>
  )
}

/** Sprint picker synced to ?sprint= so report links are shareable. */
export function useSprintParam(project: Project, opts: { includeFuture?: boolean; closedOnly?: boolean } = {}) {
  const allSprints = useStore((s) => s.sprints)
  const [params, setParams] = useSearchParams()
  const sprints = allSprints
    .filter((s) => s.projectId === project.id && (opts.closedOnly ? s.state === 'closed' : opts.includeFuture || s.state !== 'future'))
    .sort((a, b) => b.order - a.order)
  const fallback = sprints.find((s) => s.state === 'active') ?? sprints[0]
  const sprint = sprints.find((s) => s.id === params.get('sprint')) ?? fallback
  const setSprint = (id: string) => {
    const next = new URLSearchParams(params)
    next.set('sprint', id)
    setParams(next, { replace: true })
  }
  return { sprints, sprint, setSprint }
}

export function SprintSelect({ sprints, sprint, onChange }: { sprints: Sprint[]; sprint?: Sprint; onChange: (id: string) => void }) {
  return (
    <Select
      className="w-64"
      value={sprint?.id ?? null}
      onChange={onChange}
      placeholder="Select sprint"
      options={sprints.map((s) => ({
        value: s.id,
        label: s.name,
        hint: s.state === 'active' ? 'Active' : s.state === 'closed' ? fmtDate(s.completedAt, 'd MMM') : 'Future',
      }))}
    />
  )
}

export function ModeToggle({ value, onChange }: { value: Estimation; onChange: (v: Estimation) => void }) {
  return (
    <Segmented
      value={value}
      onChange={onChange}
      options={[
        { value: 'points', label: 'Story points' },
        { value: 'count', label: 'Issue count' },
      ]}
    />
  )
}

export function IssueTable({
  issues,
  empty = 'No issues',
  marks,
  extra,
  showPoints = true,
}: {
  issues: Issue[]
  empty?: string
  marks?: Set<string>
  extra?: { header: string; cell: (i: Issue) => ReactNode; align?: 'right' }[]
  showPoints?: boolean
}) {
  const projects = useStore((s) => s.projects)
  const users = useStore((s) => s.users)
  const { open } = useIssueModal()
  if (!issues.length) return <div className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-[13px] text-muted">{empty}</div>
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full text-[13px]">
        <thead className="bg-surface-2 text-left text-[11px] tracking-wide text-subtle uppercase">
          <tr>
            <th className="px-3 py-2 font-semibold">Key</th>
            <th className="px-3 py-2 font-semibold">Summary</th>
            <th className="px-3 py-2 font-semibold">Type</th>
            <th className="px-3 py-2 font-semibold">Priority</th>
            <th className="px-3 py-2 font-semibold">Status</th>
            <th className="px-3 py-2 font-semibold">Assignee</th>
            {showPoints && <th className="px-3 py-2 text-right font-semibold">Points</th>}
            {extra?.map((e) => (
              <th key={e.header} className={cn('px-3 py-2 font-semibold', e.align === 'right' && 'text-right')}>
                {e.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {issues.map((i) => {
            const p = projects.find((x) => x.id === i.projectId)
            const st = p?.statuses.find((s) => s.id === i.statusId)
            return (
              <tr key={i.id} onClick={() => open(i.key)} className="cursor-pointer border-t border-line hover:bg-hover">
                <td className="px-3 py-2 whitespace-nowrap">
                  <IssueKey issue={i} strike={st?.category === 'done'} />
                  {marks?.has(i.id) && (
                    <span className="ml-0.5 text-accent" title="Added after sprint start">
                      *
                    </span>
                  )}
                </td>
                <td className="max-w-[420px] truncate px-3 py-2">{i.summary}</td>
                <td className="px-3 py-2">
                  <IssueTypeIcon type={i.type} />
                </td>
                <td className="px-3 py-2">
                  <PriorityIcon priority={i.priority} />
                </td>
                <td className="px-3 py-2">
                  <StatusLozenge status={st} />
                </td>
                <td className="px-3 py-2">
                  <span className="flex items-center gap-2 whitespace-nowrap">
                    <Avatar user={users.find((u) => u.id === i.assigneeId)} size="xs" showTooltip={false} />
                    <span className="text-muted">{users.find((u) => u.id === i.assigneeId)?.name ?? 'Unassigned'}</span>
                  </span>
                </td>
                {showPoints && <td className="px-3 py-2 text-right tabular-nums">{i.storyPoints ?? '–'}</td>}
                {extra?.map((e) => (
                  <td key={e.header} className={cn('px-3 py-2 tabular-nums', e.align === 'right' && 'text-right')}>
                    {e.cell(i)}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
