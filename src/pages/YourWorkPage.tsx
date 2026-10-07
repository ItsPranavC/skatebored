import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { format, isToday, isYesterday, differenceInCalendarDays } from 'date-fns'
import { Filter, LayoutDashboard, Star } from 'lucide-react'
import { useMe, useStore } from '@/store/store'
import { IssueTypeIcon, StatusLozenge, useIssueModal } from '@/components/jira'
import { EmptyState, Tabs } from '@/components/ui/primitives'
import { ProjectAvatar } from '@/layout/TopNav'
import { cn, timeAgo } from '@/lib/utils'
import type { Issue } from '@/types'

type Tab = 'worked' | 'viewed' | 'assigned' | 'starred'

function greeting() {
  const h = new Date().getHours()
  return h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

function bucket(iso: string) {
  const d = new Date(iso)
  if (isToday(d)) return 'Today'
  if (isYesterday(d)) return 'Yesterday'
  if (differenceInCalendarDays(new Date(), d) < 7) return 'In the last week'
  if (differenceInCalendarDays(new Date(), d) < 31) return 'In the last month'
  return 'Earlier'
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      <h3 className="mb-1 px-3 text-[11px] font-semibold tracking-wide text-subtle uppercase">{title}</h3>
      <div>{children}</div>
    </section>
  )
}

function IssueRow({ issue, meta }: { issue: Issue; meta?: ReactNode }) {
  const project = useStore((s) => s.projects.find((p) => p.id === issue.projectId))
  const { open } = useIssueModal()
  return (
    <button onClick={() => open(issue.key)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-hover">
      <IssueTypeIcon type={issue.type} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px]">{issue.summary}</span>
        <span className="block truncate text-[12px] text-muted">
          {issue.key} · {project?.name}
        </span>
      </span>
      <StatusLozenge status={project?.statuses.find((s) => s.id === issue.statusId)} />
      {meta && <span className="w-36 shrink-0 text-right text-[12px] text-subtle">{meta}</span>}
    </button>
  )
}

export default function YourWorkPage() {
  const me = useMe()
  const projects = useStore((s) => s.projects)
  const issues = useStore((s) => s.issues)
  const history = useStore((s) => s.history)
  const comments = useStore((s) => s.comments)
  const recent = useStore((s) => s.recent)
  const filters = useStore((s) => s.filters)
  const dashboards = useStore((s) => s.dashboards)
  const [tab, setTab] = useState<Tab>('worked')

  const issueById = useMemo(() => new Map(issues.map((i) => [i.id, i])), [issues])
  const catOf = (i: Issue) => projects.find((p) => p.id === i.projectId)?.statuses.find((s) => s.id === i.statusId)?.category ?? 'todo'

  const workedOn = useMemo(() => {
    const last = new Map<string, { at: string; what: string }>()
    const touch = (id: string, at: string, what: string) => {
      const cur = last.get(id)
      if (!cur || cur.at < at) last.set(id, { at, what })
    }
    history.filter((h) => h.userId === me.id).forEach((h) => touch(h.issueId, h.createdAt, h.field === 'created' ? 'Created' : 'Updated'))
    comments.filter((c) => c.authorId === me.id).forEach((c) => touch(c.issueId, c.createdAt, 'Commented'))
    return [...last.entries()]
      .map(([id, v]) => ({ issue: issueById.get(id)!, ...v }))
      .filter((x) => x.issue)
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 60)
  }, [history, comments, me.id, issueById])

  const assigned = issues.filter((i) => i.assigneeId === me.id && i.type !== 'epic')
  const assignedOpen = assigned.filter((i) => catOf(i) !== 'done')

  const recentProjects = useMemo(() => {
    const ids = recent.filter((r) => r.kind === 'project').map((r) => r.id)
    const ordered = [...ids.map((id) => projects.find((p) => p.id === id)).filter(Boolean), ...projects.filter((p) => !ids.includes(p.id))] as typeof projects
    return ordered.filter((p) => p.memberIds.includes(me.id) || p.starred).slice(0, 4)
  }, [recent, projects, me.id])

  const grouped = <T,>(rows: T[], at: (r: T) => string) => {
    const out: [string, T[]][] = []
    for (const r of rows) {
      const b = bucket(at(r))
      const g = out.find((x) => x[0] === b)
      if (g) g[1].push(r)
      else out.push([b, [r]])
    }
    return out
  }

  const viewed = recent.filter((r) => r.kind === 'issue').map((r) => ({ issue: issueById.get(r.id), at: r.at })).filter((x) => x.issue) as { issue: Issue; at: string }[]

  return (
    <div className="mx-auto max-w-[1180px] px-8 pt-10 pb-16">
      <header className="mb-10">
        <p className="mb-3 text-[13px] font-medium tracking-wide text-subtle uppercase">{format(new Date(), 'EEEE, d MMMM')}</p>
        <h1 className="display text-[clamp(2.5rem,5.2vw,4.5rem)] leading-[1.02] tracking-[-0.055em]">
          {greeting()}, <span className="text-accent">{me.name.split(' ')[0]}.</span>
        </h1>
        <p className="mt-3 text-lg text-muted">
          {assignedOpen.length
            ? `You have ${assignedOpen.length} open issue${assignedOpen.length === 1 ? '' : 's'} — ${assignedOpen.filter((i) => catOf(i) === 'inprogress').length} in progress.`
            : 'Nothing assigned. Grab something from the backlog.'}
        </p>
      </header>

      <section className="mb-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold tracking-[-0.01em]">Recent projects</h2>
          <Link to="/projects" className="text-[13px] text-accent hover:underline">
            View all projects
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {recentProjects.map((p) => {
            const pIssues = issues.filter((i) => i.projectId === p.id)
            const mineOpen = pIssues.filter((i) => i.assigneeId === me.id && catOf(i) !== 'done').length
            const done = pIssues.filter((i) => catOf(i) === 'done').length
            return (
              <div key={p.id} className="group relative overflow-hidden rounded-2xl border border-line bg-surface p-4 transition hover:-translate-y-0.5 hover:border-line-strong">
                <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: p.color }} />
                <Link to={`/projects/${p.key}/board`} className="flex items-center gap-3">
                  <ProjectAvatar project={p} size={36} />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold tracking-[-0.01em] group-hover:text-accent">{p.name}</span>
                    <span className="block text-xs text-muted">{p.type === 'scrum' ? 'Team-managed · Scrum' : 'Team-managed · Kanban'}</span>
                  </span>
                </Link>
                <div className="mt-4 text-[11px] font-semibold tracking-wide text-subtle uppercase">Quick links</div>
                <div className="mt-1.5 space-y-1 text-[13px]">
                  <Link to={`/projects/${p.key}/issues?jql=${encodeURIComponent(`project = ${p.key} AND assignee = currentUser() AND statusCategory != Done ORDER BY priority DESC`)}`} className="flex items-center justify-between rounded px-1 py-0.5 hover:bg-hover">
                    My open issues <span className="rounded-full bg-surface-3 px-1.5 text-[11px] font-semibold">{mineOpen}</span>
                  </Link>
                  <Link to={`/projects/${p.key}/issues?jql=${encodeURIComponent(`project = ${p.key} AND statusCategory = Done ORDER BY resolved DESC`)}`} className="flex items-center justify-between rounded px-1 py-0.5 hover:bg-hover">
                    Done issues <span className="rounded-full bg-surface-3 px-1.5 text-[11px] font-semibold">{done}</span>
                  </Link>
                </div>
                <Link to={`/projects/${p.key}/board`} className="mt-3 block border-t border-line pt-2.5 text-[13px] text-muted hover:text-accent">
                  {p.type === 'scrum' ? 'Active sprint board' : 'Kanban board'} →
                </Link>
              </div>
            )
          })}
        </div>
      </section>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'worked', label: 'Worked on' },
          { id: 'viewed', label: 'Viewed' },
          {
            id: 'assigned',
            label: (
              <span className="inline-flex items-center gap-1.5">
                Assigned to me <span className="rounded-full bg-surface-3 px-1.5 text-[11px]">{assignedOpen.length}</span>
              </span>
            ),
          },
          { id: 'starred', label: 'Starred' },
        ]}
      />

      <div className="mt-5">
        {tab === 'worked' &&
          (workedOn.length ? (
            grouped(workedOn, (r) => r.at).map(([g, rows]) => (
              <Group key={g} title={g}>
                {rows.map((r) => (
                  <IssueRow key={r.issue.id} issue={r.issue} meta={`${r.what} ${timeAgo(r.at)}`} />
                ))}
              </Group>
            ))
          ) : (
            <EmptyState icon="🛹" title="Nothing worked on yet">
              Issues you create, update or comment on show up here.
            </EmptyState>
          ))}

        {tab === 'viewed' &&
          (viewed.length ? (
            grouped(viewed, (r) => r.at).map(([g, rows]) => (
              <Group key={g} title={g}>
                {rows.map((r) => (
                  <IssueRow key={r.issue.id} issue={r.issue} meta={`Viewed ${timeAgo(r.at)}`} />
                ))}
              </Group>
            ))
          ) : (
            <EmptyState icon="👀" title="No recently viewed issues">
              Open any issue and it will be listed here for quick access.
            </EmptyState>
          ))}

        {tab === 'assigned' &&
          (assigned.length ? (
            (['inprogress', 'todo', 'done'] as const).map((cat) => {
              const rows = assigned.filter((i) => catOf(i) === cat).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
              if (!rows.length) return null
              return (
                <Group key={cat} title={{ inprogress: 'In progress', todo: 'To do', done: 'Done' }[cat]}>
                  {rows.slice(0, cat === 'done' ? 8 : 100).map((i) => (
                    <IssueRow key={i.id} issue={i} meta={`Updated ${timeAgo(i.updatedAt)}`} />
                  ))}
                </Group>
              )
            })
          ) : (
            <EmptyState icon="🎉" title="Nothing assigned to you">
              Enjoy the quiet — or pick up something from the backlog.
            </EmptyState>
          ))}

        {tab === 'starred' && (
          <div>
            <Group title="Projects">
              {projects.filter((p) => p.starred).length === 0 && <p className="px-3 text-[13px] text-muted">No starred projects.</p>}
              {projects
                .filter((p) => p.starred)
                .map((p) => (
                  <Link key={p.id} to={`/projects/${p.key}/board`} className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-hover">
                    <ProjectAvatar project={p} />
                    <span className="flex-1">{p.name}</span>
                    <Star className="size-4 fill-warn text-warn" />
                  </Link>
                ))}
            </Group>
            <Group title="Filters">
              {filters
                .filter((f) => f.starred)
                .map((f) => (
                  <Link key={f.id} to={`/issues?filter=${f.id}`} className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-hover">
                    <Filter className="size-4 text-muted" />
                    <span className="flex-1">{f.name}</span>
                    <Star className="size-4 fill-warn text-warn" />
                  </Link>
                ))}
            </Group>
            <Group title="Dashboards">
              {dashboards
                .filter((d) => d.starred)
                .map((d) => (
                  <Link key={d.id} to={`/dashboards/${d.id}`} className={cn('flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-hover')}>
                    <LayoutDashboard className="size-4 text-muted" />
                    <span className="flex-1">{d.name}</span>
                    <Star className="size-4 fill-warn text-warn" />
                  </Link>
                ))}
            </Group>
          </div>
        )}
      </div>
    </div>
  )
}
