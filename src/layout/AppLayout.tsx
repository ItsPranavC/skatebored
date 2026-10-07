import { Suspense, useEffect, useRef } from 'react'
import { matchPath, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import { CheckCircle2, X, AlertCircle } from 'lucide-react'
import { TopNav } from './TopNav'
import { ProjectSidebar } from './ProjectSidebar'
import { useProjectByKey, useStore } from '@/store/store'
import { useUI } from '@/store/ui'
import { Modal } from '@/components/ui/overlay'
import { Kbd, Spinner } from '@/components/ui/primitives'
import { IssueModalHost } from '@/features/issue/IssueDetailModal'
import { CreateIssueModal } from '@/features/issue/CreateIssueModal'
import { GlobalSearch } from '@/features/search/GlobalSearch'
import { cn } from '@/lib/utils'

const isTyping = (el: EventTarget | null) => {
  const t = el as HTMLElement | null
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
}

function useGlobalShortcuts() {
  const navigate = useNavigate()
  const location = useLocation()
  const projectKey = matchPath('/projects/:projectKey/*', location.pathname)?.params.projectKey
  const pending = useRef<string | null>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || document.querySelector('[role="dialog"]')) {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
          e.preventDefault()
          useUI.getState().setSearchOpen(true)
        }
        return
      }
      const k = e.key
      if (pending.current === 'g') {
        pending.current = null
        const map: Record<string, string> = { d: '/dashboards', p: '/projects', i: '/issues', f: '/filters', y: '/your-work' }
        if (projectKey) Object.assign(map, { a: `/projects/${projectKey}/board`, b: `/projects/${projectKey}/backlog`, r: `/projects/${projectKey}/reports`, t: `/projects/${projectKey}/timeline` })
        if (map[k]) {
          e.preventDefault()
          navigate(map[k]!)
        }
        return
      }
      if (k === 'g') {
        pending.current = 'g'
        setTimeout(() => (pending.current = null), 1200)
      } else if (k === 'c') {
        e.preventDefault()
        useUI.getState().openCreate()
      } else if (k === '/') {
        e.preventDefault()
        useUI.getState().setSearchOpen(true)
      } else if (k === '?') {
        e.preventDefault()
        useUI.getState().setShortcutsOpen(true)
      } else if (projectKey && ['1', '2', '3', '4'].includes(k)) {
        const p = useStore.getState().projects.find((x) => x.key === projectKey)
        const routes = p?.type === 'kanban' ? ['board', 'reports', 'issues', 'timeline'] : ['backlog', 'board', 'reports', 'timeline']
        navigate(`/projects/${projectKey}/${routes[Number(k) - 1]}`)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [navigate, projectKey])
}

const SHORTCUTS: [string, [string, string][]][] = [
  ['Global', [['c', 'Create issue'], ['/', 'Quick search'], ['⌘ K', 'Quick search'], ['?', 'Keyboard shortcuts'], ['g d', 'Go to dashboards'], ['g p', 'Go to projects'], ['g i', 'Go to issue search'], ['g f', 'Go to filters'], ['g y', 'Go to your work']]],
  ['Project', [['g a', 'Active sprint board'], ['g b', 'Backlog'], ['g r', 'Reports'], ['g t', 'Timeline'], ['1 / 2 / 3 / 4', 'Backlog · Board · Reports · Timeline']]],
  ['Issue (when open)', [['e', 'Edit summary'], ['a', 'Assign'], ['i', 'Assign to me'], ['m', 'Comment'], ['l', 'Edit labels'], ['.', 'Operations menu'], ['Esc', 'Close']]],
  ['Board & backlog', [['j / k', 'Next / previous issue'], ['Enter', 'Open selected issue'], ['f', 'Focus filter']]],
]

function ShortcutsModal() {
  const open = useUI((s) => s.shortcutsOpen)
  const setOpen = useUI((s) => s.setShortcutsOpen)
  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Keyboard shortcuts" width={720}>
      <div className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
        {SHORTCUTS.map(([group, rows]) => (
          <section key={group}>
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-subtle uppercase">{group}</h3>
            <ul className="space-y-1.5">
              {rows.map(([keys, label]) => (
                <li key={label + keys} className="flex items-center justify-between gap-4 text-[13px]">
                  <span className="text-muted">{label}</span>
                  <span className="flex gap-1">
                    {keys.split(' ').map((k, i) => (
                      <Kbd key={i}>{k}</Kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Modal>
  )
}

function Toaster() {
  const toasts = useUI((s) => s.toasts)
  const dismiss = useUI((s) => s.dismissToast)
  return (
    <div className="pointer-events-none fixed bottom-5 left-5 z-[1200] flex w-[360px] max-w-[calc(100vw-40px)] flex-col gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="animate-pop pointer-events-auto flex items-start gap-3 rounded-xl border border-line bg-surface-2 p-3.5 shadow-pop">
          {t.tone === 'error' ? <AlertCircle className="mt-0.5 size-5 shrink-0 text-accent" /> : <CheckCircle2 className={cn('mt-0.5 size-5 shrink-0', t.tone === 'success' ? 'text-success' : 'text-info')} />}
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold">{t.title}</div>
            {t.description && <div className="mt-0.5 text-[13px] text-muted">{t.description}</div>}
            {t.action && (
              <button
                className="mt-1.5 text-[13px] font-semibold text-accent hover:underline"
                onClick={() => {
                  t.action!.onClick()
                  dismiss(t.id)
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
          <button onClick={() => dismiss(t.id)} className="text-subtle hover:text-fg" aria-label="Dismiss">
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  )
}

function ThemeSync() {
  const theme = useStore((s) => s.theme)
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#000000' : '#faf5f0')
  }, [theme])
  return null
}

export function AppLayout() {
  useGlobalShortcuts()
  return (
    <div className="flex h-full flex-col">
      <ThemeSync />
      <TopNav />
      <div className="flex min-h-0 flex-1">
        <Outlet />
      </div>
      <IssueModalHost />
      <CreateIssueModal />
      <GlobalSearch />
      <ShortcutsModal />
      <Toaster />
    </div>
  )
}

const PageSpinner = () => (
  <div className="grid h-full place-items-center">
    <Spinner />
  </div>
)

/** Wraps project routes with the project sidebar and records the visit. */
export function ProjectLayout() {
  const { projectKey } = useParams()
  const project = useProjectByKey(projectKey)
  const pushRecent = useStore((s) => s.pushRecent)
  useEffect(() => {
    if (project) pushRecent({ kind: 'project', id: project.id })
  }, [project?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!project)
    return (
      <main className="grid flex-1 place-items-center p-10 text-center">
        <div>
          <div className="display text-5xl">404</div>
          <p className="mt-2 text-muted">Project “{projectKey}” doesn’t exist or was deleted.</p>
        </div>
      </main>
    )
  return (
    <>
      <ProjectSidebar />
      <main className="min-w-0 flex-1 overflow-auto">
        <Suspense fallback={<PageSpinner />}>
          <Outlet />
        </Suspense>
      </main>
    </>
  )
}

/** Full-width pages (no project sidebar). */
export function PlainLayout() {
  return (
    <main className="min-w-0 flex-1 overflow-auto">
      <Suspense fallback={<PageSpinner />}>
        <Outlet />
      </Suspense>
    </main>
  )
}
