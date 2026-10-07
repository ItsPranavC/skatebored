import { Link, NavLink, useNavigate } from 'react-router-dom'
import { ChevronDown, HelpCircle, LayoutDashboard, LogOut, Moon, Plus, RotateCcw, Search, Settings, Star, Sun, Users, Filter, FolderKanban, UserCog } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useClerk } from '@clerk/react'
import { useMe, useStore } from '@/store/store'
import { useUI, toast } from '@/store/ui'
import { Avatar, Logo } from '@/components/jira'
import { Menu, Popover, ConfirmDialog } from '@/components/ui/overlay'
import { Button, Kbd } from '@/components/ui/primitives'
import { NotificationsButton } from '@/features/notifications/NotificationsPanel'
import { CreateProjectModal } from '@/features/project/CreateProjectModal'
import { cn } from '@/lib/utils'

function NavDropdown({ label, to, children }: { label: string; to: string; children: (close: () => void) => ReactNode }) {
  return (
    <div className="flex items-center">
      <NavLink
        to={to}
        className={({ isActive }) =>
          cn('relative flex h-8 items-center rounded-l-lg pr-1 pl-2.5 text-[14px] font-medium transition hover:bg-hover', isActive ? 'text-accent' : 'text-fg')
        }
      >
        {label}
      </NavLink>
      <Popover
        width={300}
        trigger={
          <button className="grid h-8 w-6 place-items-center rounded-r-lg text-muted hover:bg-hover hover:text-fg" aria-label={`${label} menu`}>
            <ChevronDown className="size-4" />
          </button>
        }
      >
        {(close) => <div className="py-2">{children(close)}</div>}
      </Popover>
    </div>
  )
}

function DropHeading({ children }: { children: ReactNode }) {
  return <div className="px-4 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-subtle uppercase">{children}</div>
}

function DropLink({ to, icon, children, sub, onClick }: { to: string; icon?: ReactNode; children: ReactNode; sub?: ReactNode; onClick: () => void }) {
  return (
    <Link to={to} onClick={onClick} className="flex items-center gap-3 px-4 py-2 text-[13px] hover:bg-hover">
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{children}</span>
        {sub && <span className="block truncate text-[11px] text-subtle">{sub}</span>}
      </span>
    </Link>
  )
}

export function ProjectAvatar({ project, size = 24 }: { project: { color: string; icon: string; name: string }; size?: number }) {
  return (
    <span
      className="inline-grid shrink-0 place-items-center rounded-md"
      style={{ width: size, height: size, background: `color-mix(in srgb, ${project.color} 28%, var(--surface-3))`, fontSize: size * 0.55 }}
      aria-hidden
    >
      {project.icon}
    </span>
  )
}

export function TopNav() {
  const me = useMe()
  const navigate = useNavigate()
  const projects = useStore((s) => s.projects)
  const recent = useStore((s) => s.recent)
  const filters = useStore((s) => s.filters)
  const dashboards = useStore((s) => s.dashboards)
  const theme = useStore((s) => s.theme)
  const setTheme = useStore((s) => s.setTheme)
  const clerk = useClerk()
  const resetWorkspace = useStore((s) => s.resetWorkspace)
  const openCreate = useUI((s) => s.openCreate)
  const setSearchOpen = useUI((s) => s.setSearchOpen)
  const setShortcutsOpen = useUI((s) => s.setShortcutsOpen)
  const [createProject, setCreateProject] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)

  const recentProjects = recent
    .filter((r) => r.kind === 'project')
    .map((r) => projects.find((p) => p.id === r.id))
    .filter(Boolean)
    .slice(0, 3) as typeof projects
  const starred = projects.filter((p) => p.starred)

  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-1 border-b border-line bg-canvas/95 px-3 backdrop-blur">
      <Link to="/your-work" className="mr-3 flex items-center rounded-lg px-1.5 py-1 hover:bg-hover" aria-label="skatebored home">
        <Logo />
      </Link>

      <nav className="hidden items-center gap-0.5 lg:flex">
        <NavLink to="/your-work" className={({ isActive }) => cn('flex h-8 items-center rounded-lg px-2.5 text-[14px] font-medium hover:bg-hover', isActive ? 'text-accent' : 'text-fg')}>
          Your work
        </NavLink>
        <NavDropdown label="Projects" to="/projects">
          {(close) => (
            <>
              {starred.length > 0 && (
                <>
                  <DropHeading>Starred</DropHeading>
                  {starred.map((p) => (
                    <DropLink key={p.id} to={`/projects/${p.key}/board`} onClick={close} icon={<ProjectAvatar project={p} />} sub={`${p.type === 'scrum' ? 'Scrum' : 'Kanban'} project`}>
                      {p.name} ({p.key})
                    </DropLink>
                  ))}
                </>
              )}
              <DropHeading>Recent</DropHeading>
              {(recentProjects.length ? recentProjects : projects.slice(0, 3)).map((p) => (
                <DropLink key={p.id} to={`/projects/${p.key}/board`} onClick={close} icon={<ProjectAvatar project={p} />} sub={`${p.type === 'scrum' ? 'Scrum' : 'Kanban'} project`}>
                  {p.name} ({p.key})
                </DropLink>
              ))}
              <div className="my-2 h-px bg-line" />
              <DropLink to="/projects" onClick={close} icon={<FolderKanban className="size-4 text-muted" />}>
                View all projects
              </DropLink>
              <button
                onClick={() => {
                  close()
                  setCreateProject(true)
                }}
                className="flex w-full items-center gap-3 px-4 py-2 text-left text-[13px] hover:bg-hover"
              >
                <Plus className="size-4 text-muted" /> Create project
              </button>
            </>
          )}
        </NavDropdown>
        <NavDropdown label="Filters" to="/filters">
          {(close) => (
            <>
              <DropHeading>Starred filters</DropHeading>
              {filters
                .filter((f) => f.starred)
                .map((f) => (
                  <DropLink key={f.id} to={`/issues?filter=${f.id}`} onClick={close} icon={<Star className="size-4 fill-warn text-warn" />}>
                    {f.name}
                  </DropLink>
                ))}
              <div className="my-2 h-px bg-line" />
              <DropLink to="/issues" onClick={close} icon={<Search className="size-4 text-muted" />}>
                Search issues (advanced)
              </DropLink>
              <DropLink to="/filters" onClick={close} icon={<Filter className="size-4 text-muted" />}>
                View all filters
              </DropLink>
            </>
          )}
        </NavDropdown>
        <NavDropdown label="Dashboards" to="/dashboards">
          {(close) => (
            <>
              <DropHeading>Dashboards</DropHeading>
              {dashboards.map((d) => (
                <DropLink key={d.id} to={`/dashboards/${d.id}`} onClick={close} icon={<LayoutDashboard className="size-4 text-muted" />}>
                  {d.name}
                </DropLink>
              ))}
              <div className="my-2 h-px bg-line" />
              <DropLink to="/dashboards" onClick={close}>
                View all dashboards
              </DropLink>
            </>
          )}
        </NavDropdown>
        <NavLink to="/people" className={({ isActive }) => cn('flex h-8 items-center rounded-lg px-2.5 text-[14px] font-medium hover:bg-hover', isActive ? 'text-accent' : 'text-fg')}>
          People
        </NavLink>
      </nav>

      <Button variant="primary" size="sm" className="ml-2 rounded-full px-4" icon={<Plus className="size-4" strokeWidth={2.6} />} onClick={() => openCreate()}>
        Create
      </Button>

      <div className="flex-1" />

      <button
        onClick={() => setSearchOpen(true)}
        className="mr-1 hidden h-8 w-64 items-center gap-2 rounded-full border border-line bg-surface-2 px-3 text-left text-[13px] text-subtle transition hover:border-line-strong md:flex"
      >
        <Search className="size-4" />
        <span className="flex-1">Search</span>
        <Kbd>/</Kbd>
      </button>
      <Button variant="ghost" className="md:hidden" icon={<Search className="size-4" />} onClick={() => setSearchOpen(true)} aria-label="Search" />

      <NotificationsButton />

      <Menu
        trigger={<Button variant="ghost" aria-label="Help" icon={<HelpCircle className="size-[18px]" />} />}
        items={[
          { label: 'Keyboard shortcuts', shortcut: '?', onClick: () => setShortcutsOpen(true) },
          { label: 'JQL reference', onClick: () => navigate('/issues?help=jql') },
          { label: 'skatebored.org', onClick: () => window.open('https://www.skatebored.org/', '_blank', 'noopener') },
        ]}
      />
      <Menu
        trigger={<Button variant="ghost" aria-label="Settings" icon={<Settings className="size-[18px]" />} />}
        width={240}
        items={[
          { heading: true, label: 'Personal settings' },
          { label: theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme', icon: theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />, onClick: () => setTheme(theme === 'dark' ? 'light' : 'dark') },
          { divider: true, label: '' },
          { heading: true, label: 'Workspace' },
          { label: 'Projects', icon: <FolderKanban className="size-4" />, onClick: () => navigate('/projects') },
          { label: 'People & teams', icon: <Users className="size-4" />, onClick: () => navigate('/people') },
          { label: 'Reset demo workspace', icon: <RotateCcw className="size-4" />, danger: true, onClick: () => setConfirmReset(true) },
        ]}
      />
      <Popover
        placement="bottom-end"
        width={280}
        trigger={
          <button className="ml-1 rounded-full" aria-label="Your profile">
            <Avatar user={me} size="md" showTooltip={false} />
          </button>
        }
      >
        {(close) => (
          <div className="py-2">
            <div className="flex items-center gap-3 px-4 py-2">
              <Avatar user={me} size="lg" showTooltip={false} />
              <div className="min-w-0">
                <div className="truncate font-semibold">{me.name}</div>
                <div className="truncate text-xs text-muted">{me.email}</div>
              </div>
            </div>
            <div className="my-1 h-px bg-line" />
            <Link to={`/people/${me.id}`} onClick={close} className="block px-4 py-2 text-[13px] hover:bg-hover">
              Profile
            </Link>
            <button
              onClick={() => {
                close()
                clerk.openUserProfile()
              }}
              className="flex w-full items-center gap-2 px-4 py-2 text-left text-[13px] hover:bg-hover"
            >
              <UserCog className="size-4 text-muted" /> Manage account
            </button>
            <div className="my-1 h-px bg-line" />
            <button
              onClick={() => {
                close()
                void clerk.signOut({ redirectUrl: '/sign-in' })
              }}
              className="flex w-full items-center gap-2 px-4 py-2 text-left text-[13px] hover:bg-hover"
            >
              <LogOut className="size-4 text-muted" /> Log out
            </button>
          </div>
        )}
      </Popover>

      <CreateProjectModal open={createProject} onClose={() => setCreateProject(false)} />
      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={() => {
          resetWorkspace()
          navigate('/your-work')
          toast({ title: 'Workspace reset to demo data', tone: 'success' })
        }}
        title="Reset the demo workspace?"
        confirmLabel="Reset"
      >
        Every project, issue, sprint, comment and filter will be replaced with the original skatebored demo data. This can’t be undone.
      </ConfirmDialog>
    </header>
  )
}
