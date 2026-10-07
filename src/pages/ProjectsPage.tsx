import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { MoreHorizontal, Plus, Search, Settings, Star, Trash2 } from 'lucide-react'
import { useStore } from '@/store/store'
import { toast } from '@/store/ui'
import { Avatar } from '@/components/jira'
import { ConfirmDialog, Menu, Select } from '@/components/ui/overlay'
import { Button, EmptyState, Input, PageHeader } from '@/components/ui/primitives'
import { ProjectAvatar } from '@/layout/TopNav'
import { CreateProjectModal } from '@/features/project/CreateProjectModal'
import { cn } from '@/lib/utils'
import type { Project } from '@/types'

export default function ProjectsPage() {
  const navigate = useNavigate()
  const projects = useStore((s) => s.projects)
  const issues = useStore((s) => s.issues)
  const users = useStore((s) => s.users)
  const toggleStar = useStore((s) => s.toggleStarProject)
  const deleteProject = useStore((s) => s.deleteProject)
  const [q, setQ] = useState('')
  const [type, setType] = useState<'all' | 'scrum' | 'kanban'>('all')
  const [category, setCategory] = useState('all')
  const [creating, setCreating] = useState(false)
  const [trash, setTrash] = useState<Project | null>(null)

  const categories = Array.from(new Set(projects.map((p) => p.category)))
  const counts = useMemo(() => {
    const m = new Map<string, { total: number; open: number }>()
    for (const p of projects) {
      const doneIds = new Set(p.statuses.filter((s) => s.category === 'done').map((s) => s.id))
      const mine = issues.filter((i) => i.projectId === p.id)
      m.set(p.id, { total: mine.length, open: mine.filter((i) => !doneIds.has(i.statusId)).length })
    }
    return m
  }, [projects, issues])

  const rows = projects
    .filter((p) => (type === 'all' || p.type === type) && (category === 'all' || p.category === category))
    .filter((p) => !q || `${p.name} ${p.key}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => Number(b.starred) - Number(a.starred) || a.name.localeCompare(b.name))

  return (
    <div className="mx-auto max-w-[1280px]">
      <PageHeader
        title="Projects"
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            Create project
          </Button>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-64">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search projects" className="pl-9" />
          </div>
          <Select
            className="w-44"
            value={type}
            onChange={setType}
            options={[
              { value: 'all', label: 'All project types' },
              { value: 'scrum', label: 'Scrum' },
              { value: 'kanban', label: 'Kanban' },
            ]}
          />
          <Select className="w-44" value={category} onChange={setCategory} options={[{ value: 'all', label: 'All categories' }, ...categories.map((c) => ({ value: c, label: c }))]} />
        </div>
      </PageHeader>

      <div className="px-8 pb-10">
        {rows.length === 0 ? (
          <EmptyState
            icon="🛹"
            title="No projects match"
            action={
              <Button
                onClick={() => {
                  setQ('')
                  setType('all')
                  setCategory('all')
                }}
              >
                Clear filters
              </Button>
            }
          >
            Try a different search or filter — or start something new.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[820px] text-left text-[13px]">
              <thead className="bg-surface-2 text-xs text-muted">
                <tr>
                  <th className="w-10 px-3 py-2.5" aria-label="Starred" />
                  <th className="px-3 py-2.5 font-semibold">Name</th>
                  <th className="px-3 py-2.5 font-semibold">Key</th>
                  <th className="px-3 py-2.5 font-semibold">Type</th>
                  <th className="px-3 py-2.5 font-semibold">Category</th>
                  <th className="px-3 py-2.5 font-semibold">Lead</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Open / total</th>
                  <th className="w-12 px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const lead = users.find((u) => u.id === p.leadId)
                  const c = counts.get(p.id)!
                  return (
                    <tr key={p.id} className="border-t border-line transition hover:bg-hover">
                      <td className="px-3 py-2.5">
                        <button onClick={() => toggleStar(p.id)} aria-label={p.starred ? 'Unstar project' : 'Star project'} className="grid size-7 place-items-center rounded-md hover:bg-hover">
                          <Star className={cn('size-4', p.starred ? 'fill-warn text-warn' : 'text-subtle')} />
                        </button>
                      </td>
                      <td className="px-3 py-2.5">
                        <Link to={`/projects/${p.key}/board`} className="flex items-center gap-2.5 font-medium hover:text-accent">
                          <ProjectAvatar project={p} />
                          {p.name}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 font-semibold text-muted">{p.key}</td>
                      <td className="px-3 py-2.5 text-muted">Team-managed software · {p.type === 'scrum' ? 'Scrum' : 'Kanban'}</td>
                      <td className="px-3 py-2.5 text-muted">{p.category}</td>
                      <td className="px-3 py-2.5">
                        <span className="flex items-center gap-2">
                          <Avatar user={lead} size="xs" />
                          {lead?.name ?? '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted">
                        <span className="text-fg">{c.open}</span> / {c.total}
                      </td>
                      <td className="px-3 py-2.5">
                        <Menu
                          trigger={<Button variant="ghost" size="sm" icon={<MoreHorizontal className="size-4" />} aria-label="More actions" />}
                          items={[
                            { label: 'Project settings', icon: <Settings className="size-4" />, onClick: () => navigate(`/projects/${p.key}/settings`) },
                            { label: 'Move to trash', icon: <Trash2 className="size-4" />, danger: true, onClick: () => setTrash(p) },
                          ]}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CreateProjectModal open={creating} onClose={() => setCreating(false)} />
      <ConfirmDialog
        open={!!trash}
        onClose={() => setTrash(null)}
        title={`Move ${trash?.name} to trash?`}
        confirmLabel="Move to trash"
        onConfirm={() => {
          if (!trash) return
          deleteProject(trash.id)
          toast({ title: `${trash.name} was deleted`, tone: 'success' })
        }}
      >
        All {counts.get(trash?.id ?? '')?.total ?? 0} issues, sprints and history in <b>{trash?.key}</b> will be permanently removed.
      </ConfirmDialog>
    </div>
  )
}
