import { Link, NavLink, useLocation, useParams } from 'react-router-dom'
import { BarChart3, Briefcase, CalendarRange, ChevronLeft, ChevronRight, Code2, Columns3, FlaskConical, Layers, ListTodo, Package, Settings, Rows3, Wrench } from 'lucide-react'
import type { ReactNode } from 'react'
import { useProjectByKey, useStore } from '@/store/store'
import { cn } from '@/lib/utils'
import { ProjectAvatar } from './TopNav'
import { useProjectFeatures } from '@/features/settings/features'
import { WORK_COLOR, type WorkView } from '@/lib/work'

function Item({ to, icon, children, end }: { to: string; icon: ReactNode; children: ReactNode; end?: boolean }) {
  const collapsed = useStore((s) => s.sidebarCollapsed)
  return (
    <NavLink
      to={to}
      end={end}
      title={collapsed ? String(children) : undefined}
      className={({ isActive }) =>
        cn(
          'relative flex h-9 items-center gap-3 rounded-lg px-3 text-[14px] transition',
          isActive ? 'bg-accent-soft font-semibold text-accent before:absolute before:top-2 before:bottom-2 before:left-0 before:w-[3px] before:rounded-full before:bg-accent' : 'text-fg hover:bg-hover',
          collapsed && 'justify-center px-0',
        )
      }
    >
      <span className="grid size-5 place-items-center">{icon}</span>
      {!collapsed && <span className="truncate">{children}</span>}
    </NavLink>
  )
}

/** Opens the board / backlog in one work view (?work=…); active when that view is showing. */
function WorkLink({ base, view, icon, color, indent, children }: { base: string; view: WorkView; icon: ReactNode; color: string; indent?: boolean; children: string }) {
  const collapsed = useStore((s) => s.sidebarCollapsed)
  const { pathname, search } = useLocation()
  const page = /\/backlog$/.test(pathname) ? 'backlog' : 'board'
  const active = /\/(board|backlog)$/.test(pathname) && new URLSearchParams(search).get('work') === view
  return (
    <Link
      to={`${base}/${page}?work=${view}`}
      title={collapsed ? children : undefined}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative flex h-8 items-center gap-3 rounded-lg px-3 text-[13.5px] transition',
        active ? 'bg-hover font-semibold text-fg' : 'text-muted hover:bg-hover hover:text-fg',
        indent && !collapsed && 'pl-9',
        collapsed && 'justify-center px-0',
      )}
    >
      <span className="grid size-5 place-items-center" style={{ color }}>
        {icon}
      </span>
      {!collapsed && <span className="truncate">{children}</span>}
    </Link>
  )
}

export function ProjectSidebar() {
  const { projectKey } = useParams()
  const project = useProjectByKey(projectKey)
  const collapsed = useStore((s) => s.sidebarCollapsed)
  const toggle = useStore((s) => s.toggleSidebar)
  const [features] = useProjectFeatures(project?.id ?? '')
  if (!project) return null
  const base = `/projects/${project.key}`
  return (
    <aside className={cn('group/side relative flex shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-200', collapsed ? 'w-16' : 'w-[240px]')}>
      <div className={cn('flex items-center gap-3 px-4 pt-5 pb-4', collapsed && 'justify-center px-0')}>
        <ProjectAvatar project={project} size={collapsed ? 32 : 36} />
        {!collapsed && (
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold tracking-[-0.02em]">{project.name}</div>
            <div className="truncate text-xs text-muted">Software project · Scrum</div>
          </div>
        )}
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2">
        {!collapsed && <div className="px-3 pt-2 pb-1.5 text-[11px] font-semibold tracking-wide text-subtle uppercase">Planning</div>}
        {features.timeline && (
          <Item to={`${base}/timeline`} icon={<CalendarRange className="size-[18px]" />}>
            Timeline
          </Item>
        )}
        {features.sprints && (
          <Item to={`${base}/backlog`} icon={<ListTodo className="size-[18px]" />}>
            Backlog
          </Item>
        )}
        <Item to={`${base}/board`} icon={<Columns3 className="size-[18px]" />}>
          Active sprints
        </Item>
        {features.reports && (
          <Item to={`${base}/reports`} icon={<BarChart3 className="size-[18px]" />}>
            Reports
          </Item>
        )}
        <Item to={`${base}/issues`} icon={<Rows3 className="size-[18px]" />}>
          Issues
        </Item>
        <Item to={`${base}/modules`} icon={<Layers className="size-[18px]" />}>
          Modules
        </Item>
        {!collapsed && <div className="px-3 pt-4 pb-1.5 text-[11px] font-semibold tracking-wide text-subtle uppercase">Work</div>}
        <WorkLink base={base} view="operations" color={WORK_COLOR.operations} icon={<Briefcase className="size-4" />}>
          Operations
        </WorkLink>
        <WorkLink base={base} view="technical" color={WORK_COLOR.technical} icon={<Code2 className="size-4" />}>
          Technical
        </WorkLink>
        <WorkLink base={base} view="research" color={WORK_COLOR.research} icon={<FlaskConical className="size-4" />} indent>
          Research heavy
        </WorkLink>
        <WorkLink base={base} view="implementation" color={WORK_COLOR.implementation} icon={<Wrench className="size-4" />} indent>
          Implementation heavy
        </WorkLink>
        {features.releases && !collapsed && <div className="px-3 pt-4 pb-1.5 text-[11px] font-semibold tracking-wide text-subtle uppercase">Development</div>}
        {features.releases && (
          <Item to={`${base}/releases`} icon={<Package className="size-[18px]" />}>
            Releases
          </Item>
        )}
        <div className="flex-1" />
        <Item to={`${base}/settings`} icon={<Settings className="size-[18px]" />}>
          Project settings
        </Item>
        {!collapsed && (
          <p className="px-3 pt-3 pb-4 text-[11px] leading-snug text-subtle">
            You’re in a team-managed project
          </p>
        )}
      </nav>

      <button
        onClick={toggle}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="absolute top-6 -right-3 z-10 grid size-6 place-items-center rounded-full border border-line bg-surface-2 text-muted opacity-0 shadow-pop transition group-hover/side:opacity-100 hover:bg-accent hover:text-ink focus:opacity-100"
      >
        {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronLeft className="size-3.5" />}
      </button>
    </aside>
  )
}
