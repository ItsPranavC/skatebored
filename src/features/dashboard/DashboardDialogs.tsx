import { useEffect, useState } from 'react'
import type { Dashboard, Gadget, GadgetType } from '@/types'
import { useStore } from '@/store/store'
import { Modal, Select } from '@/components/ui/overlay'
import { Button, Field, Input, Textarea } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import { GADGETS, gadgetDef } from './gadgets'

export function DashboardFormModal({
  open,
  onClose,
  initial,
  title,
  submitLabel,
  onSubmit,
}: {
  open: boolean
  onClose: () => void
  initial?: Pick<Dashboard, 'name' | 'description'>
  title: string
  submitLabel: string
  onSubmit: (name: string, description: string) => void
}) {
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  useEffect(() => {
    if (open) {
      setName(initial?.name ?? '')
      setDesc(initial?.description ?? '')
    }
  }, [open, initial?.name, initial?.description])
  const submit = () => {
    if (!name.trim()) return
    onSubmit(name.trim(), desc.trim())
    onClose()
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width={480}
      footer={
        <>
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!name.trim()} onClick={submit}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Field label="Name" required>
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sprint war room" />
        </Field>
        <Field label="Description">
          <Textarea rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What is this dashboard for?" />
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}

function defaultConfig(type: GadgetType, projects: { id: string; starred: boolean; type: string }[], filters: { id: string }[]) {
  const def = gadgetDef(type)
  const cfg: Record<string, string> = {}
  if (def.needs.includes('project')) {
    const scrum = projects.find((p) => p.starred && p.type === 'scrum') ?? projects.find((p) => p.type === 'scrum') ?? projects[0]
    if (scrum) cfg.projectId = scrum.id
  }
  if (def.needs.includes('filter') && filters[0]) cfg.filterId = filters[0].id
  return cfg
}

export function AddGadgetModal({ open, onClose, dashboard }: { open: boolean; onClose: () => void; dashboard: Dashboard }) {
  const projects = useStore((s) => s.projects)
  const filters = useStore((s) => s.filters)
  const addGadget = useStore((s) => s.addGadget)
  const [added, setAdded] = useState<string[]>([])
  useEffect(() => {
    if (open) setAdded([])
  }, [open])
  const add = (type: GadgetType) => {
    const left = dashboard.gadgets.filter((g) => g.column === 0).length
    const right = dashboard.gadgets.length - left
    addGadget(dashboard.id, { type, title: gadgetDef(type).title, config: defaultConfig(type, projects, filters), column: left <= right ? 0 : 1 })
    setAdded((a) => [...a, type])
  }
  return (
    <Modal open={open} onClose={onClose} title="Add a gadget" width={720} footer={<Button onClick={onClose}>Done</Button>}>
      <p className="mb-4 text-[13px] text-muted">Gadgets are added to the shorter column. Configure them from each gadget’s ⋯ menu.</p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {GADGETS.map((g) => {
          const count = added.filter((a) => a === g.type).length
          return (
            <li key={g.type} className="flex items-start gap-3 rounded-xl border border-line bg-surface-2 p-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">{g.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold">{g.title}</div>
                <p className="mt-0.5 text-[12px] text-muted">{g.description}</p>
              </div>
              <Button size="xs" variant={count ? 'default' : 'primary'} className="px-2.5" onClick={() => add(g.type)}>
                {count ? `Added ×${count}` : 'Add'}
              </Button>
            </li>
          )
        })}
      </ul>
    </Modal>
  )
}

export function ConfigureGadgetModal({ open, onClose, dashboardId, gadget }: { open: boolean; onClose: () => void; dashboardId: string; gadget: Gadget | null }) {
  const projects = useStore((s) => s.projects)
  const filters = useStore((s) => s.filters)
  const updateGadget = useStore((s) => s.updateGadget)
  const [title, setTitle] = useState('')
  const [cfg, setCfg] = useState<Record<string, string>>({})
  useEffect(() => {
    if (open && gadget) {
      setTitle(gadget.title)
      setCfg(gadget.config)
    }
  }, [open, gadget])
  if (!gadget) return null
  const def = gadgetDef(gadget.type)
  const projectOptional = gadget.type === 'activity-stream'
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Configure “${gadget.title}”`}
      width={480}
      footer={
        <>
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              updateGadget(dashboardId, gadget.id, { title: title.trim() || def.title, config: cfg })
              onClose()
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        {(def.needs.includes('project') || projectOptional) && (
          <Field label="Project" required={!projectOptional}>
            <Select
              value={cfg.projectId ?? (projectOptional ? '__all' : null)}
              onChange={(v) => setCfg((c) => (v === '__all' ? Object.fromEntries(Object.entries(c).filter(([k]) => k !== 'projectId')) : { ...c, projectId: v }))}
              options={[
                ...(projectOptional ? [{ value: '__all', label: 'All projects' }] : []),
                ...projects.map((p) => ({ value: p.id, label: `${p.name} (${p.key})`, hint: p.type === 'scrum' ? 'Scrum' : 'Kanban' })),
              ]}
            />
          </Field>
        )}
        {def.needs.includes('filter') && (
          <Field label="Saved filter" required hint={filters.length ? undefined : 'Save a filter from issue search first.'}>
            <Select value={cfg.filterId ?? null} onChange={(v) => setCfg((c) => ({ ...c, filterId: v }))} options={filters.map((f) => ({ value: f.id, label: f.name }))} />
          </Field>
        )}
        {!def.needs.length && !projectOptional && <p className={cn('text-[13px] text-muted')}>This gadget has no other settings.</p>}
      </div>
    </Modal>
  )
}
