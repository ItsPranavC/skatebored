import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Pencil, Plus, Trash2, UserPlus, X } from 'lucide-react'
import { useStore } from '@/store/store'
import { toast } from '@/store/ui'
import { Avatar, IssueTypeIcon, UserPicker, useUserOptions } from '@/components/jira'
import { Modal, Popover, Select, SelectList } from '@/components/ui/overlay'
import { Button, Field, Input, Textarea, Toggle } from '@/components/ui/primitives'
import { PROJECT_ICONS } from '@/features/project/projectUtils'
import { cn, EPIC_COLORS, uid } from '@/lib/utils'
import type { Component, IssueType, Project } from '@/types'
import { useProjectFeatures, type ProjectFeatures } from './features'

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="display text-2xl">{title}</h2>
      {description && <p className="mt-1 mb-5 max-w-2xl text-sm text-muted">{description}</p>}
      {children}
    </div>
  )
}

// ───────────────────────────── Details ─────────────────────────────

export function DetailsTab({ project }: { project: Project }) {
  const updateProject = useStore((s) => s.updateProject)
  const deleteProject = useStore((s) => s.deleteProject)
  const navigate = useNavigate()
  const [form, setForm] = useState(project)
  const [confirm, setConfirm] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  useEffect(() => setForm(project), [project])
  const dirty = (['name', 'description', 'category', 'leadId', 'icon', 'color', 'estimation'] as const).some((k) => form[k] !== project[k])
  const set = <K extends keyof Project>(k: K, v: Project[K]) => setForm((f) => ({ ...f, [k]: v }))
  const save = () => {
    if (!form.name.trim()) return toast({ title: 'Name is required', tone: 'error' })
    updateProject(project.id, {
      name: form.name.trim(),
      description: form.description,
      category: form.category.trim() || 'Software',
      leadId: form.leadId,
      icon: form.icon,
      color: form.color,
      estimation: form.estimation,
      memberIds: project.memberIds.includes(form.leadId) ? project.memberIds : [...project.memberIds, form.leadId],
    })
    toast({ title: 'Project details saved', tone: 'success' })
  }
  return (
    <Section title="Details">
      <div className="max-w-xl space-y-4">
        <div className="flex items-center gap-4">
          <span className="grid size-16 place-items-center rounded-2xl text-3xl" style={{ background: `color-mix(in srgb, ${form.color} 28%, var(--surface-3))` }}>
            {form.icon}
          </span>
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1">
              {PROJECT_ICONS.map((i) => (
                <button key={i} onClick={() => set('icon', i)} className={cn('grid size-8 place-items-center rounded-md border text-base', form.icon === i ? 'border-accent bg-accent-soft' : 'border-line hover:bg-hover')} aria-label={`Icon ${i}`}>
                  {i}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1">
              {EPIC_COLORS.map((c) => (
                <button key={c} onClick={() => set('color', c)} className={cn('size-6 rounded-md', form.color === c && 'ring-2 ring-fg ring-offset-2 ring-offset-canvas')} style={{ background: c }} aria-label={`Colour ${c}`} />
              ))}
            </div>
          </div>
        </div>
        <Field label="Name" required>
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Key" hint="Keys can’t be changed once issues exist.">
          <Input value={project.key} readOnly disabled className="w-40 font-semibold opacity-70" />
        </Field>
        <Field label="Category">
          <Input value={form.category} onChange={(e) => set('category', e.target.value)} />
        </Field>
        <Field label="Description">
          <Textarea rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} />
        </Field>
        <Field label="Project lead">
          <div className="rounded-lg border border-line bg-surface-2 px-3 py-1">
            <UserPicker value={form.leadId} onChange={(id) => id && set('leadId', id)} allowUnassigned={false} />
          </div>
        </Field>
        <Field label="Board estimation" hint="Used for sprint commitment, burndown and velocity.">
          <Select
            value={form.estimation}
            onChange={(v) => set('estimation', v)}
            options={[
              { value: 'points', label: 'Story points' },
              { value: 'count', label: 'Issue count' },
            ]}
          />
        </Field>
        <div className="flex gap-2 pt-2">
          <Button variant="primary" onClick={save} disabled={!dirty}>
            Save details
          </Button>
          {dirty && (
            <Button variant="subtle" onClick={() => setForm(project)}>
              Discard
            </Button>
          )}
        </div>
      </div>

      <div className="mt-12 max-w-xl rounded-xl border border-accent/40 p-5">
        <h3 className="font-semibold text-accent">Danger zone</h3>
        <p className="mt-1 text-sm text-muted">Deleting a project removes all of its issues, sprints, comments and history. This can’t be undone.</p>
        <Button variant="danger" className="mt-3" icon={<Trash2 className="size-4" />} onClick={() => setDeleteOpen(true)}>
          Delete project
        </Button>
      </div>
      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={`Delete ${project.name}?`}
        width={480}
        footer={
          <>
            <Button variant="subtle" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={confirm !== project.key}
              onClick={() => {
                deleteProject(project.id)
                toast({ title: `${project.name} deleted` })
                navigate('/projects')
              }}
            >
              Delete permanently
            </Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-muted">
          Type <b className="text-fg">{project.key}</b> to confirm.
        </p>
        <Input autoFocus value={confirm} onChange={(e) => setConfirm(e.target.value.toUpperCase())} placeholder={project.key} />
      </Modal>
    </Section>
  )
}

// ───────────────────────────── Components ─────────────────────────────

export function ComponentsTab({ project }: { project: Project }) {
  const updateProject = useStore((s) => s.updateProject)
  const issues = useStore((s) => s.issues)
  const updateIssue = useStore((s) => s.updateIssue)
  const users = useStore((s) => s.users)
  const [editing, setEditing] = useState<Component | null | undefined>(undefined)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [lead, setLead] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const startEdit = (c: Component | null) => {
    setEditing(c)
    setName(c?.name ?? '')
    setDesc(c?.description ?? '')
    setLead(c?.leadId ?? null)
    setErr(null)
  }
  const save = () => {
    const n = name.trim()
    if (!n) return setErr('Name is required')
    if (project.components.some((c) => c.name.toLowerCase() === n.toLowerCase() && c.id !== editing?.id)) return setErr('Component already exists')
    const components = editing
      ? project.components.map((c) => (c.id === editing.id ? { ...c, name: n, description: desc, leadId: lead } : c))
      : [...project.components, { id: uid('cmp-'), name: n, description: desc, leadId: lead }]
    updateProject(project.id, { components })
    setEditing(undefined)
  }
  const remove = (c: Component) => {
    for (const i of issues.filter((x) => x.componentIds.includes(c.id))) updateIssue(i.id, { componentIds: i.componentIds.filter((x) => x !== c.id) })
    updateProject(project.id, { components: project.components.filter((x) => x.id !== c.id) })
    toast({ title: `Component ${c.name} deleted` })
  }
  return (
    <Section title="Components" description="Components are subsections of a project used to group issues — by feature, team or service.">
      <div className="mb-3 flex justify-end">
        <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => startEdit(null)}>
          Create component
        </Button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[640px] text-left text-[13px]">
          <thead className="bg-surface-2 text-xs text-muted">
            <tr>
              <th className="px-3 py-2.5 font-semibold">Component</th>
              <th className="px-3 py-2.5 font-semibold">Description</th>
              <th className="px-3 py-2.5 font-semibold">Lead</th>
              <th className="px-3 py-2.5 text-right font-semibold">Issues</th>
              <th className="w-20" />
            </tr>
          </thead>
          <tbody>
            {project.components.map((c) => {
              const u = users.find((x) => x.id === c.leadId)
              return (
                <tr key={c.id} className="border-t border-line hover:bg-hover">
                  <td className="px-3 py-2.5 font-medium">{c.name}</td>
                  <td className="px-3 py-2.5 text-muted">{c.description || '—'}</td>
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-2">
                      <Avatar user={u} size="xs" /> {u?.name ?? 'None'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{issues.filter((i) => i.componentIds.includes(c.id)).length}</td>
                  <td className="px-2 py-2.5">
                    <div className="flex justify-end gap-0.5">
                      <Button size="xs" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => startEdit(c)} aria-label="Edit" />
                      <Button size="xs" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={() => remove(c)} aria-label="Delete" />
                    </div>
                  </td>
                </tr>
              )
            })}
            {project.components.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted">
                  No components yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Modal
        open={editing !== undefined}
        onClose={() => setEditing(undefined)}
        title={editing ? 'Edit component' : 'Create component'}
        width={480}
        footer={
          <>
            <Button variant="subtle" onClick={() => setEditing(undefined)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save}>
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Name" required error={err}>
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
          </Field>
          <Field label="Description">
            <Textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} />
          </Field>
          <Field label="Component lead">
            <div className="rounded-lg border border-line bg-surface-2 px-3 py-1">
              <UserPicker value={lead} onChange={setLead} projectId={project.id} />
            </div>
          </Field>
        </div>
      </Modal>
    </Section>
  )
}

// ───────────────────────────── Access ─────────────────────────────

export function AccessTab({ project }: { project: Project }) {
  const users = useStore((s) => s.users)
  const updateProject = useStore((s) => s.updateProject)
  const allOptions = useUserOptions(undefined, false)
  const members = users.filter((u) => project.memberIds.includes(u.id))
  const candidates = allOptions.filter((o) => !project.memberIds.includes(o.value))
  return (
    <Section title="Access" description="People who can view and edit this team-managed project. The project lead is always an administrator.">
      <div className="mb-3 flex justify-end">
        <Popover width={280} placement="bottom-end" trigger={<Button variant="primary" icon={<UserPlus className="size-4" />}>Add people</Button>}>
          {(close) => (
            <SelectList
              options={candidates}
              value={null}
              placeholder="Search people…"
              emptyText="Everyone is already a member"
              onSelect={(id) => {
                updateProject(project.id, { memberIds: [...project.memberIds, id] })
                toast({ title: `${users.find((u) => u.id === id)?.name} added to ${project.key}`, tone: 'success' })
                close()
              }}
            />
          )}
        </Popover>
      </div>
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[600px] text-left text-[13px]">
          <thead className="bg-surface-2 text-xs text-muted">
            <tr>
              <th className="px-3 py-2.5 font-semibold">Name</th>
              <th className="px-3 py-2.5 font-semibold">Email</th>
              <th className="px-3 py-2.5 font-semibold">Role</th>
              <th className="w-12" />
            </tr>
          </thead>
          <tbody>
            {members.map((u) => (
              <tr key={u.id} className="border-t border-line hover:bg-hover">
                <td className="px-3 py-2.5">
                  <span className="flex items-center gap-2.5">
                    <Avatar user={u} size="sm" />
                    <span>
                      <span className="block font-medium">{u.name}</span>
                      <span className="block text-[11px] text-subtle">{u.title}</span>
                    </span>
                  </span>
                </td>
                <td className="px-3 py-2.5 text-muted">{u.email}</td>
                <td className="px-3 py-2.5">{u.id === project.leadId ? <span className="font-semibold text-accent">Administrator</span> : 'Member'}</td>
                <td className="px-2 py-2.5">
                  {u.id !== project.leadId && (
                    <Button size="xs" variant="ghost" icon={<X className="size-3.5" />} aria-label={`Remove ${u.name}`} onClick={() => updateProject(project.id, { memberIds: project.memberIds.filter((x) => x !== u.id) })} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  )
}

// ───────────────────────────── Issue types ─────────────────────────────

const TYPE_DESC: Record<IssueType, string> = {
  epic: 'A large body of work that can be broken down into tasks and bugs.',
  task: 'A piece of work that needs to be done.',
  bug: 'A problem that impairs or prevents the functions of the product.',
  subtask: 'A smaller piece of work that’s part of a larger issue.',
}

export function IssueTypesTab({ project }: { project: Project }) {
  const issues = useStore((s) => s.issues)
  return (
    <Section title="Issue types" description="Issue types available in this project. Each type shares the project workflow.">
      <div className="max-w-2xl divide-y divide-line rounded-xl border border-line">
        {(Object.keys(TYPE_DESC) as IssueType[]).map((t) => (
          <div key={t} className="flex items-start gap-3 p-4">
            <IssueTypeIcon type={t} className="mt-0.5 size-5" />
            <div className="flex-1">
              <div className="font-semibold capitalize">{t === 'subtask' ? 'Sub-task' : t}</div>
              <div className="text-[13px] text-muted">{TYPE_DESC[t]}</div>
            </div>
            <span className="text-[12px] text-subtle tabular-nums">{issues.filter((i) => i.projectId === project.id && i.type === t).length} issues</span>
          </div>
        ))}
      </div>
    </Section>
  )
}

// ───────────────────────────── Features ─────────────────────────────

const FEATURES: { id: keyof ProjectFeatures; label: string; desc: string; scrumOnly?: boolean }[] = [
  { id: 'sprints', label: 'Backlog & sprints', desc: 'Plan work in time-boxed sprints from a prioritised backlog.', scrumOnly: true },
  { id: 'timeline', label: 'Timeline', desc: 'Plan and track epics on a roadmap.' },
  { id: 'reports', label: 'Reports', desc: 'Burndown, velocity, cumulative flow and more.' },
  { id: 'estimation', label: 'Estimation', desc: 'Show story points on cards and in the backlog.' },
  { id: 'releases', label: 'Releases', desc: 'Group issues into versions and ship them.' },
]

export function FeaturesTab({ project }: { project: Project }) {
  const [features, setFeature] = useProjectFeatures(project.id)
  return (
    <Section title="Features" description="Turn features on or off to fit how your team works.">
      <div className="grid max-w-3xl gap-3 sm:grid-cols-2">
        {FEATURES.filter((f) => !f.scrumOnly || project.type === 'scrum').map((f) => (
          <div key={f.id} className="flex items-start justify-between gap-4 rounded-xl border border-line bg-surface p-4">
            <div>
              <div className="font-semibold">{f.label}</div>
              <div className="mt-0.5 text-[13px] text-muted">{f.desc}</div>
            </div>
            <Toggle checked={features[f.id]} onChange={(v) => setFeature(f.id, v)} />
          </div>
        ))}
      </div>
    </Section>
  )
}
