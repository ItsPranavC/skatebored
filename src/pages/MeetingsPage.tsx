import { useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { format } from 'date-fns'
import { Check, FileText, Lightbulb, ListChecks, MessageSquareQuote, Plus, Search, Sparkles, Trash2, Upload, Users, X } from 'lucide-react'
import { useMe, useStore } from '@/store/store'
import { toast } from '@/store/ui'
import { Avatar, IssueKey, IssueTypeIcon, PriorityIcon, UserPicker, useIssueModal } from '@/components/jira'
import { ConfirmDialog, Modal, Select, type Option } from '@/components/ui/overlay'
import { Badge, Button, EmptyState, Field, Input, PageHeader, Spinner, Textarea } from '@/components/ui/primitives'
import { ProjectAvatar } from '@/layout/TopNav'
import { authedFetch } from '@/sync/engine'
import { cn } from '@/lib/utils'
import type { Meeting, SuggestedTask } from '@/types'

const ACCEPT = '.txt,.md,.vtt,.srt,.text,text/plain,text/markdown,text/vtt'
const BACKLOG = '__backlog'

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-line p-4">
      <h3 className="mb-2 flex items-center gap-2 text-[13px] font-semibold">
        {icon} {title}
      </h3>
      {children}
    </section>
  )
}

const Bullets = ({ items, empty }: { items: string[]; empty: string }) =>
  items.length ? (
    <ul className="list-disc space-y-1 pl-5 text-[13px] text-muted marker:text-subtle">
      {items.map((t, i) => (
        <li key={i}>{t}</li>
      ))}
    </ul>
  ) : (
    <p className="text-[13px] text-subtle">{empty}</p>
  )

/** Upload or paste a transcript; the server summarizes it and creates the meeting. */
function UploadModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (m: Meeting) => void }) {
  const projects = useStore((s) => s.projects)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(() => format(new Date(), "yyyy-MM-dd'T'HH:mm"))
  const [projectId, setProjectId] = useState('__all')
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const projectOptions: Option[] = [{ value: '__all', label: 'All projects' }, ...projects.map((p) => ({ value: p.id, label: p.name, icon: <ProjectAvatar project={p} size={18} /> }))]

  const readFile = async (f: File | undefined) => {
    if (!f) return
    if (f.size > 3_000_000) return setError('That file is over 3 MB. Upload a plain-text transcript (.txt, .vtt, .srt, .md).')
    setText(await f.text())
    setFileName(f.name)
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '))
    setError(null)
  }

  const reset = () => {
    setTitle('')
    setText('')
    setFileName(null)
    setError(null)
  }

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await authedFetch('/api/meetings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title, date: new Date(date).toISOString(), projectId: projectId === '__all' ? null : projectId, transcript: text, fileName: fileName ?? 'pasted-transcript.txt' }),
      })
      const { meeting } = (await res.json()) as { meeting: Meeting }
      // The record also arrives through sync; add it now so it opens immediately.
      useStore.setState((s) => (s.meetings.some((m) => m.id === meeting.id) ? s : { meetings: [...s.meetings, meeting] }))
      reset()
      onCreated(meeting)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      width={640}
      title="Add meeting notes"
      footer={
        <>
          <Button variant="subtle" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy || !text.trim()} icon={busy ? <Spinner className="size-4" /> : <Sparkles className="size-4" />} onClick={() => void submit()}>
            {busy ? 'Summarizing…' : 'Summarize meeting'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-[1fr_200px] gap-3">
          <Field label="Title" hint="Leave blank to name it after the main topics">
            <Input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="Sprint 2 planning" />
          </Field>
          <Field label="When">
            <Input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <Field label="Project" hint="Suggested tasks are matched to this project’s sprints">
          <Select value={projectId} options={projectOptions} onChange={setProjectId} width={280} />
        </Field>
        <Field label="Transcript" required>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              void readFile(e.dataTransfer.files[0])
            }}
            className="rounded-lg border border-dashed border-line-strong p-3"
          >
            <div className="mb-2 flex flex-wrap items-center gap-2 text-[13px] text-muted">
              <Button size="sm" icon={<Upload className="size-4" />} onClick={() => fileRef.current?.click()}>
                Upload file
              </Button>
              <span>.txt, .vtt, .srt or .md (Zoom, Meet, Teams, Otter exports) — or drop it here, or paste below.</span>
              <input ref={fileRef} type="file" accept={ACCEPT} hidden onChange={(e) => void readFile(e.target.files?.[0])} />
            </div>
            {fileName && (
              <div className="mb-2 flex items-center gap-2 text-[12px]">
                <FileText className="size-4 text-muted" /> {fileName} · {text.length.toLocaleString()} characters
                <button
                  className="text-subtle hover:text-fg"
                  aria-label="Remove file"
                  onClick={() => {
                    setText('')
                    setFileName(null)
                  }}
                >
                  <X className="size-3.5" />
                </button>
              </div>
            )}
            <Textarea
              rows={8}
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                setFileName(null)
              }}
              placeholder="Paste the transcript here…"
              className="font-mono text-[12px]"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && text.trim() && !busy) void submit()
              }}
            />
            {text && !fileName && <div className="mt-1 text-right text-[11px] text-subtle">{text.length.toLocaleString()} characters · ⌘↵ to summarize</div>}
          </div>
        </Field>
        {busy && <p className="text-[12px] text-subtle">Reading the transcript and drafting notes…</p>}
        {error && <p className="rounded-lg border border-accent/40 bg-accent-soft px-3 py-2 text-[13px]">{error}</p>}
      </div>
    </Modal>
  )
}

/** One suggested task: pick the sprint and assignee, then add it as an issue (or dismiss it). */
function SuggestionRow({ meeting, s }: { meeting: Meeting; s: SuggestedTask }) {
  const projects = useStore((st) => st.projects)
  const sprints = useStore((st) => st.sprints)
  const issues = useStore((st) => st.issues)
  const createIssue = useStore((st) => st.createIssue)
  const updateMeeting = useStore((st) => st.updateMeeting)
  const { open } = useIssueModal()
  const issue = s.issueId ? issues.find((i) => i.id === s.issueId) : undefined
  const patch = (p: Partial<SuggestedTask>) => updateMeeting(meeting.id, { suggestions: meeting.suggestions.map((x) => (x.id === s.id ? { ...x, ...p } : x)) })

  const sprint = sprints.find((x) => x.id === s.sprintId)
  const projectId = sprint?.projectId ?? meeting.projectId ?? projects[0]?.id ?? null
  const sprintOptions: Option[] = useMemo(
    () => [
      { value: BACKLOG, label: 'Backlog' },
      ...sprints
        .filter((x) => x.state !== 'closed' && (!meeting.projectId || x.projectId === meeting.projectId))
        .map((x) => ({ value: x.id, label: x.name, hint: x.state === 'active' ? 'Active' : undefined, group: projects.find((p) => p.id === x.projectId)?.name })),
    ],
    [sprints, projects, meeting.projectId],
  )

  const add = () => {
    if (!projectId) return toast({ title: 'Create a project first', tone: 'error' })
    const created = createIssue({
      projectId,
      type: s.type,
      summary: s.summary,
      description: `${s.description}\n\nFrom meeting “${meeting.title}” (${format(new Date(meeting.date), 'd MMM yyyy')}): ${s.rationale}`,
      priority: s.priority,
      assigneeId: s.assigneeId,
      sprintId: sprint && sprint.projectId === projectId ? sprint.id : null,
      storyPoints: s.storyPoints,
      labels: ['meeting'],
    })
    patch({ issueId: created.id })
    toast({ title: `Created ${created.key}`, description: sprint ? `In ${sprint.name}` : 'In the backlog', tone: 'success', action: { label: 'Open', onClick: () => open(created.key) } })
  }

  return (
    <li className={cn('rounded-lg border border-line p-3', (s.dismissed || issue) && 'opacity-60')}>
      <div className="flex items-start gap-3">
        <IssueTypeIcon type={s.type} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn('text-[14px] font-medium', s.dismissed && 'line-through')}>{s.summary}</span>
            <PriorityIcon priority={s.priority} />
            {s.storyPoints != null && <Badge>{s.storyPoints} pts</Badge>}
          </div>
          <p className="mt-0.5 text-[13px] text-muted">{s.description}</p>
          {s.rationale && (
            <p className="mt-1 flex gap-1.5 text-[12px] text-subtle italic">
              <MessageSquareQuote className="mt-0.5 size-3.5 shrink-0" /> {s.rationale}
            </p>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 pl-7">
        {issue ? (
          <button onClick={() => open(issue.key)} className="flex items-center gap-1.5 text-[13px] text-success hover:underline">
            <Check className="size-4" /> Added as <IssueKey issue={issue} />
          </button>
        ) : s.dismissed ? (
          <Button size="sm" variant="subtle" onClick={() => patch({ dismissed: false })}>
            Restore
          </Button>
        ) : (
          <>
            <Select value={s.sprintId ?? BACKLOG} options={sprintOptions} onChange={(v) => patch({ sprintId: v === BACKLOG ? null : v })} width={240} />
            <UserPicker value={s.assigneeId} projectId={projectId ?? undefined} onChange={(id) => patch({ assigneeId: id })} />
            <div className="flex-1" />
            <Button size="sm" variant="ghost" icon={<X className="size-4" />} onClick={() => patch({ dismissed: true })}>
              Dismiss
            </Button>
            <Button size="sm" variant="primary" icon={<Plus className="size-4" />} onClick={add}>
              {sprint ? `Add to ${sprint.name}` : 'Add to backlog'}
            </Button>
          </>
        )}
      </div>
    </li>
  )
}

function MeetingDetail({ meeting }: { meeting: Meeting }) {
  const users = useStore((s) => s.users)
  const projects = useStore((s) => s.projects)
  const deleteMeeting = useStore((s) => s.deleteMeeting)
  const navigate = useNavigate()
  const [transcript, setTranscript] = useState<string | null>(null)
  const [loadingTranscript, setLoadingTranscript] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const creator = users.find((u) => u.id === meeting.createdById)
  const project = projects.find((p) => p.id === meeting.projectId)
  const pending = meeting.suggestions.filter((s) => !s.issueId && !s.dismissed)
  const added = meeting.suggestions.filter((s) => s.issueId).length

  const showTranscript = async () => {
    if (transcript != null) return setTranscript(null)
    setLoadingTranscript(true)
    try {
      setTranscript(await (await authedFetch(`/api/meetings?transcript=${encodeURIComponent(meeting.id)}`)).text())
    } catch (e) {
      toast({ title: 'Couldn’t load the transcript', description: (e as Error).message, tone: 'error' })
    } finally {
      setLoadingTranscript(false)
    }
  }

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[22px] font-semibold tracking-tight">{meeting.title}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
            <span>{format(new Date(meeting.date), 'EEEE d MMMM yyyy · H:mm')}</span>
            {project && (
              <span className="flex items-center gap-1.5">
                <ProjectAvatar project={project} size={16} /> {project.name}
              </span>
            )}
            {creator && (
              <span className="flex items-center gap-1.5">
                <Avatar user={creator} size="xs" /> Uploaded by {creator.name}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button icon={loadingTranscript ? <Spinner className="size-4" /> : <FileText className="size-4" />} onClick={() => void showTranscript()}>
            {transcript != null ? 'Hide transcript' : 'Transcript'}
          </Button>
          <Button variant="ghost" aria-label="Delete meeting" icon={<Trash2 className="size-4" />} onClick={() => setConfirm(true)} />
        </div>
      </div>

      {transcript != null && <pre className="max-h-[420px] overflow-auto rounded-xl border border-line bg-surface-2 p-4 text-[12px] leading-relaxed whitespace-pre-wrap">{transcript}</pre>}

      <Section icon={<Sparkles className="size-4 text-accent" />} title="Summary">
        <p className="text-[14px] leading-relaxed">{meeting.summary}</p>
        {meeting.attendees.length > 0 && (
          <p className="mt-3 flex items-center gap-2 text-[12px] text-subtle">
            <Users className="size-3.5" /> {meeting.attendees.join(', ')}
          </p>
        )}
      </Section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Section icon={<ListChecks className="size-4 text-info" />} title="Key points">
          <Bullets items={meeting.keyPoints} empty="None recorded." />
        </Section>
        <Section icon={<Check className="size-4 text-success" />} title="Decisions">
          <Bullets items={meeting.decisions} empty="No decisions were made." />
        </Section>
        <Section icon={<Lightbulb className="size-4 text-warn" />} title="Open questions">
          <Bullets items={meeting.openQuestions} empty="Nothing left open." />
        </Section>
      </div>

      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[15px] font-semibold">
            Suggested tasks <span className="text-[13px] font-normal text-muted">· {pending.length} to review{added ? ` · ${added} added` : ''}</span>
          </h3>
        </div>
        {meeting.suggestions.length === 0 ? (
          <p className="rounded-xl border border-line p-4 text-[13px] text-muted">No follow-up work came out of this meeting.</p>
        ) : (
          <ul className="space-y-2">
            {[...meeting.suggestions]
              .sort((a, b) => Number(!!a.issueId || a.dismissed) - Number(!!b.issueId || b.dismissed))
              .map((s) => (
                <SuggestionRow key={s.id} meeting={meeting} s={s} />
              ))}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title={`Delete “${meeting.title}”?`}
        confirmLabel="Delete"
        danger
        onConfirm={() => {
          deleteMeeting(meeting.id)
          setConfirm(false)
          navigate('/meetings')
        }}
      >
        The notes leave the meeting history. Issues already created from it stay.
      </ConfirmDialog>
    </div>
  )
}

export default function MeetingsPage() {
  const { meetingId } = useParams()
  const navigate = useNavigate()
  const meetings = useStore((s) => s.meetings)
  const projects = useStore((s) => s.projects)
  const me = useMe()
  const [uploading, setUploading] = useState(false)
  const [q, setQ] = useState('')
  const sorted = useMemo(() => [...meetings].sort((a, b) => b.date.localeCompare(a.date)), [meetings])
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    return t ? sorted.filter((m) => [m.title, m.summary, ...m.attendees, ...m.decisions].join(' ').toLowerCase().includes(t)) : sorted
  }, [sorted, q])
  const current = meetings.find((m) => m.id === meetingId) ?? (meetingId ? undefined : sorted[0])

  return (
    <div className="mx-auto max-w-[1400px] pb-12">
      <PageHeader
        title="Meetings"
        actions={
          <Button variant="primary" icon={<Upload className="size-4" />} onClick={() => setUploading(true)}>
            Add meeting notes
          </Button>
        }
      >
        <p className="max-w-[680px] text-sm text-muted">Upload a meeting transcript to get a summary, decisions, open questions and suggested tasks for your sprints. Every meeting stays here as the team’s history.</p>
      </PageHeader>

      <div className="px-8">
        {meetings.length === 0 ? (
          <EmptyState icon="🎙️" title="No meetings yet" action={<Button variant="primary" onClick={() => setUploading(true)}>Add meeting notes</Button>}>
            Export the transcript from Zoom, Google Meet, Teams or Otter, upload it, and review the tasks it suggests. Tasks come from what people commit to (“I’ll…”), ask for (“Sam, can you…”) and agree needs doing.
          </EmptyState>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
            <aside className="min-w-0">
              <div className="relative mb-2">
                <Search className="pointer-events-none absolute top-2 left-2.5 size-4 text-subtle" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search meetings" className="pl-8" />
              </div>
              <ol className="space-y-1">
                {shown.map((m) => {
                  const open = m.suggestions.filter((s) => !s.issueId && !s.dismissed).length
                  const project = projects.find((p) => p.id === m.projectId)
                  return (
                    <li key={m.id}>
                      <button
                        onClick={() => navigate(`/meetings/${m.id}`)}
                        className={cn('w-full rounded-lg px-3 py-2.5 text-left transition hover:bg-hover', current?.id === m.id && 'bg-active')}
                      >
                        <div className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{m.title}</span>
                          {open > 0 && <Badge tone="accent">{open}</Badge>}
                        </div>
                        <div className="mt-0.5 truncate text-[12px] text-muted">
                          {format(new Date(m.date), 'd MMM yyyy')}
                          {project ? ` · ${project.name}` : ''}
                        </div>
                      </button>
                    </li>
                  )
                })}
                {shown.length === 0 && <li className="px-3 py-2 text-[13px] text-subtle">No meetings match “{q}”.</li>}
              </ol>
            </aside>
            {current ? <MeetingDetail key={current.id} meeting={current} /> : <p className="text-muted">That meeting doesn’t exist or was deleted.</p>}
          </div>
        )}
      </div>

      <UploadModal
        open={uploading}
        onClose={() => setUploading(false)}
        onCreated={(m) => {
          setUploading(false)
          navigate(`/meetings/${m.id}`)
          const n = m.suggestions.length
          toast({ title: 'Meeting notes ready', description: n ? `${n} suggested task${n === 1 ? '' : 's'} to review, ${me.name.split(' ')[0]}.` : 'No follow-up tasks found.', tone: 'success' })
        }}
      />
    </div>
  )
}
