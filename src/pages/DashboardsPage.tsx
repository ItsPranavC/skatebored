import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LayoutDashboard, MoreHorizontal, Plus, Search, Star } from 'lucide-react'
import type { Dashboard } from '@/types'
import { useStore } from '@/store/store'
import { toast } from '@/store/ui'
import { Avatar } from '@/components/jira'
import { ConfirmDialog, Menu } from '@/components/ui/overlay'
import { Button, EmptyState, Input, PageHeader } from '@/components/ui/primitives'
import { DashboardFormModal } from '@/features/dashboard/DashboardDialogs'
import { cn } from '@/lib/utils'

export default function DashboardsPage() {
  const dashboards = useStore((s) => s.dashboards)
  const users = useStore((s) => s.users)
  const createDashboard = useStore((s) => s.createDashboard)
  const updateDashboard = useStore((s) => s.updateDashboard)
  const deleteDashboard = useStore((s) => s.deleteDashboard)
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [creating, setCreating] = useState(false)
  const [renaming, setRenaming] = useState<Dashboard | null>(null)
  const [deleting, setDeleting] = useState<Dashboard | null>(null)

  const rows = useMemo(
    () =>
      dashboards
        .filter((d) => d.name.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => Number(b.starred) - Number(a.starred) || a.name.localeCompare(b.name)),
    [dashboards, q],
  )

  const duplicate = (d: Dashboard) => {
    const copy = createDashboard(`Copy of ${d.name}`, d.description)
    updateDashboard(copy.id, { gadgets: d.gadgets.map((g) => ({ ...g, id: `${g.id}-${copy.id}` })) })
    toast({ title: 'Dashboard copied', tone: 'success' })
  }

  return (
    <div className="mx-auto max-w-6xl pb-16">
      <PageHeader
        title="Dashboards"
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            Create dashboard
          </Button>
        }
      >
        <div className="relative w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search dashboards" className="pl-9" />
        </div>
      </PageHeader>

      <div className="px-8">
        {rows.length ? (
          <div className="overflow-hidden rounded-2xl border border-line">
            <table className="w-full text-[13px]">
              <thead className="bg-surface-2 text-left text-[11px] tracking-wide text-subtle uppercase">
                <tr>
                  <th className="w-10 px-3 py-2.5" aria-label="Starred" />
                  <th className="px-3 py-2.5 font-semibold">Name</th>
                  <th className="px-3 py-2.5 font-semibold">Owner</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Gadgets</th>
                  <th className="w-12 px-3 py-2.5" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => {
                  const owner = users.find((u) => u.id === d.ownerId)
                  return (
                    <tr key={d.id} className="border-t border-line hover:bg-hover">
                      <td className="px-3 py-3">
                        <button onClick={() => updateDashboard(d.id, { starred: !d.starred })} aria-label={d.starred ? 'Unstar' : 'Star'} className="grid place-items-center">
                          <Star className={cn('size-4', d.starred ? 'fill-warn text-warn' : 'text-subtle hover:text-fg')} />
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        <Link to={`/dashboards/${d.id}`} className="flex items-center gap-2.5 font-semibold hover:text-accent">
                          <LayoutDashboard className="size-4 text-muted" />
                          {d.name}
                        </Link>
                        {d.description && <div className="mt-0.5 ml-[26px] truncate text-[12px] text-muted">{d.description}</div>}
                      </td>
                      <td className="px-3 py-3">
                        <span className="flex items-center gap-2">
                          <Avatar user={owner} size="xs" showTooltip={false} />
                          {owner?.name}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{d.gadgets.length}</td>
                      <td className="px-3 py-3">
                        <Menu
                          trigger={<Button variant="ghost" size="xs" icon={<MoreHorizontal className="size-4" />} aria-label="Dashboard actions" />}
                          items={[
                            { label: 'Open', onClick: () => navigate(`/dashboards/${d.id}`) },
                            { label: 'Edit gadgets', onClick: () => navigate(`/dashboards/${d.id}?edit=1`) },
                            { label: 'Rename', onClick: () => setRenaming(d) },
                            { label: 'Copy', onClick: () => duplicate(d) },
                            { divider: true, label: '' },
                            { label: 'Delete', danger: true, onClick: () => setDeleting(d) },
                          ]}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon="📊" title={q ? 'No dashboards match' : 'No dashboards yet'} action={!q && <Button variant="primary" onClick={() => setCreating(true)}>Create dashboard</Button>}>
            Dashboards pull sprint health, burndowns and filters onto one page.
          </EmptyState>
        )}
      </div>

      <DashboardFormModal
        open={creating}
        onClose={() => setCreating(false)}
        title="Create dashboard"
        submitLabel="Create"
        onSubmit={(name, description) => {
          const d = createDashboard(name, description)
          navigate(`/dashboards/${d.id}?edit=1`)
        }}
      />
      <DashboardFormModal
        open={!!renaming}
        onClose={() => setRenaming(null)}
        initial={renaming ?? undefined}
        title="Rename dashboard"
        submitLabel="Save"
        onSubmit={(name, description) => renaming && updateDashboard(renaming.id, { name, description })}
      />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) {
            deleteDashboard(deleting.id)
            toast({ title: `Deleted “${deleting.name}”` })
          }
        }}
        title="Delete dashboard?"
      >
        “{deleting?.name}” and its {deleting?.gadgets.length} gadgets will be permanently deleted.
      </ConfirmDialog>
    </div>
  )
}
