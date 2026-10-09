import { useRef, useState, type FocusEvent, type KeyboardEvent, type RefObject } from 'react'
import { Plus } from 'lucide-react'
import type { Issue, IssueType } from '@/types'
import { useStore } from '@/store/store'
import { toast } from '@/store/ui'
import { cn } from '@/lib/utils'
import { IssueTypeIcon, issueTypeOptions, useIssueModal } from '@/components/jira'
import { Popover, SelectList } from '@/components/ui/overlay'

/** Jira's inline "+ Create issue": pick a type, type a summary, Enter to save (and keep going). */
export function QuickCreate({
  projectId,
  defaults,
  variant = 'row',
  label = 'Create',
  defaultType = 'task',
  allowEpic = false,
  onCreated,
}: {
  projectId: string
  defaults?: Partial<Issue>
  variant?: 'row' | 'card'
  label?: string
  defaultType?: IssueType
  allowEpic?: boolean
  onCreated?: (i: Issue) => void
}) {
  const createIssue = useStore((s) => s.createIssue)
  const { open: openIssue } = useIssueModal()
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<IssueType>(defaultType)
  const [summary, setSummary] = useState('')
  const [typeOpen, setTypeOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)

  const save = () => {
    const text = summary.trim()
    if (!text) return
    const issue = createIssue({ projectId, type, summary: text, ...defaults })
    setSummary('')
    onCreated?.(issue)
    toast({ title: `${issue.key} created`, description: text, tone: 'success', action: { label: 'View issue', onClick: () => openIssue(issue.key) } })
    inputRef.current?.focus()
  }

  if (!open)
    return (
      <button
        onClick={() => setOpen(true)}
        className={cn(
          'flex w-full items-center gap-2 text-left text-[13px] font-medium text-muted transition hover:bg-hover hover:text-fg',
          variant === 'card' ? 'h-9 rounded-lg px-2' : 'h-10 rounded-lg px-3',
        )}
      >
        <Plus className="size-4" /> {label}
      </button>
    )

  const typePicker = (
    <Popover
      open={typeOpen}
      onOpenChange={setTypeOpen}
      width={200}
      trigger={
        <button type="button" className="flex h-7 shrink-0 items-center gap-1 rounded-md px-1.5 hover:bg-hover" aria-label="Issue type">
          <IssueTypeIcon type={type} />
          <svg viewBox="0 0 16 16" className="size-3 text-subtle" fill="currentColor">
            <path d="M4 6l4 4 4-4z" />
          </svg>
        </button>
      }
    >
      <SelectList
        searchable={false}
        options={issueTypeOptions(allowEpic, false)}
        value={type}
        onSelect={(v) => {
          setType(v)
          setTypeOpen(false)
          inputRef.current?.focus()
        }}
      />
    </Popover>
  )

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      save()
    } else if (e.key === 'Escape') {
      e.stopPropagation()
      setOpen(false)
      setSummary('')
    }
  }
  const onBlur = (e: FocusEvent) => {
    // Keep open while interacting with the type picker; close if left empty.
    if (!summary.trim() && !typeOpen && !e.currentTarget.parentElement?.contains(e.relatedTarget as Node)) setOpen(false)
  }

  if (variant === 'card')
    return (
      <div className="rounded-lg border-2 border-accent bg-surface-2 p-2">
        <textarea
          ref={inputRef as RefObject<HTMLTextAreaElement>}
          autoFocus
          rows={2}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          onKeyDown={onKey}
          onBlur={onBlur}
          placeholder="What needs to be done?"
          className="w-full resize-none bg-transparent text-[13px] outline-none placeholder:text-subtle"
        />
        <div className="flex items-center justify-between">
          {typePicker}
          <span className="text-[11px] text-subtle">↵ to create</span>
        </div>
      </div>
    )

  return (
    <div className="flex h-10 items-center gap-1 rounded-lg border-2 border-accent bg-surface px-1.5">
      {typePicker}
      <input
        ref={inputRef as RefObject<HTMLInputElement>}
        autoFocus
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        onKeyDown={onKey}
        onBlur={onBlur}
        placeholder="What needs to be done?"
        className="h-full flex-1 bg-transparent px-1 text-[13px] outline-none placeholder:text-subtle"
      />
      <span className="pr-2 text-[11px] text-subtle">↵ to create · Esc to cancel</span>
    </div>
  )
}
