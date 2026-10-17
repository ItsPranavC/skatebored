import { NavLink, useParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Columns3, ListTodo, Settings } from 'lucide-react'
import type { ReactNode } from 'react'
import { useProjectByKey, useStore } from '@/store/store'
import { cn } from '@/lib/utils'
import { ProjectAvatar } from './TopNav'

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

export function ProjectSidebar() {
  const { projectKey } = useParams()
  const project = useProjectByKey(projectKey)
  const collapsed = useStore((s) => s.sidebarCollapsed)
  const toggle = useStore((s) => s.toggleSidebar)
  if (!project) return null
  const base = `/projects/${project.key}`
  return (
    <aside className={cn('group/side relative flex shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-200', collapsed ? 'w-16' : 'w-[240px]')}>
      <div className={cn('flex items-center gap-3 px-4 pt-5 pb-4', collapsed && 'justify-center px-0')}>
        <ProjectAvatar project={project} size={collapsed ? 32 : 36} />
        {!collapsed && (
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold tracking-[-0.02em]">{project.name}</div>
            <div className="truncate text-xs text-muted">{project.engineering ? 'Engineering' : 'Project'}</div>
          </div>
        )}
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2">
        <Item to={`${base}/sprints`} icon={<ListTodo className="size-[18px]" />}>
          Sprints
        </Item>
        <Item to={`${base}/board`} icon={<Columns3 className="size-[18px]" />}>
          Board
        </Item>
        <div className="flex-1" />
        <Item to={`${base}/settings`} icon={<Settings className="size-[18px]" />}>
          Project settings
        </Item>
        <div className="pb-4" />
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
