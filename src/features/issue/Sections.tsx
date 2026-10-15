import { useState, type ReactNode } from 'react'
import { Download, FileText, Plus, Trash2, X } from 'lucide-react'
import type { Attachment, Issue, IssueType, LinkType, Project } from '@/types'
import { useStore } from '@/store/store'
import { toast } from '@/store/ui'
import { Avatar, IssueTypeIcon, PriorityIcon, StatusPicker, useIssueModal } from '@/components/jira'
import { Popover, Select, SelectList, ConfirmDialog } from '@/components/ui/overlay'
import { Button, ProgressBar, Spinner } from '@/components/ui/primitives'
import { MAX_ATTACHMENT_BYTES, uploadAttachment, useAttachmentUrl } from '@/sync/files'
import { cn, fmtDate } from '@/lib/utils'
import { RichText } from './RichText'
import { MentionTextarea } from './editors'

export function SectionTitle({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h3 className="text-[15px] font-semibold tracking-[-0.01em]">{children}</h3>
      {actions && <div className="flex items-center gap-1">{actions}</div>}
    </div>
  )
}

// ───────────────────────────── Description ─────────────────────────────

export function Description({ issue }: { issue: Issue }) {
  const update = useStore((s) => s.updateIssue)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(issue.description)
  const save = () => {
    update(issue.id, { description: draft.trim() })
    setEditing(false)
  }
  return (
    <section>
      <SectionTitle>Description</SectionTitle>
      {editing ? (
        <div>
          <MentionTextarea
            autoFocus
            rows={8}
            value={draft}
            onChange={setDraft}
            onSubmit={save}
            onCancel={() => {
              setDraft(issue.description)
              setEditing(false)
            }}
            placeholder="Describe the work. Supports **bold**, `code`, - bullets, 1. lists, # headings, links and @mentions."
          />
          <div className="mt-2 flex items-center gap-2">
            <Button variant="primary" onClick={save}>
              Save
            </Button>
            <Button
              variant="subtle"
              onClick={() => {
                setDraft(issue.description)
                setEditing(false)
              }}
            >
              Cancel
            </Button>
            <span className="ml-auto text-[11px] text-subtle">**bold** · `code` · - list · # heading · @mention</span>
          </div>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('a,button')) return
            setDraft(issue.description)
            setEditing(true)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              setDraft(issue.description)
              setEditing(true)
            }
          }}
          className="-mx-2 cursor-text rounded-lg px-2 py-1.5 transition hover:bg-hover"
        >
          {issue.description ? <RichText text={issue.description} /> : <p className="text-sm text-subtle">{issue.type !== 'epic' && !issue.track ? 'Add expected outcome…' : 'Add a description…'}</p>}
        </div>
      )}
    </section>
  )
}

// ───────────────────────────── Attachments ─────────────────────────────

export function readFilesAsAttachments(issue: Issue, files: FileList | null) {
  if (!files) return
  const add = useStore.getState().addAttachment
  for (const file of Array.from(files)) {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      toast({ title: `${file.name} is too large`, description: 'Attachments can be up to 4 MB.', tone: 'error' })
      continue
    }
    toast({ title: `Uploading ${file.name}…` })
    uploadAttachment(file)
      .then((url) => {
        add(issue.id, { name: file.name, size: file.size, mime: file.type || 'application/octet-stream', url })
        toast({ title: `Attached ${file.name}`, tone: 'success' })
      })
      .catch((e: Error) => toast({ title: `Couldn’t upload ${file.name}`, description: e.message, tone: 'error' }))
  }
}

function AttachmentCard({ a, onDelete }: { a: Attachment; onDelete: () => void }) {
  const { src, failed } = useAttachmentUrl(a.url)
  return (
    <div className="group relative overflow-hidden rounded-lg border border-line bg-surface-2">
      <a href={src ?? undefined} download={a.name} className="block" aria-disabled={!src}>
        {a.mime.startsWith('image/') && src ? (
          <img src={src} alt={a.name} className="h-24 w-full object-cover" />
        ) : (
          <div className="grid h-24 place-items-center bg-surface-3">
            {!src && !failed ? <Spinner /> : <FileText className={cn('size-8', failed ? 'text-accent' : 'text-subtle')} />}
          </div>
        )}
        <div className="px-2 py-1.5">
          <div className="truncate text-[12px] font-medium">{a.name}</div>
          <div className="text-[11px] text-subtle">
            {failed ? 'Couldn’t load' : `${fmtSize(a.size)} · ${fmtDate(a.createdAt, 'd MMM')}`}
          </div>
        </div>
      </a>
      <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 transition group-hover:opacity-100">
        {src && (
          <a href={src} download={a.name} className="grid size-6 place-items-center rounded-md bg-canvas/80 text-fg hover:bg-canvas" aria-label="Download">
            <Download className="size-3.5" />
          </a>
        )}
        <button onClick={onDelete} className="grid size-6 place-items-center rounded-md bg-canvas/80 text-fg hover:text-accent" aria-label="Delete attachment">
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </div>
  )
}

const fmtSize = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : n > 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`)

export function Attachments({ issue, onAttach }: { issue: Issue; onAttach: () => void }) {
  const remove = useStore((s) => s.removeAttachment)
  const [doomed, setDoomed] = useState<string | null>(null)
  if (!issue.attachments.length) return null
  return (
    <section>
      <SectionTitle
        actions={
          <Button variant="ghost" size="xs" icon={<Plus className="size-3.5" />} onClick={onAttach} aria-label="Add attachment" />
        }
      >
        Attachments <span className="ml-1 text-[13px] font-normal text-subtle">{issue.attachments.length}</span>
      </SectionTitle>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
        {issue.attachments.map((a) => (
          <AttachmentCard key={a.id} a={a} onDelete={() => setDoomed(a.id)} />
        ))}
      </div>
      <ConfirmDialog open={!!doomed} onClose={() => setDoomed(null)} onConfirm={() => doomed && remove(issue.id, doomed)} title="Delete this attachment?">
        The file will be removed from this issue.
      </ConfirmDialog>
    </section>
  )
}

// ───────────────────────────── Child issues ─────────────────────────────

function IssueRow({ issue, project, onRemove, extra }: { issue: Issue; project: Project; onRemove?: () => void; extra?: ReactNode }) {
  const { open } = useIssueModal()
  const assignee = useStore((s) => s.users.find((u) => u.id === issue.assigneeId))
  const status = project.statuses.find((s) => s.id === issue.statusId)
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => open(issue.key)}
      onKeyDown={(e) => e.key === 'Enter' && open(issue.key)}
      className="group flex h-10 cursor-pointer items-center gap-2.5 border-b border-line px-3 text-[13px] last:border-b-0 hover:bg-hover"
    >
      <IssueTypeIcon type={issue.type} />
      <span className={cn('shrink-0 font-medium text-muted', status?.category === 'done' && 'line-through')}>{issue.key}</span>
      <span className="min-w-0 flex-1 truncate">{issue.summary}</span>
      {extra}
      <PriorityIcon priority={issue.priority} />
      <Avatar user={assignee} size="xs" />
      <span onClick={(e) => e.stopPropagation()}>
        <StatusPicker issue={issue} project={project} size="sm" />
      </span>
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="grid size-6 place-items-center rounded text-subtle opacity-0 transition group-hover:opacity-100 hover:bg-active hover:text-accent"
          aria-label="Remove"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  )
}

export function ChildIssues({ issue, project, creating, setCreating }: { issue: Issue; project: Project; creating: boolean; setCreating: (v: boolean) => void }) {
  const issues = useStore((s) => s.issues)
  const createIssue = useStore((s) => s.createIssue)
  const isEpic = issue.type === 'epic'
  const children = issues.filter((i) => (isEpic ? i.epicId === issue.id && i.type !== 'subtask' : i.parentId === issue.id)).sort((a, b) => a.rank - b.rank)
  const [summary, setSummary] = useState('')
  const [type, setType] = useState<IssueType>(isEpic ? 'task' : 'subtask')
  if (issue.type === 'subtask') return null
  if (!children.length && !creating) return null
  const done = children.filter((c) => project.statuses.find((s) => s.id === c.statusId)?.category === 'done').length
  const prog = children.filter((c) => project.statuses.find((s) => s.id === c.statusId)?.category === 'inprogress').length

  const submit = () => {
    if (!summary.trim()) return
    createIssue({ projectId: project.id, type, summary: summary.trim(), ...(isEpic ? { epicId: issue.id } : { parentId: issue.id }) })
    setSummary('')
  }

  return (
    <section>
      <SectionTitle actions={<Button variant="ghost" size="xs" icon={<Plus className="size-3.5" />} onClick={() => setCreating(true)} aria-label="Create child issue" />}>
        {isEpic ? 'Child issues' : 'Sub-tasks'}
      </SectionTitle>
      {children.length > 0 && (
        <div className="mb-2 flex items-center gap-3">
          <ProgressBar
            className="flex-1"
            segments={[
              { value: done, color: 'var(--success)', label: 'Done' },
              { value: prog, color: 'var(--info)', label: 'In progress' },
              { value: children.length - done - prog, color: 'transparent', label: 'To do' },
            ]}
          />
          <span className="text-[12px] whitespace-nowrap text-muted">{Math.round((done / children.length) * 100)}% done</span>
        </div>
      )}
      <div className="overflow-hidden rounded-lg border border-line">
        {children.map((c) => (
          <IssueRow key={c.id} issue={c} project={project} />
        ))}
        {creating && (
          <div className="flex items-center gap-2 bg-surface-2 p-2">
            {isEpic ? (
              <Select<IssueType>
                value={type}
                onChange={setType}
                width={160}
                className="h-8 w-auto"
                options={(['task', 'bug'] as IssueType[]).map((t) => ({ value: t, label: t[0]!.toUpperCase() + t.slice(1), icon: <IssueTypeIcon type={t} /> }))}
                renderValue={(o) => (
                  <>
                    {o?.icon}
                  </>
                )}
              />
            ) : (
              <IssueTypeIcon type="subtask" className="mx-2" />
            )}
            <input
              autoFocus
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit()
                if (e.key === 'Escape') {
                  e.preventDefault()
                  setCreating(false)
                  setSummary('')
                }
              }}
              placeholder="What needs to be done?"
              className="h-8 flex-1 rounded-md border border-accent bg-surface px-2 text-[13px] ring-2 ring-accent-soft outline-none"
            />
            <Button variant="primary" onClick={submit} disabled={!summary.trim()}>
              Create
            </Button>
            <Button
              variant="subtle"
              onClick={() => {
                setCreating(false)
                setSummary('')
              }}
            >
              Cancel
            </Button>
          </div>
        )}
      </div>
    </section>
  )
}

// ───────────────────────────── Linked issues ─────────────────────────────

const LINK_TYPES: LinkType[] = ['blocks', 'is blocked by', 'relates to', 'duplicates', 'is duplicated by', 'clones', 'is cloned by']

export function LinkedIssues({ issue, adding, setAdding }: { issue: Issue; adding: boolean; setAdding: (v: boolean) => void }) {
  const issues = useStore((s) => s.issues)
  const projects = useStore((s) => s.projects)
  const addLink = useStore((s) => s.addLink)
  const removeLink = useStore((s) => s.removeLink)
  const [type, setType] = useState<LinkType>('relates to')
  const [target, setTarget] = useState<string | null>(null)
  const [pickOpen, setPickOpen] = useState(false)
  if (!issue.links.length && !adding) return null
  const groups = LINK_TYPES.map((t) => ({ t, links: issue.links.filter((l) => l.type === t) })).filter((g) => g.links.length)
  const targetIssue = issues.find((i) => i.id === target)
  const candidates = issues
    .filter((i) => i.id !== issue.id && !issue.links.some((l) => l.issueId === i.id && l.type === type))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((i) => ({ value: i.id, label: `${i.key} ${i.summary}`, icon: <IssueTypeIcon type={i.type} /> }))

  return (
    <section>
      <SectionTitle actions={<Button variant="ghost" size="xs" icon={<Plus className="size-3.5" />} onClick={() => setAdding(true)} aria-label="Link issue" />}>Linked issues</SectionTitle>
      <div className="space-y-3">
        {groups.map((g) => (
          <div key={g.t}>
            <div className="mb-1 text-[12px] font-semibold text-muted">{g.t}</div>
            <div className="overflow-hidden rounded-lg border border-line">
              {g.links.map((l) => {
                const other = issues.find((i) => i.id === l.issueId)
                const p = projects.find((x) => x.id === other?.projectId)
                if (!other || !p) return null
                return <IssueRow key={l.id} issue={other} project={p} onRemove={() => removeLink(issue.id, l.id)} />
              })}
            </div>
          </div>
        ))}
        {adding && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface-2 p-2">
            <Select<LinkType> value={type} onChange={setType} width={200} className="h-8 w-40" options={LINK_TYPES.map((t) => ({ value: t, label: t }))} />
            <Popover
              open={pickOpen}
              onOpenChange={setPickOpen}
              width={420}
              trigger={
                <button className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-surface px-2 text-left text-[13px] hover:bg-surface-3">
                  {targetIssue ? (
                    <>
                      <IssueTypeIcon type={targetIssue.type} />
                      <span className="truncate">
                        {targetIssue.key} {targetIssue.summary}
                      </span>
                    </>
                  ) : (
                    <span className="text-subtle">Search for issues…</span>
                  )}
                </button>
              }
            >
              <SelectList
                options={candidates}
                value={target}
                placeholder="Search by key or summary…"
                onSelect={(v) => {
                  setTarget(v)
                  setPickOpen(false)
                }}
              />
            </Popover>
            <Button
              variant="primary"
              disabled={!target}
              onClick={() => {
                if (!target) return
                addLink(issue.id, type, target)
                setTarget(null)
                setAdding(false)
              }}
            >
              Link
            </Button>
            <Button
              variant="subtle"
              onClick={() => {
                setAdding(false)
                setTarget(null)
              }}
            >
              Cancel
            </Button>
          </div>
        )}
      </div>
    </section>
  )
}
