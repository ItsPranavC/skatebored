import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowDown, ArrowLeftRight, ArrowUp, ChevronRight, MoreHorizontal, Pencil, Plus, Settings2, Star, Trash2 } from 'lucide-react'
import type { Dashboard, Gadget } from '@/types'
import { useStore } from '@/store/store'
import { toast } from '@/store/ui'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/jira'
import { ConfirmDialog, Menu } from '@/components/ui/overlay'
import { Button } from '@/components/ui/primitives'
import { GadgetBody } from '@/features/dashboard/gadgets'
import { AddGadgetModal, ConfigureGadgetModal, DashboardFormModal } from '@/features/dashboard/DashboardDialogs'
import NotFoundPage from '@/pages/NotFoundPage'

function GadgetFrame({
  dashboard,
  g,
  editing,
  isFirst,
  isLast,
  onConfigure,
}: {
  dashboard: Dashboard
  g: Gadget
  editing: boolean
  isFirst: boolean
  isLast: boolean
  onConfigure: () => void
}) {
  const updateDashboard = useStore((s) => s.updateDashboard)
  const updateGadget = useStore((s) => s.updateGadget)
  const removeGadget = useStore((s) => s.removeGadget)
  const [title, setTitle] = useState(g.title)
  useEffect(() => setTitle(g.title), [g.title])

  const move = (dir: -1 | 1) => {
    const list = [...dashboard.gadgets]
    const col = list.filter((x) => x.column === g.column)
    const k = col.findIndex((x) => x.id === g.id)
    const neighbour = col[k + dir]
    if (!neighbour) return
    const a = list.findIndex((x) => x.id === g.id)
    const b = list.findIndex((x) => x.id === neighbour.id)
    ;[list[a], list[b]] = [list[b]!, list[a]!]
    updateDashboard(dashboard.id, { gadgets: list })
  }
  const switchColumn = () => {
    const rest = dashboard.gadgets.filter((x) => x.id !== g.id)
    updateDashboard(dashboard.id, { gadgets: [...rest, { ...g, column: g.column === 0 ? 1 : 0 }] })
  }
  const commitTitle = () => {
    const t = title.trim()
    if (t && t !== g.title) updateGadget(dashboard.id, g.id, { title: t })
    else setTitle(g.title)
  }

  return (
    <section className={cn('animate-pop rounded-2xl border bg-surface', editing ? 'border-dashed border-line-strong' : 'border-line')} aria-label={g.title}>
      <header className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        {editing ? (
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              if (e.key === 'Escape') {
                setTitle(g.title)
                ;(e.target as HTMLInputElement).blur()
              }
            }}
            aria-label="Gadget title"
            className="min-w-0 flex-1 rounded-md bg-transparent px-1 py-0.5 text-[14px] font-semibold tracking-[-0.01em] outline-none hover:bg-hover focus:bg-surface-2 focus:ring-2 focus:ring-accent-soft"
          />
        ) : (
          <h3 className="min-w-0 flex-1 truncate text-[14px] font-semibold tracking-[-0.01em]">{g.title}</h3>
        )}
        <Menu
          trigger={<Button variant="ghost" size="xs" icon={<MoreHorizontal className="size-4" />} aria-label={`${g.title} actions`} />}
          items={[
            { label: 'Configure', icon: <Settings2 className="size-4" />, onClick: onConfigure },
            { divider: true, label: '' },
            { label: 'Move up', icon: <ArrowUp className="size-4" />, disabled: isFirst, onClick: () => move(-1) },
            { label: 'Move down', icon: <ArrowDown className="size-4" />, disabled: isLast, onClick: () => move(1) },
            { label: g.column === 0 ? 'Move to right column' : 'Move to left column', icon: <ArrowLeftRight className="size-4" />, onClick: switchColumn },
            { divider: true, label: '' },
            { label: 'Remove', icon: <Trash2 className="size-4" />, danger: true, onClick: () => removeGadget(dashboard.id, g.id) },
          ]}
        />
      </header>
      <div className="p-4">
        <GadgetBody g={g} />
      </div>
    </section>
  )
}

export default function DashboardPage() {
  const { dashboardId } = useParams()
  const dashboard = useStore((s) => s.dashboards.find((d) => d.id === dashboardId))
  const owner = useStore((s) => s.users.find((u) => u.id === dashboard?.ownerId))
  const updateDashboard = useStore((s) => s.updateDashboard)
  const deleteDashboard = useStore((s) => s.deleteDashboard)
  const createDashboard = useStore((s) => s.createDashboard)
  const pushRecent = useStore((s) => s.pushRecent)
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const editing = params.get('edit') === '1'
  const [adding, setAdding] = useState(false)
  const [configuring, setConfiguring] = useState<Gadget | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (dashboard) pushRecent({ kind: 'dashboard', id: dashboard.id })
  }, [dashboard?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!dashboard) return <NotFoundPage />

  const setEditing = (v: boolean) => {
    const next = new URLSearchParams(params)
    if (v) next.set('edit', '1')
    else next.delete('edit')
    setParams(next, { replace: true })
  }
  const columns = [0, 1].map((c) => dashboard.gadgets.filter((g) => g.column === c))

  return (
    <div className="pb-16">
      <div className="px-8 pt-6 pb-5">
        <div className="mb-2 flex items-center gap-1.5 text-[13px] text-muted">
          <Link to="/dashboards" className="hover:text-fg hover:underline">
            Dashboards
          </Link>
          <ChevronRight className="size-3.5" />
          <span className="truncate">{dashboard.name}</span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="display truncate text-[28px]">{dashboard.name}</h1>
            <button onClick={() => updateDashboard(dashboard.id, { starred: !dashboard.starred })} aria-label={dashboard.starred ? 'Unstar dashboard' : 'Star dashboard'} className="grid size-8 place-items-center rounded-lg hover:bg-hover">
              <Star className={cn('size-[18px]', dashboard.starred ? 'fill-warn text-warn' : 'text-subtle')} />
            </button>
          </div>
          <div className="flex items-center gap-2">
            {editing && (
              <Button icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>
                Add gadget
              </Button>
            )}
            <Button variant={editing ? 'primary' : 'default'} icon={editing ? undefined : <Pencil className="size-3.5" />} onClick={() => setEditing(!editing)}>
              {editing ? 'Done' : 'Edit'}
            </Button>
            <Menu
              trigger={<Button variant="ghost" icon={<MoreHorizontal className="size-4" />} aria-label="Dashboard actions" />}
              items={[
                { label: 'Rename or describe', onClick: () => setRenaming(true) },
                {
                  label: 'Copy dashboard',
                  onClick: () => {
                    const copy = createDashboard(`Copy of ${dashboard.name}`, dashboard.description)
                    updateDashboard(copy.id, { gadgets: dashboard.gadgets.map((g) => ({ ...g, id: `${g.id}-${copy.id}` })) })
                    navigate(`/dashboards/${copy.id}`)
                    toast({ title: 'Dashboard copied', tone: 'success' })
                  },
                },
                { divider: true, label: '' },
                { label: 'Delete dashboard', danger: true, onClick: () => setDeleting(true) },
              ]}
            />
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2 text-[13px] text-muted">
          <Avatar user={owner} size="xs" showTooltip={false} />
          <span>{owner?.name}</span>
          {dashboard.description && (
            <>
              <span>·</span>
              <span className="truncate">{dashboard.description}</span>
            </>
          )}
        </div>
      </div>

      {dashboard.gadgets.length === 0 ? (
        <div className="mx-8 grid place-items-center rounded-2xl border border-dashed border-line-strong px-6 py-20 text-center">
          <div>
            <div className="display text-2xl">This dashboard is empty</div>
            <p className="mt-2 text-[13px] text-muted">Add gadgets for sprint health, burndowns, saved filters and more.</p>
            <Button
              variant="primary"
              className="mt-5"
              icon={<Plus className="size-4" />}
              onClick={() => {
                setEditing(true)
                setAdding(true)
              }}
            >
              Add gadget
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 px-8 lg:grid-cols-2">
          {columns.map((col, c) => (
            <div key={c} className={cn('flex min-w-0 flex-col gap-4', editing && 'min-h-40 rounded-2xl')}>
              {col.map((g, k) => (
                <GadgetFrame key={g.id} dashboard={dashboard} g={g} editing={editing} isFirst={k === 0} isLast={k === col.length - 1} onConfigure={() => setConfiguring(g)} />
              ))}
              {editing && (
                <button
                  onClick={() => setAdding(true)}
                  className="grid h-24 place-items-center rounded-2xl border border-dashed border-line-strong text-[13px] text-muted transition hover:border-accent hover:text-accent"
                >
                  <span className="flex items-center gap-1.5">
                    <Plus className="size-4" /> Add gadget
                  </span>
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <AddGadgetModal open={adding} onClose={() => setAdding(false)} dashboard={dashboard} />
      <ConfigureGadgetModal open={!!configuring} onClose={() => setConfiguring(null)} dashboardId={dashboard.id} gadget={configuring} />
      <DashboardFormModal
        open={renaming}
        onClose={() => setRenaming(false)}
        initial={dashboard}
        title="Dashboard details"
        submitLabel="Save"
        onSubmit={(name, description) => updateDashboard(dashboard.id, { name, description })}
      />
      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        onConfirm={() => {
          deleteDashboard(dashboard.id)
          navigate('/dashboards')
          toast({ title: `Deleted “${dashboard.name}”` })
        }}
        title="Delete dashboard?"
      >
        “{dashboard.name}” and its gadgets will be permanently deleted.
      </ConfirmDialog>
    </div>
  )
}
