import { Link, NavLink, useNavigate } from 'react-router-dom'
import { Bot, ChevronDown, HelpCircle, LogOut, Moon, Plus, Search, Settings, Sun, Users, FolderKanban, UserCog } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useClerk } from '@clerk/react'
import { useMe, useStore } from '@/store/store'
import { useUI, toast } from '@/store/ui'
import { Avatar, Logo } from '@/components/jira'
import { Menu, Popover } from '@/components/ui/overlay'
import { Button, Kbd } from '@/components/ui/primitives'
import { NotificationsButton } from '@/features/notifications/NotificationsPanel'
import { SyncIndicator } from '@/sync/SyncIndicator'
import { signOutCleanup } from '@/sync/engine'
import { CreateProjectModal } from '@/features/project/CreateProjectModal'
import { useOnboarding } from '@/features/onboarding/Onboarding'
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
  const theme = useStore((s) => s.theme)
  const setTheme = useStore((s) => s.setTheme)
  const clerk = useClerk()
  const setSearchOpen = useUI((s) => s.setSearchOpen)
  const setShortcutsOpen = useUI((s) => s.setShortcutsOpen)
  const [createProject, setCreateProject] = useState(false)

  const recentProjects = recent
    .filter((r) => r.kind === 'project')
    .map((r) => projects.find((p) => p.id === r.id))
    .filter(Boolean)
    .slice(0, 3) as typeof projects
  const starred = projects.filter((p) => p.starred)

  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-1 border-b border-line bg-canvas/95 px-3 backdrop-blur">
      <Link to="/projects" className="mr-3 flex items-center rounded-lg px-1.5 py-1 hover:bg-hover" aria-label="skatebored home">
        <Logo />
      </Link>

      <nav className="hidden items-center gap-0.5 lg:flex">
        <NavDropdown label="Projects" to="/projects">
          {(close) => (
            <>
              {starred.length > 0 && (
                <>
                  <DropHeading>Starred</DropHeading>
                  {starred.map((p) => (
                    <DropLink key={p.id} to={`/projects/${p.key}/sprints`} onClick={close} icon={<ProjectAvatar project={p} />} sub={p.engineering ? 'Engineering' : 'Project'}>
                      {p.name} ({p.key})
                    </DropLink>
                  ))}
                </>
              )}
              <DropHeading>Recent</DropHeading>
              {(recentProjects.length ? recentProjects : projects.slice(0, 3)).map((p) => (
                <DropLink key={p.id} to={`/projects/${p.key}/sprints`} onClick={close} icon={<ProjectAvatar project={p} />} sub={p.engineering ? 'Engineering' : 'Project'}>
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
        <NavLink to="/calendar" className={({ isActive }) => cn('flex h-8 items-center rounded-lg px-2.5 text-[14px] font-medium hover:bg-hover', isActive ? 'text-accent' : 'text-fg')}>
          Calendar
        </NavLink>
        <NavLink to="/meetings" className={({ isActive }) => cn('flex h-8 items-center rounded-lg px-2.5 text-[14px] font-medium hover:bg-hover', isActive ? 'text-accent' : 'text-fg')}>
          Meetings
        </NavLink>
        <NavLink to="/people" className={({ isActive }) => cn('flex h-8 items-center rounded-lg px-2.5 text-[14px] font-medium hover:bg-hover', isActive ? 'text-accent' : 'text-fg')}>
          People
        </NavLink>
      </nav>



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

      <SyncIndicator />
      <NotificationsButton />

      <Menu
        trigger={<Button variant="ghost" aria-label="Help" icon={<HelpCircle className="size-[18px]" />} />}
        items={[
          { label: 'Getting started', onClick: () => useOnboarding.getState().open() },
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
          { label: 'Agents & MCP', icon: <Bot className="size-4" />, onClick: () => navigate('/agents') },
          { divider: true, label: '' },
          { heading: true, label: 'Workspace' },
          { label: 'Projects', icon: <FolderKanban className="size-4" />, onClick: () => navigate('/projects') },
          { label: 'People & teams', icon: <Users className="size-4" />, onClick: () => navigate('/people') },
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
                void (async () => {
                  // Never sign out with unsent changes; on success, clear cached company data from this device.
                  if (!(await signOutCleanup())) return toast({ title: 'Some changes haven’t reached the cloud yet', description: 'Reconnect, wait for “Saved”, then log out.', tone: 'error' })
                  await clerk.signOut({ redirectUrl: '/sign-in' })
                  window.location.reload()
                })()
              }}
              className="flex w-full items-center gap-2 px-4 py-2 text-left text-[13px] hover:bg-hover"
            >
              <LogOut className="size-4 text-muted" /> Log out
            </button>
          </div>
        )}
      </Popover>

      <CreateProjectModal open={createProject} onClose={() => setCreateProject(false)} />
    </header>
  )
}
