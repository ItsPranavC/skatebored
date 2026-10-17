import { format } from 'date-fns'
import { CalendarCheck, Check, FileText, Pencil, Plus, Presentation, X } from 'lucide-react'
import type { Project, Sprint, SprintKind, SprintStep, SprintStepKey } from '@/types'
import { useStore } from '@/store/store'
import { cn, toDate } from '@/lib/utils'
import { EMPTY_STEP, SPRINT_KINDS, STEPS, docLabel, kindLabel, stepOf } from '@/lib/sprintPlan'
import { Field, Input } from '@/components/ui/primitives'

// Engineering projects only: a sprint is Research (research → alternatives → solution)
// or Implementation (an implementation date). Each step has Google Docs and a presentation time.

export function KindBadge({ kind }: { kind: SprintKind }) {
  return (
    <span
      className={cn(
        'rounded px-1.5 text-[10px] font-bold tracking-wide uppercase',
        kind === 'research' ? 'bg-[color-mix(in_srgb,#8b5cf6_22%,var(--surface-3))] text-fg' : 'bg-done text-done-fg',
      )}
    >
      {kindLabel(kind)}
    </span>
  )
}

const when = (iso: string | null | undefined, withTime = true) => {
  const d = toDate(iso)
  return d ? format(d, withTime ? 'EEE d MMM, h:mmaaa' : 'EEE d MMM') : null
}

/** The sprint's steps at a glance: docs to open and when each one is presented. */
export function SprintPlan({ project, sprint, onEdit, className }: { project: Project; sprint: Sprint; onEdit: () => void; className?: string }) {
  const updateSprint = useStore((s) => s.updateSprint)
  if (!project.engineering) return null

  if (!sprint.kind)
    return (
      <div className={cn('flex flex-wrap items-center gap-2 text-[12.5px] text-muted', className)}>
        What kind of sprint is this?
        {SPRINT_KINDS.map((k) => (
          <button key={k.value} onClick={() => updateSprint(sprint.id, { kind: k.value })} className="rounded-md border border-line px-2 py-0.5 font-medium text-fg hover:bg-hover">
            {k.label}
          </button>
        ))}
      </div>
    )

  const now = Date.now()
  return (
    <div className={cn('rounded-lg border border-line bg-surface-2 px-3 py-2 text-[12.5px]', className)}>
      <div className="grid grid-cols-[minmax(90px,auto)_1fr_auto] items-center gap-x-4 gap-y-1.5">
        {STEPS[sprint.kind].map(({ key, label }, n) => {
          const step = stepOf(sprint, key)
          const presented = !!step.presentAt && Date.parse(step.presentAt) < now
          return (
            <div key={key} className="contents">
              <span className="inline-flex items-center gap-1.5 font-semibold">
                <span className={cn('grid size-4 place-items-center rounded-full text-[10px]', presented ? 'bg-done text-done-fg' : 'bg-surface-3 text-muted')}>
                  {presented ? <Check className="size-3" /> : n + 1}
                </span>
                {label}
              </span>
              <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                {key === 'implementation' && (
                  <span className="inline-flex items-center gap-1 text-muted">
                    <CalendarCheck className="size-3.5" />
                    {step.date ? `By ${when(step.date, false)}` : 'No implementation date'}
                  </span>
                )}
                {step.docs.length ? (
                  step.docs.map((url, i) => (
                    <a
                      key={i}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex max-w-[180px] items-center gap-1 truncate rounded-md border border-line bg-surface px-1.5 py-0.5 hover:border-line-strong hover:underline"
                    >
                      <FileText className="size-3.5 shrink-0 text-muted" />
                      {docLabel(url)}
                    </a>
                  ))
                ) : (
                  <button onClick={onEdit} className="text-subtle hover:text-fg hover:underline">
                    + Add Google Doc
                  </button>
                )}
              </span>
              <span className={cn('inline-flex items-center gap-1 whitespace-nowrap', step.presentAt ? 'text-fg' : 'text-subtle')}>
                <Presentation className="size-3.5 text-muted" />
                {step.presentAt ? `${presented ? 'Presented' : 'Presents'} ${when(step.presentAt)}` : 'No presentation set'}
              </span>
            </div>
          )
        })}
      </div>
      <button onClick={onEdit} className="mt-1.5 inline-flex items-center gap-1 text-muted hover:text-fg hover:underline">
        <Pencil className="size-3" /> Edit plan
      </button>
    </div>
  )
}

const LOCAL = "yyyy-MM-dd'T'HH:mm"
const toInput = (iso: string | null | undefined, pattern: string) => {
  const d = toDate(iso)
  return d ? format(d, pattern) : ''
}
const fromInput = (v: string) => {
  const d = new Date(v)
  return v && !isNaN(d.getTime()) ? d.toISOString() : null
}

/** Sprint type and, per step, Google Docs links and a presentation time. Used in the Edit sprint dialog. */
export function SprintPlanFields({
  kind,
  steps,
  onKind,
  onSteps,
}: {
  kind: SprintKind | null
  steps: Partial<Record<SprintStepKey, SprintStep>>
  onKind: (k: SprintKind) => void
  onSteps: (s: Partial<Record<SprintStepKey, SprintStep>>) => void
}) {
  const setStep = (key: SprintStepKey, patch: Partial<SprintStep>) => onSteps({ ...steps, [key]: { ...EMPTY_STEP, ...steps[key], ...patch } })
  return (
    <div className="space-y-3">
      <Field label="Sprint type" required>
        <div className="grid grid-cols-2 gap-2">
          {SPRINT_KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              onClick={() => onKind(k.value)}
              className={cn('rounded-lg border px-3 py-2 text-left transition', kind === k.value ? 'border-accent bg-accent-soft' : 'border-line hover:bg-hover')}
            >
              <div className="text-[13px] font-semibold">{k.label}</div>
              <div className="text-[12px] text-muted">{k.hint}</div>
            </button>
          ))}
        </div>
      </Field>
      {kind &&
        STEPS[kind].map(({ key, label }, n) => {
          const step = { ...EMPTY_STEP, ...steps[key] }
          const docs = step.docs.length ? step.docs : ['']
          return (
            <div key={key} className="space-y-2 rounded-lg border border-line p-3">
              <div className="text-[13px] font-semibold">
                {STEPS[kind].length > 1 && <span className="text-muted">{n + 1}. </span>}
                {label}
              </div>
              {key === 'implementation' && (
                <Field label="Implementation date">
                  <Input type="date" value={toInput(step.date, 'yyyy-MM-dd')} onChange={(e) => setStep(key, { date: fromInput(e.target.value && `${e.target.value}T12:00`) })} />
                </Field>
              )}
              <Field label="Google Docs">
                <div className="space-y-1.5">
                  {docs.map((url, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <Input
                        value={url}
                        placeholder="https://docs.google.com/…"
                        onChange={(e) => setStep(key, { docs: docs.map((d, j) => (j === i ? e.target.value : d)) })}
                      />
                      {(docs.length > 1 || url) && (
                        <button
                          type="button"
                          aria-label="Remove link"
                          onClick={() => setStep(key, { docs: docs.filter((_, j) => j !== i) })}
                          className="grid size-8 shrink-0 place-items-center rounded-md text-muted hover:bg-hover hover:text-fg"
                        >
                          <X className="size-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  <button type="button" onClick={() => setStep(key, { docs: [...docs, ''] })} className="inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-fg">
                    <Plus className="size-3.5" /> Add another doc
                  </button>
                </div>
              </Field>
              <Field label="Presentation">
                <Input type="datetime-local" value={toInput(step.presentAt, LOCAL)} onChange={(e) => setStep(key, { presentAt: fromInput(e.target.value) })} />
              </Field>
            </div>
          )
        })}
    </div>
  )
}
