import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, Columns3, Filter, LayoutDashboard, ListTodo, Moon, Plus, Search, Sun } from 'lucide-react'
import { useStore } from '@/store/store'
import { useUI } from '@/store/ui'
import { Avatar, IssueTypeIcon, StatusLozenge, useIssueModal } from '@/components/jira'
import { Kbd } from '@/components/ui/primitives'
import { ProjectAvatar } from '@/layout/TopNav'
import { cn } from '@/lib/utils'

interface Item {
  id: string
  group: string
  icon: ReactNode
  label: ReactNode
  sub?: ReactNode
  right?: ReactNode
  run: () => void
}

export function GlobalSearch() {
  const open = useUI((s) => s.searchOpen)
  const setOpen = useUI((s) => s.setSearchOpen)
  if (!open) return null
  return <Palette onClose={() => setOpen(false)} />
}

function Palette({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { open: openIssue } = useIssueModal()
  const issues = useStore((s) => s.issues)
  const projects = useStore((s) => s.projects)
  const filters = useStore((s) => s.filters)
  const users = useStore((s) => s.users)
  const dashboards = useStore((s) => s.dashboards)
  const recent = useStore((s) => s.recent)
  const theme = useStore((s) => s.theme)
  const setTheme = useStore((s) => s.setTheme)
  const openCreate = useUI((s) => s.openCreate)
  const [q, setQ] = useState('')
  const [hi, setHi] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const currentProject = useMemo(() => {
    const m = location.pathname.match(/^\/projects\/([^/]+)/)
    return m ? projects.find((p) => p.key.toLowerCase() === m[1]!.toLowerCase()) : undefined
  }, [location.pathname, projects])

  const go = (fn: () => void) => () => {
    onClose()
    fn()
  }

  const issueItem = (i: (typeof issues)[number], group: string): Item => {
    const p = projects.find((x) => x.id === i.projectId)
    return {
      id: `i-${i.id}`,
      group,
      icon: <IssueTypeIcon type={i.type} />,
      label: i.summary,
      sub: `${i.key} · ${p?.name ?? ''}`,
      right: <StatusLozenge status={p?.statuses.find((s) => s.id === i.statusId)} />,
      run: go(() => openIssue(i.key)),
    }
  }

  const items: Item[] = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) {
      const out: Item[] = []
      recent
        .filter((r) => r.kind === 'issue')
        .slice(0, 6)
        .forEach((r) => {
          const i = issues.find((x) => x.id === r.id)
          if (i) out.push(issueItem(i, 'Recent issues'))
        })
      const recentProjects = recent.filter((r) => r.kind === 'project').map((r) => projects.find((p) => p.id === r.id)).filter(Boolean) as typeof projects
      ;(recentProjects.length ? recentProjects : projects).slice(0, 4).forEach((p) =>
        out.push({
          id: `p-${p.id}`,
          group: 'Recent boards & projects',
          icon: <ProjectAvatar project={p} size={20} />,
          label: `${p.name}`,
          sub: `${p.key} · Scrum board`,
          run: go(() => navigate(`/projects/${p.key}/board`)),
        }),
      )
      out.push({ id: 'a-create', group: 'Actions', icon: <Plus className="size-4 text-muted" />, label: 'Create issue', right: <Kbd>c</Kbd>, run: go(() => openCreate(currentProject ? { projectId: currentProject.id } : {})) })
      if (currentProject) {
        if (currentProject.type === 'scrum')
          out.push({ id: 'a-backlog', group: 'Actions', icon: <ListTodo className="size-4 text-muted" />, label: `Go to ${currentProject.key} backlog`, run: go(() => navigate(`/projects/${currentProject.key}/backlog`)) })
        out.push({ id: 'a-board', group: 'Actions', icon: <Columns3 className="size-4 text-muted" />, label: `Go to ${currentProject.key} board`, run: go(() => navigate(`/projects/${currentProject.key}/board`)) })
      }
      out.push({
        id: 'a-theme',
        group: 'Actions',
        icon: theme === 'dark' ? <Sun className="size-4 text-muted" /> : <Moon className="size-4 text-muted" />,
        label: theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
        run: go(() => setTheme(theme === 'dark' ? 'light' : 'dark')),
      })
      out.push({ id: 'a-filters', group: 'Actions', icon: <Filter className="size-4 text-muted" />, label: 'View all filters', run: go(() => navigate('/filters')) })
      return out
    }

    const out: Item[] = []
    const exact = issues.find((i) => i.key.toLowerCase() === term)
    if (exact) out.push(issueItem(exact, 'Issues'))
    issues
      .filter((i) => i !== exact && (i.key.toLowerCase().includes(term) || i.summary.toLowerCase().includes(term)))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, exact ? 7 : 8)
      .forEach((i) => out.push(issueItem(i, 'Issues')))
    projects
      .filter((p) => p.name.toLowerCase().includes(term) || p.key.toLowerCase().includes(term))
      .forEach((p) =>
        out.push({ id: `p-${p.id}`, group: 'Projects', icon: <ProjectAvatar project={p} size={20} />, label: p.name, sub: p.key, run: go(() => navigate(`/projects/${p.key}/board`)) }),
      )
    filters
      .filter((f) => f.name.toLowerCase().includes(term))
      .forEach((f) => out.push({ id: `f-${f.id}`, group: 'Filters', icon: <Filter className="size-4 text-muted" />, label: f.name, run: go(() => navigate(`/issues?filter=${f.id}`)) }))
    dashboards
      .filter((d) => d.name.toLowerCase().includes(term))
      .forEach((d) => out.push({ id: `d-${d.id}`, group: 'Dashboards', icon: <LayoutDashboard className="size-4 text-muted" />, label: d.name, run: go(() => navigate(`/dashboards/${d.id}`)) }))
    users
      .filter((u) => u.name.toLowerCase().includes(term) || u.email.toLowerCase().includes(term))
      .forEach((u) => out.push({ id: `u-${u.id}`, group: 'People', icon: <Avatar user={u} size="xs" showTooltip={false} />, label: u.name, sub: u.title, run: go(() => navigate(`/people/${u.id}`)) }))
    out.push({
      id: 'all',
      group: '',
      icon: <Search className="size-4 text-muted" />,
      label: (
        <span>
          View all issues matching <span className="font-semibold">“{q.trim()}”</span>
        </span>
      ),
      right: <ArrowRight className="size-4 text-muted" />,
      run: go(() => navigate(`/issues?jql=${encodeURIComponent(`text ~ "${q.trim().replace(/"/g, '')}" ORDER BY updated DESC`)}`)),
    })
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, issues, projects, filters, users, dashboards, recent, theme, currentProject])

  useEffect(() => setHi(0), [q])
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${hi}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [hi])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  let lastGroup = '\u0000'
  return createPortal(
    <div className="fixed inset-0 z-[950] flex items-start justify-center bg-black/60 p-4 pt-[10vh] backdrop-blur-[2px]" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Search" onMouseDown={(e) => e.stopPropagation()} className="animate-pop flex max-h-[70vh] w-full max-w-[640px] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-pop">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="size-5 text-subtle" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setHi((h) => Math.min(h + 1, items.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setHi((h) => Math.max(h - 1, 0))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                items[hi]?.run()
              }
            }}
            placeholder="Search issues, projects, filters, people…"
            className="h-14 flex-1 bg-transparent text-[16px] outline-none placeholder:text-subtle"
          />
          <Kbd>Esc</Kbd>
        </div>
        <div ref={listRef} className="overflow-y-auto py-2" role="listbox">
          {items.length === 0 && <div className="px-4 py-8 text-center text-sm text-muted">No results</div>}
          {items.map((it, idx) => {
            const header = it.group !== lastGroup && it.group ? it.group : null
            const divider = it.group !== lastGroup && !it.group
            lastGroup = it.group
            return (
              <div key={it.id}>
                {header && <div className="px-4 pt-3 pb-1 text-[11px] font-semibold tracking-wide text-subtle uppercase">{header}</div>}
                {divider && <div className="my-2 h-px bg-line" />}
                <button
                  data-idx={idx}
                  role="option"
                  aria-selected={idx === hi}
                  onMouseMove={() => setHi(idx)}
                  onClick={it.run}
                  className={cn('flex w-full items-center gap-3 px-4 py-2 text-left', idx === hi && 'bg-hover')}
                >
                  <span className="grid w-5 shrink-0 place-items-center">{it.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px]">{it.label}</span>
                    {it.sub && <span className="block truncate text-[12px] text-muted">{it.sub}</span>}
                  </span>
                  {it.right}
                </button>
              </div>
            )
          })}
        </div>
        <div className="flex items-center gap-4 border-t border-line px-4 py-2 text-[11px] text-subtle">
          <span className="flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> navigate
          </span>
          <span className="flex items-center gap-1">
            <Kbd>↵</Kbd> open
          </span>
          <span className="ml-auto">skatebored search</span>
        </div>
      </div>
    </div>,
    document.body,
  )
}
