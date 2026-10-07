import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, Archive, MoreHorizontal, Pencil, Plus, Rocket, Search, Trash2, Undo2 } from 'lucide-react'
import { isBefore, startOfDay } from 'date-fns'
import { useProjectByKey, useStore } from '@/store/store'
import { toast } from '@/store/ui'
import { Avatar, IssueTypeIcon, PriorityIcon, StatusLozenge, useIssueModal } from '@/components/jira'
import { ConfirmDialog, Menu, Modal, Select } from '@/components/ui/overlay'
import { Button, EmptyState, Field, Input, PageHeader, ProgressBar, Textarea, Checkbox } from '@/components/ui/primitives'
import { cn, fmtDate, toDate, uid } from '@/lib/utils'
import type { Issue, Project, Version } from '@/types'

function versionStats(project: Project, issues: Issue[], v: Version) {
  const list = issues.filter((i) => i.fixVersionIds.includes(v.id))
  const cat = (i: Issue) => project.statuses.find((s) => s.id === i.statusId)?.category ?? 'todo'
  return {
    list,
    todo: list.filter((i) => cat(i) === 'todo').length,
    prog: list.filter((i) => cat(i) === 'inprogress').length,
    done: list.filter((i) => cat(i) === 'done').length,
  }
}

function VersionLozenge({ v }: { v: Version }) {
  const label = v.archived ? 'Archived' : v.released ? 'Released' : 'Unreleased'
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center rounded px-1.5 text-[11px] font-bold tracking-wide uppercase',
        v.archived ? 'bg-surface-3 text-subtle' : v.released ? 'bg-done text-done-fg' : 'bg-progress text-progress-fg',
      )}
    >
      {label}
    </span>
  )
}

const isOverdue = (v: Version) => !v.released && !!v.releaseDate && isBefore(new Date(v.releaseDate), startOfDay(new Date()))
const dateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : '')
const fromInput = (s: string) => (s ? new Date(`${s}T00:00:00`).toISOString() : null)

function VersionModal({ open, onClose, project, version }: { open: boolean; onClose: () => void; project: Project; version: Version | null }) {
  const updateProject = useStore((s) => s.updateProject)
  const [name, setName] = useState('')
  const [start, setStart] = useState('')
  const [release, setRelease] = useState('')
  const [desc, setDesc] = useState('')
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    if (open) {
      setName(version?.name ?? '')
      setStart(dateInput(version?.startDate ?? null))
      setRelease(dateInput(version?.releaseDate ?? null))
      setDesc(version?.description ?? '')
      setErr(null)
    }
  }, [open, version])
  const save = () => {
    const n = name.trim()
    if (!n) return setErr('Name is required')
    if (project.versions.some((v) => v.name.toLowerCase() === n.toLowerCase() && v.id !== version?.id)) return setErr('A version with this name already exists')
    if (start && release && release < start) return setErr('Release date must be after start date')
    const patch = { name: n, startDate: fromInput(start), releaseDate: fromInput(release), description: desc }
    const versions = version
      ? project.versions.map((v) => (v.id === version.id ? { ...v, ...patch } : v))
      : [...project.versions, { id: uid('v-'), released: false, archived: false, ...patch }]
    updateProject(project.id, { versions })
    toast({ title: version ? 'Version updated' : `Version ${n} created`, tone: 'success' })
    onClose()
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={version ? 'Edit version' : 'Create version'}
      width={520}
      footer={
        <>
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save}>
            {version ? 'Save' : 'Create'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Version name" required error={err}>
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. v1.0 Launch" onKeyDown={(e) => e.key === 'Enter' && save()} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start date">
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Release date">
            <Input type="date" value={release} onChange={(e) => setRelease(e.target.value)} />
          </Field>
        </div>
        <Field label="Description">
          <Textarea rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

function ReleaseModal({ open, onClose, project, version }: { open: boolean; onClose: () => void; project: Project; version: Version | null }) {
  const issues = useStore((s) => s.issues)
  const updateProject = useStore((s) => s.updateProject)
  const updateIssue = useStore((s) => s.updateIssue)
  const [mode, setMode] = useState<'ignore' | 'move'>('move')
  const [target, setTarget] = useState<string | null>(null)
  const [date, setDate] = useState('')
  const others = project.versions.filter((v) => v.id !== version?.id && !v.released && !v.archived)
  useEffect(() => {
    if (open) {
      setDate(new Date().toISOString().slice(0, 10))
      setTarget(others[0]?.id ?? null)
      setMode(others.length ? 'move' : 'ignore')
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!version) return null
  const stats = versionStats(project, issues, version)
  const unresolved = stats.list.filter((i) => project.statuses.find((s) => s.id === i.statusId)?.category !== 'done')
  const doRelease = () => {
    if (unresolved.length && mode === 'move' && target) {
      for (const i of unresolved) updateIssue(i.id, { fixVersionIds: [...i.fixVersionIds.filter((x) => x !== version.id), target] })
    }
    updateProject(project.id, { versions: project.versions.map((v) => (v.id === version.id ? { ...v, released: true, releaseDate: fromInput(date) } : v)) })
    toast({ title: `${version.name} released 🛹`, description: `${stats.done} issues shipped.`, tone: 'success' })
    onClose()
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Release ${version.name}`}
      width={520}
      footer={
        <>
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" icon={<Rocket className="size-4" />} onClick={doRelease} disabled={mode === 'move' && unresolved.length > 0 && !target}>
            Release
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Release date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-48" />
        </Field>
        {unresolved.length > 0 ? (
          <div className="rounded-xl border border-warn/40 bg-warn/10 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-warn">
              <AlertTriangle className="size-4" /> This version still has {unresolved.length} unresolved issue{unresolved.length > 1 && 's'}.
            </div>
            <div className="mt-3 space-y-2 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" checked={mode === 'ignore'} onChange={() => setMode('ignore')} className="accent-[var(--accent)]" /> Ignore and proceed with the release
              </label>
              <label className={cn('flex items-center gap-2', !others.length && 'opacity-50')}>
                <input type="radio" disabled={!others.length} checked={mode === 'move'} onChange={() => setMode('move')} className="accent-[var(--accent)]" /> Move issues to version
              </label>
              {mode === 'move' && others.length > 0 && (
                <div className="pl-6">
                  <Select value={target} onChange={setTarget} options={others.map((v) => ({ value: v.id, label: v.name }))} className="w-60" />
                </div>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted">All {stats.list.length} issues in this version are done. Nice — ship it.</p>
        )}
      </div>
    </Modal>
  )
}

function useVersionActions(project: Project) {
  const updateProject = useStore((s) => s.updateProject)
  const issues = useStore((s) => s.issues)
  const updateIssue = useStore((s) => s.updateIssue)
  const patch = (id: string, p: Partial<Version>) => updateProject(project.id, { versions: project.versions.map((v) => (v.id === id ? { ...v, ...p } : v)) })
  const remove = (id: string) => {
    for (const i of issues.filter((x) => x.fixVersionIds.includes(id))) updateIssue(i.id, { fixVersionIds: i.fixVersionIds.filter((x) => x !== id) })
    updateProject(project.id, { versions: project.versions.filter((v) => v.id !== id) })
  }
  return { patch, remove }
}

function VersionMenu({ project, v, onEdit, onRelease, onDelete }: { project: Project; v: Version; onEdit: () => void; onRelease: () => void; onDelete: () => void }) {
  const { patch } = useVersionActions(project)
  return (
    <Menu
      trigger={<Button variant="ghost" size="sm" icon={<MoreHorizontal className="size-4" />} aria-label="Version actions" />}
      items={[
        { label: 'Edit', icon: <Pencil className="size-4" />, onClick: onEdit },
        v.released
          ? { label: 'Unrelease', icon: <Undo2 className="size-4" />, onClick: () => patch(v.id, { released: false }) }
          : { label: 'Release', icon: <Rocket className="size-4" />, onClick: onRelease, disabled: v.archived },
        v.archived
          ? { label: 'Unarchive', icon: <Archive className="size-4" />, onClick: () => patch(v.id, { archived: false }) }
          : { label: 'Archive', icon: <Archive className="size-4" />, onClick: () => patch(v.id, { archived: true }) },
        { divider: true, label: '' },
        { label: 'Delete', icon: <Trash2 className="size-4" />, danger: true, onClick: onDelete },
      ]}
    />
  )
}

function VersionDetail({ project, version, onEdit, onRelease, onDelete }: { project: Project; version: Version; onEdit: () => void; onRelease: () => void; onDelete: () => void }) {
  const issues = useStore((s) => s.issues)
  const users = useStore((s) => s.users)
  const { open } = useIssueModal()
  const stats = versionStats(project, issues, version)
  const unresolved = stats.todo + stats.prog
  const pct = stats.list.length ? Math.round((stats.done / stats.list.length) * 100) : 0
  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader
        breadcrumbs={
          <>
            <Link to={`/projects/${project.key}/releases`} className="flex items-center gap-1 hover:text-fg">
              <ArrowLeft className="size-3.5" /> Releases
            </Link>
          </>
        }
        title={
          <span className="flex items-center gap-3">
            {version.name} <VersionLozenge v={version} />
          </span>
        }
        actions={
          <>
            {!version.released && !version.archived && (
              <Button variant="primary" icon={<Rocket className="size-4" />} onClick={onRelease}>
                Release
              </Button>
            )}
            <VersionMenu project={project} v={version} onEdit={onEdit} onRelease={onRelease} onDelete={onDelete} />
          </>
        }
      >
        <div className="flex flex-wrap gap-6 text-[13px] text-muted">
          <span>
            Start: <b className="text-fg">{fmtDate(version.startDate) || '—'}</b>
          </span>
          <span>
            Release: <b className={cn(isOverdue(version) ? 'text-accent' : 'text-fg')}>{fmtDate(version.releaseDate) || '—'}</b>
            {isOverdue(version) && ' · overdue'}
          </span>
        </div>
        {version.description && <p className="mt-2 max-w-2xl text-sm text-muted">{version.description}</p>}
      </PageHeader>
      <div className="space-y-5 px-8 pb-10">
        <div className="grid gap-3 sm:grid-cols-4">
          {[
            ['Issues in version', stats.list.length, 'text-fg'],
            ['To do', stats.todo, 'text-todo-fg'],
            ['In progress', stats.prog, 'text-progress-fg'],
            ['Done', stats.done, 'text-done-fg'],
          ].map(([l, n, c]) => (
            <div key={l as string} className="rounded-xl border border-line bg-surface p-4">
              <div className="text-xs text-muted">{l}</div>
              <div className={cn('display mt-1 text-3xl', c as string)}>{n}</div>
            </div>
          ))}
        </div>
        <div>
          <div className="mb-1.5 flex justify-between text-xs text-muted">
            <span>Progress</span>
            <span>{pct}% done</span>
          </div>
          <ProgressBar
            className="h-2.5"
            segments={[
              { value: stats.done, color: 'var(--success)', label: 'Done' },
              { value: stats.prog, color: 'var(--info)', label: 'In progress' },
              { value: stats.todo, color: 'var(--line-strong)', label: 'To do' },
            ]}
          />
        </div>
        {unresolved > 0 && (version.released || isOverdue(version)) && (
          <div className="flex items-center gap-2 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
            <AlertTriangle className="size-4" /> {unresolved} issue{unresolved > 1 && 's'} in this version {unresolved > 1 ? 'are' : 'is'} still unresolved.
          </div>
        )}
        {stats.list.length === 0 ? (
          <EmptyState title="No issues in this version">Set the Fix version field on an issue to add it here.</EmptyState>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[720px] text-left text-[13px]">
              <thead className="bg-surface-2 text-xs text-muted">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">Type</th>
                  <th className="px-3 py-2.5 font-semibold">Key</th>
                  <th className="px-3 py-2.5 font-semibold">Summary</th>
                  <th className="px-3 py-2.5 font-semibold">Priority</th>
                  <th className="px-3 py-2.5 font-semibold">Assignee</th>
                  <th className="px-3 py-2.5 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {stats.list
                  .sort((a, b) => a.rank - b.rank)
                  .map((i) => (
                    <tr key={i.id} onClick={() => open(i.key)} className="cursor-pointer border-t border-line hover:bg-hover">
                      <td className="px-3 py-2">
                        <IssueTypeIcon type={i.type} />
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted">{i.key}</td>
                      <td className="px-3 py-2">{i.summary}</td>
                      <td className="px-3 py-2">
                        <PriorityIcon priority={i.priority} />
                      </td>
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-2">
                          <Avatar user={users.find((u) => u.id === i.assigneeId)} size="xs" />
                          <span className="truncate">{users.find((u) => u.id === i.assigneeId)?.name ?? 'Unassigned'}</span>
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <StatusLozenge status={project.statuses.find((s) => s.id === i.statusId)} />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default function ReleasesPage() {
  const { projectKey, versionId } = useParams()
  const navigate = useNavigate()
  const project = useProjectByKey(projectKey)!
  const issues = useStore((s) => s.issues)
  const { remove } = useVersionActions(project)
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState<'active' | 'unreleased' | 'released' | 'archived' | 'all'>('active')
  const [editing, setEditing] = useState<Version | null | undefined>(undefined)
  const [releasing, setReleasing] = useState<Version | null>(null)
  const [deleting, setDeleting] = useState<Version | null>(null)
  const [showDescriptions, setShowDescriptions] = useState(true)

  const modals = (
    <>
      <VersionModal open={editing !== undefined} onClose={() => setEditing(undefined)} project={project} version={editing ?? null} />
      <ReleaseModal open={!!releasing} onClose={() => setReleasing(null)} project={project} version={releasing} />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        onConfirm={() => {
          if (!deleting) return
          remove(deleting.id)
          toast({ title: `${deleting.name} deleted` })
          if (versionId) navigate(`/projects/${project.key}/releases`)
        }}
      >
        Issues in this version will have it removed from their Fix version field.
      </ConfirmDialog>
    </>
  )

  if (versionId) {
    const version = project.versions.find((v) => v.id === versionId)
    if (!version) return <EmptyState title="Version not found" action={<Button onClick={() => navigate(`/projects/${project.key}/releases`)}>Back to releases</Button>} />
    return (
      <>
        <VersionDetail project={project} version={version} onEdit={() => setEditing(version)} onRelease={() => setReleasing(version)} onDelete={() => setDeleting(version)} />
        {modals}
      </>
    )
  }

  const rows = project.versions
    .filter((v) => {
      if (statusFilter === 'active') return !v.archived
      if (statusFilter === 'unreleased') return !v.released && !v.archived
      if (statusFilter === 'released') return v.released && !v.archived
      if (statusFilter === 'archived') return v.archived
      return true
    })
    .filter((v) => !q || v.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (toDate(b.releaseDate)?.getTime() ?? Infinity) - (toDate(a.releaseDate)?.getTime() ?? Infinity))

  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader
        breadcrumbs={
          <>
            <span>Projects</span>/<span>{project.name}</span>
          </>
        }
        title="Releases"
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing(null)}>
            Create version
          </Button>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-56">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search versions" className="h-8 pl-9" />
          </div>
          <Select
            className="h-8 w-48"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: 'active', label: 'Released & unreleased' },
              { value: 'unreleased', label: 'Unreleased' },
              { value: 'released', label: 'Released' },
              { value: 'archived', label: 'Archived' },
              { value: 'all', label: 'All' },
            ]}
          />
          <Checkbox checked={showDescriptions} onChange={setShowDescriptions} label={<span className="text-[13px] text-muted">Show descriptions</span>} className="ml-2" />
        </div>
      </PageHeader>
      <div className="px-8 pb-10">
        {rows.length === 0 ? (
          <EmptyState
            icon="📦"
            title={project.versions.length ? 'No versions match' : 'Version your releases'}
            action={
              <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing(null)}>
                Create version
              </Button>
            }
          >
            Versions group issues into releases so you can track what ships and when.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[860px] text-left text-[13px]">
              <thead className="bg-surface-2 text-xs text-muted">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">Version</th>
                  <th className="px-3 py-2.5 font-semibold">Status</th>
                  <th className="w-[220px] px-3 py-2.5 font-semibold">Progress</th>
                  <th className="px-3 py-2.5 font-semibold">Start date</th>
                  <th className="px-3 py-2.5 font-semibold">Release date</th>
                  {showDescriptions && <th className="px-3 py-2.5 font-semibold">Description</th>}
                  <th className="w-12 px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map((v) => {
                  const s = versionStats(project, issues, v)
                  return (
                    <tr key={v.id} className="border-t border-line hover:bg-hover">
                      <td className="px-3 py-3">
                        <Link to={`/projects/${project.key}/releases/${v.id}`} className="font-semibold hover:text-accent hover:underline">
                          {v.name}
                        </Link>
                      </td>
                      <td className="px-3 py-3">
                        <VersionLozenge v={v} />
                      </td>
                      <td className="px-3 py-3">
                        <ProgressBar
                          segments={[
                            { value: s.done, color: 'var(--success)', label: 'Done' },
                            { value: s.prog, color: 'var(--info)', label: 'In progress' },
                            { value: s.todo, color: 'var(--line-strong)', label: 'To do' },
                          ]}
                        />
                        <div className="mt-1 text-[11px] text-subtle">
                          {s.done} of {s.list.length} issues done
                        </div>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-muted">{fmtDate(v.startDate) || '—'}</td>
                      <td className={cn('px-3 py-3 whitespace-nowrap', isOverdue(v) ? 'font-semibold text-accent' : 'text-muted')}>
                        {fmtDate(v.releaseDate) || '—'}
                        {isOverdue(v) && <div className="text-[11px] font-normal">Overdue</div>}
                      </td>
                      {showDescriptions && <td className="max-w-[260px] truncate px-3 py-3 text-muted">{v.description}</td>}
                      <td className="px-3 py-3">
                        <VersionMenu project={project} v={v} onEdit={() => setEditing(v)} onRelease={() => setReleasing(v)} onDelete={() => setDeleting(v)} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {modals}
    </div>
  )
}
