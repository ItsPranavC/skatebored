import { Briefcase, Code2, FlaskConical, PenLine, Sparkles, Wrench } from 'lucide-react'
import type { Issue, WorkStyle, WorkTrack } from '@/types'
import { cn } from '@/lib/utils'
import { Tooltip } from '@/components/ui/overlay'
import { CATEGORY_LABEL, WORK_COLOR, WORK_STYLES, WORK_VIEWS, categoryOfWork, inWorkView, workColor, workDescription, type Authoring, type WorkView } from '@/lib/work'

export function WorkIcon({ issue, className }: { issue: Pick<Issue, 'track' | 'workStyle'>; className?: string }) {
  const c = cn('size-3.5 shrink-0', className)
  if (issue.track === 'operations') return <Briefcase className={c} />
  if (issue.track !== 'technical') return null
  const cat = categoryOfWork(issue)
  return cat === 'research' ? <FlaskConical className={c} /> : cat === 'implementation' ? <Wrench className={c} /> : <Code2 className={c} />
}

const SHORT: Record<string, string> = { operations: 'Ops', research: 'Research', implementation: 'Build', technical: 'Tech' }

/** Compact chip for cards and rows. Unclassified work shows nothing (it stays visible everywhere). */
export function WorkBadge({ issue, className }: { issue: Pick<Issue, 'track' | 'workStyle'>; className?: string }) {
  const color = workColor(issue)
  if (!color) return null
  const key = issue.track === 'operations' ? 'operations' : (categoryOfWork(issue) ?? 'technical')
  return (
    <Tooltip label={workDescription(issue)}>
      <span
        className={cn('inline-flex h-5 shrink-0 items-center gap-1 rounded px-1.5 text-[10.5px] font-semibold tracking-wide uppercase', className)}
        style={{ background: `color-mix(in srgb, ${color} 18%, transparent)`, color: `color-mix(in srgb, ${color} 75%, var(--fg))` }}
      >
        <WorkIcon issue={issue} className="size-3" />
        {SHORT[key]}
      </span>
    </Tooltip>
  )
}

/** Handwrite / Use AI label for a brief field. */
export function AuthoringTag({ authoring }: { authoring: Authoring }) {
  return authoring === 'ai' ? (
    <Tooltip label="Use AI — you may ask for a suggestion and accept, edit or reject it. Connected agents can propose text for this field.">
      <span className="inline-flex items-center gap-1 rounded-full border border-[#b48cff]/40 px-1.5 text-[10.5px] font-semibold text-[#c9adff]">
        <Sparkles className="size-3" /> Use AI
      </span>
    </Tooltip>
  ) : (
    <Tooltip label="Handwrite — write this yourself. There is no generation action for this field.">
      <span className="inline-flex items-center gap-1 rounded-full border border-line-strong px-1.5 text-[10.5px] font-semibold text-muted">
        <PenLine className="size-3" /> Handwrite
      </span>
    </Tooltip>
  )
}

// ───────────────────────────── views ─────────────────────────────

const TECH_VIEWS: WorkView[] = ['technical', 'research', 'implementation']

/** All work · Operations · Technical (→ Research heavy / Implementation heavy) · Unclassified */
export function WorkViewSwitcher({ view, onChange, issues }: { view: WorkView; onChange: (v: WorkView) => void; issues: Pick<Issue, 'track' | 'workStyle'>[] }) {
  const count = (v: WorkView) => issues.filter((i) => inWorkView(i, v)).length
  const label = (v: WorkView) => WORK_VIEWS.find((x) => x.id === v)!.label
  const tech = TECH_VIEWS.includes(view)
  const tab = (v: WorkView, active: boolean, color?: string) => (
    <button
      key={v}
      role="tab"
      aria-selected={active}
      onClick={() => onChange(v)}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium whitespace-nowrap transition',
        active ? 'bg-surface-3 text-fg shadow-[inset_0_0_0_1px_var(--line-strong)]' : 'text-muted hover:bg-hover hover:text-fg',
      )}
    >
      {color && <span className="size-2 rounded-full" style={{ background: color }} />}
      {label(v)}
      <span className="text-[11px] text-subtle tabular-nums">{count(v)}</span>
    </button>
  )
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="tablist" aria-label="Work type" className="flex items-center gap-0.5 rounded-xl border border-line bg-surface-2 p-0.5">
        {tab('all', view === 'all')}
        {tab('operations', view === 'operations', WORK_COLOR.operations)}
        {tab('technical', tech, WORK_COLOR.technical)}
        {tab('unclassified', view === 'unclassified')}
      </div>
      {tech && (
        <div role="tablist" aria-label="Technical work" className="flex items-center gap-0.5 rounded-xl border border-line bg-surface-2 p-0.5">
          {tab('research', view === 'research', WORK_COLOR.research)}
          {tab('implementation', view === 'implementation', WORK_COLOR.implementation)}
        </div>
      )}
    </div>
  )
}

// ───────────────────────────── pickers ─────────────────────────────

/** Unclassified · Operations · Technical */
export function TrackToggle({ value, onChange, allowNone = true }: { value: WorkTrack | null; onChange: (v: WorkTrack | null) => void; allowNone?: boolean }) {
  const opts: { id: WorkTrack | null; label: string; color?: string }[] = [
    ...(allowNone ? [{ id: null, label: 'Unclassified' }] : []),
    { id: 'operations', label: 'Operations', color: WORK_COLOR.operations },
    { id: 'technical', label: 'Technical', color: WORK_COLOR.technical },
  ]
  return (
    <div role="radiogroup" aria-label="Work type" className="inline-flex items-center gap-0.5 rounded-lg border border-line bg-surface-2 p-0.5">
      {opts.map((o) => (
        <button
          key={o.id ?? 'none'}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            'inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium transition',
            value === o.id ? 'bg-surface-3 text-fg shadow-[inset_0_0_0_1px_var(--line-strong)]' : 'text-muted hover:text-fg',
          )}
        >
          {o.color && <span className="size-2 rounded-full" style={{ background: o.color }} />}
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** "How much investigation does this work need?" — the three Technical options in plain language. */
export function WorkStyleChooser({
  value,
  onChange,
  suggested,
  compact,
}: {
  value: WorkStyle | null
  onChange: (v: WorkStyle) => void
  suggested?: WorkStyle | null
  compact?: boolean
}) {
  return (
    <div role="radiogroup" aria-label="How much investigation does this work need?" className={cn('grid gap-2', compact ? 'sm:grid-cols-3' : 'md:grid-cols-3')}>
      {WORK_STYLES.map((s) => {
        const on = value === s.id
        const color = WORK_COLOR[s.category]
        return (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(s.id)}
            className={cn('rounded-xl border p-3 text-left transition', on ? 'bg-surface-3' : 'border-line bg-surface-2 hover:border-line-strong hover:bg-surface-3')}
            style={on ? { borderColor: color, boxShadow: `inset 0 0 0 1px ${color}` } : undefined}
          >
            <div className="mb-1 flex items-center gap-1.5 text-[10.5px] font-semibold tracking-wide uppercase" style={{ color }}>
              {s.category === 'research' ? <FlaskConical className="size-3" /> : <Wrench className="size-3" />}
              {CATEGORY_LABEL[s.category]}
              {suggested === s.id && !on && <span className="ml-auto rounded bg-surface-3 px-1 text-[10px] text-muted normal-case">default</span>}
            </div>
            <div className="text-[13.5px] font-semibold">{s.label}</div>
            <div className="mt-0.5 text-[12px] leading-snug text-muted">{s.useWhen}</div>
            {!compact && <div className="mt-2 text-[11px] leading-snug text-subtle">{s.flow.join(' → ')}</div>}
          </button>
        )
      })}
    </div>
  )
}
