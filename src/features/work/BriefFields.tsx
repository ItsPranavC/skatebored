import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AlertTriangle, BookOpen, ChevronDown, ExternalLink, FileText, FlaskConical, Globe, Link2, NotebookPen, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react'
import type { BriefSuggestion, ReferenceKind, WorkReference } from '@/types'
import { useStore } from '@/store/store'
import { cn, nowISO, timeAgo, uid } from '@/lib/utils'
import { PAPER_NOTE_FIELDS, REFERENCE_KINDS, type BriefField } from '@/lib/work'
import { Button, Input, Textarea } from '@/components/ui/primitives'
import { Select, Tooltip } from '@/components/ui/overlay'
import { RichText } from '@/features/issue/RichText'
import { AuthoringTag } from './WorkUI'

/**
 * A brief field that saves itself: after a short pause, on blur, and when it unmounts
 * (so closing the issue, opening a reference or dismissing a suggestion never loses a draft).
 */
export function BriefTextField({
  field,
  value,
  onSave,
  suggestion,
  onClearSuggestion,
  placeholder,
}: {
  field: BriefField
  value: string
  onSave: (v: string) => void
  suggestion?: BriefSuggestion
  onClearSuggestion?: () => void
  placeholder?: string
}) {
  const [draft, setDraft] = useState(value)
  const dirty = useRef(false)
  const latest = useRef({ draft, onSave })
  useLayoutEffect(() => {
    latest.current = { draft, onSave }
  })
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Pick up remote edits while not typing.
  useEffect(() => {
    if (!dirty.current) setDraft(value)
  }, [value])

  const flush = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    if (!dirty.current) return
    dirty.current = false
    latest.current.onSave(latest.current.draft)
  }
  useEffect(() => flush, []) // eslint-disable-line react-hooks/exhaustive-deps

  /** Saves immediately (used by suggestion actions, which shouldn't wait for the debounce). */
  const commit = (v: string) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    dirty.current = false
    setDraft(v)
    onSave(v)
  }

  const change = (v: string) => {
    setDraft(v)
    dirty.current = true
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(flush, 700)
  }

  const id = `brief-${field.id}`
  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <label htmlFor={id} className="text-[12.5px] font-semibold text-fg">
          {field.label}
        </label>
        <AuthoringTag authoring={field.authoring} />
      </div>
      {field.short ? (
        <Input id={id} value={draft} onChange={(e) => change(e.target.value)} onBlur={flush} placeholder={placeholder ?? field.prompt} className="h-8 text-[13px]" />
      ) : (
        <Textarea
          id={id}
          value={draft}
          rows={field.rows ?? 2}
          onChange={(e) => change(e.target.value)}
          onBlur={flush}
          placeholder={placeholder ?? field.prompt}
          className="min-h-[60px] resize-y text-[13px] leading-relaxed"
        />
      )}
      {suggestion && field.authoring === 'ai' && (
        <div className="mt-2 rounded-lg border border-[#b48cff]/35 bg-[color-mix(in_srgb,#b48cff_7%,transparent)] p-2.5">
          <div className="mb-1 flex items-center gap-1.5 text-[11.5px] font-semibold text-[#c9adff]">
            <Sparkles className="size-3.5" /> Suggestion from {suggestion.by} · {timeAgo(suggestion.createdAt)}
          </div>
          <div className="text-[13px] whitespace-pre-wrap text-fg">{suggestion.text}</div>
          <p className="mt-1 text-[11px] text-subtle">Check referenced claims against their sources before keeping them.</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Button
              size="xs"
              variant="default"
              onClick={() => {
                commit(draft.trim() ? `${draft.trim()}\n\n${suggestion.text}` : suggestion.text)
                onClearSuggestion?.()
              }}
            >
              {draft.trim() ? 'Add to draft' : 'Accept'}
            </Button>
            {draft.trim() && (
              <Button
                size="xs"
                variant="subtle"
                onClick={() => {
                  commit(suggestion.text)
                  onClearSuggestion?.()
                }}
              >
                Replace draft
              </Button>
            )}
            <Button size="xs" variant="ghost" onClick={onClearSuggestion}>
              Reject
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Read-only rendering of a filled field (Read brief view). */
export function ReadField({ label, value }: { label: string; value: string | undefined }) {
  if (!value?.trim()) return null
  return (
    <div>
      <div className="mb-0.5 text-[12px] font-semibold tracking-wide text-subtle uppercase">{label}</div>
      <RichText text={value} />
    </div>
  )
}

// ───────────────────────────── references ─────────────────────────────

const KIND_ICON: Record<ReferenceKind, typeof FileText> = { doc: FileText, paper: BookOpen, obsidian: NotebookPen, web: Globe, result: FlaskConical, other: Link2 }

/** Only real URLs (https:, obsidian:, …) become links; vault paths stay as text to copy. */
const openable = (loc: string) => /^[a-z][a-z0-9+.-]*:/i.test(loc.trim()) && !/^javascript:/i.test(loc.trim())

function ReferenceForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: WorkReference
  onSave: (r: Pick<WorkReference, 'title' | 'location' | 'kind' | 'citation'>) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [location, setLocation] = useState(initial?.location ?? '')
  const [kind, setKind] = useState<ReferenceKind>(initial?.kind ?? 'doc')
  const [citation, setCitation] = useState(initial?.citation ?? '')
  const ok = title.trim() && location.trim()
  const submit = () => ok && onSave({ title: title.trim(), location: location.trim(), kind, citation: citation.trim() || undefined })
  return (
    <div
      className="space-y-2 rounded-lg border border-line bg-surface-2 p-3"
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
        if (e.key === 'Escape') onCancel()
      }}
    >
      <div className="grid gap-2 sm:grid-cols-[1fr_150px]">
        <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" aria-label="Reference title" className="h-8 text-[13px]" />
        <Select<ReferenceKind> value={kind} onChange={setKind} options={REFERENCE_KINDS.map((k) => ({ value: k.id, label: k.label }))} className="h-8 text-[13px]" />
      </div>
      <Input
        value={location}
        onChange={(e) => setLocation(e.target.value)}
        placeholder={kind === 'obsidian' ? 'obsidian://open?vault=…&file=…  or  Vault/Folder/Note.md' : 'Link or location (Drive URL, arXiv, repo path…)'}
        aria-label="Reference location"
        className="h-8 text-[13px]"
      />
      <Input
        value={citation}
        onChange={(e) => setCitation(e.target.value)}
        placeholder="Citation details (optional): authors, year, venue, paper id"
        aria-label="Citation"
        className="h-8 text-[13px]"
      />
      <div className="flex gap-2">
        <Button variant="primary" size="xs" disabled={!ok} onClick={submit}>
          {initial ? 'Save' : 'Add reference'}
        </Button>
        <Button variant="subtle" size="xs" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

function ReferenceItem({ r, paperNotes, onChange, onRemove }: { r: WorkReference; paperNotes?: boolean; onChange: (patch: Partial<WorkReference>) => void; onRemove: () => void }) {
  const users = useStore((s) => s.users)
  const [editing, setEditing] = useState(false)
  const [open, setOpen] = useState(false)
  const [issueDraft, setIssueDraft] = useState<string | null>(null)
  const Icon = KIND_ICON[r.kind] ?? Link2
  const noteCount = paperNotes ? PAPER_NOTE_FIELDS.filter((f) => r.notes?.[f.id]?.trim()).length : r.note?.trim() ? 1 : 0
  if (editing) return <ReferenceForm initial={r} onCancel={() => setEditing(false)} onSave={(p) => (onChange(p), setEditing(false))} />
  return (
    <li className="rounded-lg border border-line bg-surface-2">
      <div className="group flex items-start gap-2.5 px-3 py-2">
        <Icon className="mt-0.5 size-4 shrink-0 text-muted" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2">
            {openable(r.location) ? (
              <a href={r.location} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13px] font-medium text-fg hover:text-accent hover:underline">
                {r.title} <ExternalLink className="size-3 opacity-60" />
              </a>
            ) : (
              <span className="text-[13px] font-medium">{r.title}</span>
            )}
            <span className="text-[11px] text-subtle">{REFERENCE_KINDS.find((k) => k.id === r.kind)?.label}</span>
          </div>
          {!openable(r.location) && (
            <button
              className="block max-w-full truncate font-mono text-[11.5px] text-muted hover:text-fg"
              title="Copy location"
              onClick={() => navigator.clipboard?.writeText(r.location)}
            >
              {r.location}
            </button>
          )}
          {r.citation && <div className="text-[11.5px] text-muted">{r.citation}</div>}
          {r.accessIssue && (
            <div className="mt-1 flex items-center gap-1 text-[11.5px] text-warn">
              <AlertTriangle className="size-3.5" /> Can’t access: {r.accessIssue}
              <button className="ml-1 underline" onClick={() => onChange({ accessIssue: null })}>
                Resolved
              </button>
            </div>
          )}
          <div className="text-[11px] text-subtle">
            Added by {users.find((u) => u.id === r.addedById)?.name ?? 'someone'} · {timeAgo(r.addedAt)}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[11.5px] font-medium text-muted hover:bg-hover hover:text-fg"
            aria-expanded={open}
          >
            {paperNotes ? 'Notes' : 'Note'}
            {noteCount > 0 && <span className="text-subtle">({noteCount})</span>}
            <ChevronDown className={cn('size-3 transition', !open && '-rotate-90')} />
          </button>
          <span className="flex opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
            {!r.accessIssue && (
              <Tooltip label="Report that it can’t be opened">
                <button
                  className="grid size-6 place-items-center rounded-md text-subtle hover:bg-hover hover:text-fg"
                  onClick={() => setIssueDraft('')}
                  aria-label="Report access issue"
                >
                  <AlertTriangle className="size-3.5" />
                </button>
              </Tooltip>
            )}
            <button className="grid size-6 place-items-center rounded-md text-subtle hover:bg-hover hover:text-fg" onClick={() => setEditing(true)} aria-label="Edit reference">
              <Pencil className="size-3.5" />
            </button>
            <button className="grid size-6 place-items-center rounded-md text-subtle hover:bg-hover hover:text-accent" onClick={onRemove} aria-label="Remove reference">
              <Trash2 className="size-3.5" />
            </button>
          </span>
        </div>
      </div>
      {issueDraft !== null && (
        <div className="flex gap-2 border-t border-line px-3 py-2">
          <Input
            autoFocus
            value={issueDraft}
            onChange={(e) => setIssueDraft(e.target.value)}
            placeholder="What’s wrong? e.g. no permission, link broken"
            className="h-7 text-[12.5px]"
          />
          <Button size="xs" variant="default" disabled={!issueDraft.trim()} onClick={() => (onChange({ accessIssue: issueDraft.trim() }), setIssueDraft(null))}>
            Save
          </Button>
          <Button size="xs" variant="ghost" onClick={() => setIssueDraft(null)}>
            Cancel
          </Button>
        </div>
      )}
      {open && (
        <div className="space-y-3 border-t border-line px-3 py-3">
          {paperNotes ? (
            <>
              <BriefTextField
                field={{ id: 'question', label: 'Research question it informs', prompt: 'Which question does this source help answer?', authoring: 'handwrite', short: true }}
                value={r.question ?? ''}
                onSave={(question) => onChange({ question })}
              />
              {PAPER_NOTE_FIELDS.map((f) => (
                <BriefTextField key={f.id} field={f} value={r.notes?.[f.id] ?? ''} onSave={(v) => onChange({ notes: { ...r.notes, [f.id]: v } })} />
              ))}
            </>
          ) : (
            <BriefTextField
              field={{ id: 'note', label: 'Note', prompt: 'What matters here, and where (page, section, figure)?', authoring: 'handwrite' }}
              value={r.note ?? ''}
              onSave={(note) => onChange({ note })}
            />
          )}
        </div>
      )}
    </li>
  )
}

/** Sources: papers, documents, Obsidian notes, websites and test results. Originals open where they live. */
export function ReferenceList({
  refs,
  onChange,
  paperNotes,
  emptyText,
}: {
  refs: WorkReference[]
  onChange: (refs: WorkReference[]) => void
  paperNotes?: boolean
  emptyText?: string
}) {
  const me = useStore((s) => s.currentUserId)
  const [adding, setAdding] = useState(false)
  return (
    <div className="space-y-2">
      {refs.length === 0 && !adding && <p className="text-[12.5px] text-subtle">{emptyText ?? 'No references yet.'}</p>}
      <ul className="space-y-2">
        {refs.map((r) => (
          <ReferenceItem
            key={r.id}
            r={r}
            paperNotes={paperNotes && r.kind === 'paper'}
            onChange={(patch) => onChange(refs.map((x) => (x.id === r.id ? { ...x, ...patch } : x)))}
            onRemove={() => onChange(refs.filter((x) => x.id !== r.id))}
          />
        ))}
      </ul>
      {adding ? (
        <ReferenceForm
          onCancel={() => setAdding(false)}
          onSave={(p) => {
            onChange([...refs, { ...p, id: uid('ref'), addedById: me, addedAt: nowISO() }])
            setAdding(false)
          }}
        />
      ) : (
        <Button size="xs" variant="subtle" icon={<Plus className="size-3.5" />} onClick={() => setAdding(true)}>
          Add reference
        </Button>
      )}
    </div>
  )
}
