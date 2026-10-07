import { forwardRef, useImperativeHandle, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { format } from 'date-fns'
import { Plus } from 'lucide-react'
import { useStore } from '@/store/store'
import { Avatar, LabelTag } from '@/components/jira'
import { cn, labelColor, toDate } from '@/lib/utils'

// ───────────────────────────── dates ─────────────────────────────

export const toDateInput = (iso: string | null | undefined) => {
  const d = toDate(iso)
  return d ? format(d, 'yyyy-MM-dd') : ''
}
export const fromDateInput = (v: string) => (v ? new Date(`${v}T00:00:00`).toISOString() : null)

// ───────────────────────────── labels ─────────────────────────────

export function useAllLabels() {
  const issues = useStore((s) => s.issues)
  return useMemo(() => Array.from(new Set(issues.flatMap((i) => i.labels))).sort(), [issues])
}

/** Chip input with suggestions + "create" — Jira's labels field. */
export function LabelEditor({ value, onChange, autoFocus, onDone }: { value: string[]; onChange: (v: string[]) => void; autoFocus?: boolean; onDone?: () => void }) {
  const all = useAllLabels()
  const [q, setQ] = useState('')
  const [hi, setHi] = useState(0)
  const clean = q.trim().replace(/\s+/g, '-').toLowerCase()
  const suggestions = all.filter((l) => !value.includes(l) && l.includes(clean)).slice(0, 8)
  const canCreate = clean && !all.includes(clean) && !value.includes(clean)
  const items = [...(canCreate ? [`__create:${clean}`] : []), ...suggestions]
  const add = (l: string) => {
    onChange([...value, l])
    setQ('')
    setHi(0)
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const it = items[hi]
      if (it) add(it.startsWith('__create:') ? it.slice(9) : it)
      else if (!q) onDone?.()
    } else if (e.key === 'Backspace' && !q && value.length) onChange(value.slice(0, -1))
    else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHi((h) => Math.min(h + 1, items.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHi((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onDone?.()
    }
  }
  return (
    <div>
      <div className="flex min-h-9 flex-wrap items-center gap-1 rounded-lg border border-accent bg-surface px-2 py-1 ring-2 ring-accent-soft">
        {value.map((l) => (
          <LabelTag key={l} label={l} onRemove={() => onChange(value.filter((x) => x !== l))} />
        ))}
        <input
          autoFocus={autoFocus}
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setHi(0)
          }}
          onKeyDown={onKey}
          placeholder={value.length ? '' : 'Add labels…'}
          className="min-w-[80px] flex-1 bg-transparent text-[13px] outline-none placeholder:text-subtle"
        />
      </div>
      {(q || items.length > 0) && (
        <div className="mt-1 max-h-48 overflow-auto rounded-lg border border-line bg-surface-2 py-1">
          {items.length === 0 && <div className="px-3 py-1.5 text-[12px] text-subtle">No more labels</div>}
          {items.map((it, k) => {
            const create = it.startsWith('__create:')
            const label = create ? it.slice(9) : it
            return (
              <button
                key={it}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => add(label)}
                onMouseEnter={() => setHi(k)}
                className={cn('flex w-full items-center gap-2 px-3 py-1 text-left text-[13px]', k === hi && 'bg-hover')}
              >
                {create ? <Plus className="size-3.5 text-accent" /> : <span className="size-2 rounded-full" style={{ background: labelColor(label) }} />}
                {create ? (
                  <span>
                    Create label <strong>{label}</strong>
                  </span>
                ) : (
                  label
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ───────────────────────────── mention textarea ─────────────────────────────

export interface MentionTextareaHandle {
  focus: () => void
}

/** Textarea with @mention autocomplete (inserts @Firstname, which the store turns into notifications). */
export const MentionTextarea = forwardRef<
  MentionTextareaHandle,
  { value: string; onChange: (v: string) => void; onSubmit?: () => void; onCancel?: () => void; placeholder?: string; rows?: number; autoFocus?: boolean }
>(function MentionTextarea({ value, onChange, onSubmit, onCancel, placeholder, rows = 4, autoFocus }, ref) {
  const users = useStore((s) => s.users)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const [mention, setMention] = useState<{ q: string; start: number } | null>(null)
  const [hi, setHi] = useState(0)
  useImperativeHandle(ref, () => ({ focus: () => taRef.current?.focus() }))

  const matches = mention ? users.filter((u) => u.active && u.name.toLowerCase().includes(mention.q.toLowerCase())).slice(0, 6) : []

  const detect = (text: string, caret: number) => {
    const before = text.slice(0, caret)
    const m = before.match(/(^|\s)@([\p{L}]*)$/u)
    setMention(m ? { q: m[2]!, start: caret - m[2]!.length - 1 } : null)
    setHi(0)
  }
  const pick = (name: string) => {
    if (!mention || !taRef.current) return
    const first = name.split(' ')[0]!
    const caret = taRef.current.selectionStart
    const next = `${value.slice(0, mention.start)}@${first} ${value.slice(caret)}`
    onChange(next)
    setMention(null)
    const pos = mention.start + first.length + 2
    requestAnimationFrame(() => {
      taRef.current?.focus()
      taRef.current?.setSelectionRange(pos, pos)
    })
  }

  return (
    <div className="relative">
      <textarea
        ref={taRef}
        autoFocus={autoFocus}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value)
          detect(e.target.value, e.target.selectionStart)
        }}
        onKeyDown={(e) => {
          if (mention && matches.length) {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setHi((h) => (h + 1) % matches.length)
              return
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault()
              setHi((h) => (h - 1 + matches.length) % matches.length)
              return
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
              e.preventDefault()
              pick(matches[hi]!.name)
              return
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              setMention(null)
              return
            }
          }
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            onSubmit?.()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            onCancel?.()
          }
        }}
        onBlur={() => setTimeout(() => setMention(null), 150)}
        className="w-full resize-y rounded-lg border border-accent bg-surface px-3 py-2 text-sm text-fg ring-2 ring-accent-soft outline-none placeholder:text-subtle"
      />
      {mention && matches.length > 0 && (
        <div className="absolute top-full left-0 z-20 mt-1 w-64 rounded-lg border border-line bg-surface-2 py-1 shadow-pop">
          {matches.map((u, k) => (
            <button
              key={u.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(u.name)}
              className={cn('flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px]', k === hi && 'bg-hover')}
            >
              <Avatar user={u} size="xs" showTooltip={false} />
              <span className="flex-1">{u.name}</span>
              <span className="text-[11px] text-subtle">{u.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
})
