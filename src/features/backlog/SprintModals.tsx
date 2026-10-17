import { useEffect, useMemo, useState } from 'react'
import { addWeeks, differenceInCalendarDays, format } from 'date-fns'
import { CheckCircle2, CircleDashed } from 'lucide-react'
import type { Project, Sprint, SprintKind, SprintStep, SprintStepKey } from '@/types'
import { useStore } from '@/store/store'
import { toast } from '@/store/ui'
import { cn, sumPoints, toDate } from '@/lib/utils'
import { Modal, Select } from '@/components/ui/overlay'
import { Button, Field, Input, Textarea } from '@/components/ui/primitives'
import { cleanDocs } from '@/lib/sprintPlan'
import { SprintPlanFields } from './SprintPlan'

const LOCAL = "yyyy-MM-dd'T'HH:mm"
const toLocal = (d: Date) => format(d, LOCAL)
const fromLocal = (s: string) => {
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

type Duration = '1' | '2' | '3' | '4' | 'custom'
const DURATIONS: { value: Duration; label: string }[] = [
  { value: '1', label: '1 week' },
  { value: '2', label: '2 weeks' },
  { value: '3', label: '3 weeks' },
  { value: '4', label: '4 weeks' },
  { value: 'custom', label: 'Custom' },
]

function useSprintIssues(sprint: Sprint | null) {
  const issues = useStore((s) => s.issues)
  return useMemo(() => (sprint ? issues.filter((i) => i.sprintId === sprint.id && i.type !== 'subtask' && i.type !== 'epic') : []), [issues, sprint])
}

// ───────────────────────────── Start sprint ─────────────────────────────

export function StartSprintModal({ sprint, open, onClose }: { sprint: Sprint | null; open: boolean; onClose: () => void }) {
  const startSprint = useStore((s) => s.startSprint)
  const project = useStore((s) => s.projects.find((p) => p.id === sprint?.projectId))
  const issues = useSprintIssues(sprint)
  const [name, setName] = useState('')
  const [goal, setGoal] = useState('')
  const [duration, setDuration] = useState<Duration>('2')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')

  useEffect(() => {
    if (!open || !sprint) return
    const now = new Date()
    now.setSeconds(0, 0)
    setName(sprint.name)
    setGoal(sprint.goal)
    setDuration('2')
    setStart(toLocal(toDate(sprint.startDate) ?? now))
    setEnd(toLocal(toDate(sprint.endDate) ?? addWeeks(now, 2)))
  }, [open, sprint])

  const changeDuration = (d: Duration) => {
    setDuration(d)
    const s = fromLocal(start)
    if (d !== 'custom' && s) setEnd(toLocal(addWeeks(s, Number(d))))
  }
  const changeStart = (v: string) => {
    setStart(v)
    const s = fromLocal(v)
    if (duration !== 'custom' && s) setEnd(toLocal(addWeeks(s, Number(duration))))
  }

  const s = fromLocal(start)
  const e = fromLocal(end)
  const error = !name.trim() ? 'Sprint name is required' : !s || !e ? 'Enter valid dates' : e <= s ? 'End date must be after the start date' : null
  const points = sumPoints(issues)

  const submit = () => {
    if (!sprint || error) return
    startSprint(sprint.id, { name: name.trim(), goal: goal.trim(), startDate: s!.toISOString(), endDate: e!.toISOString() })
    toast({ title: `${name.trim()} started`, description: `${issues.length} issues · ${points} points committed`, tone: 'success' })
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Start sprint"
      width={560}
      footer={
        <>
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!!error} onClick={submit}>
            Start
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(ev) => {
          ev.preventDefault()
          submit()
        }}
      >
        <p className="text-[13px] text-muted">
          <strong className="text-fg">{issues.length}</strong> {issues.length === 1 ? 'issue' : 'issues'} will be included in this sprint
          {project?.estimation === 'points' && (
            <>
              {' '}
              (<strong className="text-fg">{points}</strong> story points)
            </>
          )}
          .
        </p>
        {issues.some((i) => i.storyPoints == null) && project?.estimation === 'points' && (
          <p className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-[13px] text-warn">
            {issues.filter((i) => i.storyPoints == null).length} issues have no estimate. They won’t count towards the sprint commitment.
          </p>
        )}
        <Field label="Sprint name" required>
          <Input autoFocus value={name} onChange={(ev) => setName(ev.target.value)} />
        </Field>
        <Field label="Duration" required>
          <Select value={duration} onChange={changeDuration} options={DURATIONS} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start date" required>
            <Input type="datetime-local" value={start} onChange={(ev) => changeStart(ev.target.value)} />
          </Field>
          <Field label="End date" required>
            <Input type="datetime-local" value={end} disabled={duration !== 'custom'} onChange={(ev) => setEnd(ev.target.value)} />
          </Field>
        </div>
        <Field label="Sprint goal" hint="What does the team want to achieve? Shown on the board.">
          <Textarea rows={3} value={goal} onChange={(ev) => setGoal(ev.target.value)} />
        </Field>
        {error && start && end && <p className="text-[13px] text-accent">{error}</p>}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  )
}

// ───────────────────────────── New sprint ─────────────────────────────

export function NewSprintModal({ project, open, onClose }: { project: Project; open: boolean; onClose: () => void }) {
  const createSprint = useStore((s) => s.createSprint)
  const sprints = useStore((s) => s.sprints)
  const [name, setName] = useState('')
  const [goal, setGoal] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [kind, setKind] = useState<SprintKind | null>(null)
  const [steps, setSteps] = useState<Partial<Record<SprintStepKey, SprintStep>>>({})
  useEffect(() => {
    if (!open) return
    const n = sprints.filter((s) => s.projectId === project.id).reduce((m, s) => Math.max(m, parseInt(s.name.match(/(\d+)\s*$/)?.[1] ?? '0', 10)), 0)
    const now = new Date()
    now.setSeconds(0, 0)
    setName(`${project.key} Sprint ${n + 1}`)
    setGoal('')
    setStart(toLocal(now))
    setEnd(toLocal(addWeeks(now, 2)))
    setKind(null)
    setSteps({})
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const s = start ? fromLocal(start) : null
  const e = end ? fromLocal(end) : null
  const error = !name.trim()
    ? 'Sprint name is required'
    : project.engineering && !kind
      ? 'Pick Research or Implementation'
      : s && e && e <= s
        ? 'End date must be after the start date'
        : null
  const submit = () => {
    if (error) return
    const sprint = createSprint(project.id, {
      name: name.trim(),
      goal: goal.trim(),
      startDate: s?.toISOString() ?? null,
      endDate: e?.toISOString() ?? null,
      ...(project.engineering ? { kind, steps: Object.fromEntries(Object.entries(steps).map(([k, st]) => [k, { ...st, docs: cleanDocs(st.docs) }])) } : {}),
    })
    toast({ title: `${sprint.name} created`, tone: 'success' })
    onClose()
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New sprint"
      width={project.engineering ? 600 : 520}
      footer={
        <>
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!!error} onClick={submit}>
            Create sprint
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(ev) => {
          ev.preventDefault()
          submit()
        }}
      >
        <Field label="Sprint name" required>
          <Input autoFocus value={name} onChange={(ev) => setName(ev.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start">
            <Input type="datetime-local" value={start} onChange={(ev) => setStart(ev.target.value)} />
          </Field>
          <Field label="End">
            <Input type="datetime-local" value={end} onChange={(ev) => setEnd(ev.target.value)} />
          </Field>
        </div>
        <Field label="Goal">
          <Textarea rows={2} value={goal} onChange={(ev) => setGoal(ev.target.value)} />
        </Field>
        {project.engineering && <SprintPlanFields kind={kind} steps={steps} onKind={setKind} onSteps={setSteps} />}
        {error && name && <p className="text-[13px] text-accent">{error}</p>}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  )
}

// ───────────────────────────── Edit sprint ─────────────────────────────

export function EditSprintModal({ sprint, open, onClose }: { sprint: Sprint | null; open: boolean; onClose: () => void }) {
  const updateSprint = useStore((s) => s.updateSprint)
  const engineering = useStore((s) => !!s.projects.find((p) => p.id === sprint?.projectId)?.engineering)
  const [name, setName] = useState('')
  const [goal, setGoal] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [kind, setKind] = useState<SprintKind | null>(null)
  const [steps, setSteps] = useState<Partial<Record<SprintStepKey, SprintStep>>>({})
  useEffect(() => {
    if (!open || !sprint) return
    setName(sprint.name)
    setGoal(sprint.goal)
    setStart(sprint.startDate ? toLocal(new Date(sprint.startDate)) : '')
    setEnd(sprint.endDate ? toLocal(new Date(sprint.endDate)) : '')
    setKind(sprint.kind ?? null)
    setSteps(sprint.steps ?? {})
  }, [open, sprint])
  const s = start ? fromLocal(start) : null
  const e = end ? fromLocal(end) : null
  const needsDates = sprint?.state !== 'future'
  const error = !name.trim()
    ? 'Sprint name is required'
    : needsDates && (!s || !e)
      ? 'Active sprints need a start and end date'
      : s && e && e <= s
        ? 'End date must be after the start date'
        : null
  const submit = () => {
    if (!sprint || error) return
    const plan = engineering
      ? { kind, steps: Object.fromEntries(Object.entries(steps).map(([k, st]) => [k, { ...st, docs: cleanDocs(st.docs) }])) }
      : {}
    updateSprint(sprint.id, { name: name.trim(), goal: goal.trim(), startDate: s?.toISOString() ?? null, endDate: e?.toISOString() ?? null, ...plan })
    toast({ title: 'Sprint updated', tone: 'success' })
    onClose()
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Edit sprint: ${sprint?.name ?? ''}`}
      width={engineering ? 600 : 540}
      footer={
        <>
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!!error} onClick={submit}>
            Update
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(ev) => {
          ev.preventDefault()
          submit()
        }}
      >
        <Field label="Sprint name" required>
          <Input autoFocus value={name} onChange={(ev) => setName(ev.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start date" required={needsDates}>
            <Input type="datetime-local" value={start} onChange={(ev) => setStart(ev.target.value)} />
          </Field>
          <Field label="End date" required={needsDates}>
            <Input type="datetime-local" value={end} onChange={(ev) => setEnd(ev.target.value)} />
          </Field>
        </div>
        <Field label="Sprint goal">
          <Textarea rows={engineering ? 2 : 3} value={goal} onChange={(ev) => setGoal(ev.target.value)} />
        </Field>
        {engineering && <SprintPlanFields kind={kind} steps={steps} onKind={setKind} onSteps={setSteps} />}
        {error && <p className="text-[13px] text-accent">{error}</p>}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  )
}

// ───────────────────────────── Complete sprint ─────────────────────────────

export function CompleteSprintModal({ sprint, open, onClose }: { sprint: Sprint | null; open: boolean; onClose: () => void }) {
  const completeSprint = useStore((s) => s.completeSprint)
  const project = useStore((s) => s.projects.find((p) => p.id === sprint?.projectId))
  const allSprints = useStore((s) => s.sprints)
  const issues = useSprintIssues(sprint)
  const doneIds = new Set(project?.statuses.filter((st) => st.category === 'done').map((st) => st.id))
  const completed = issues.filter((i) => doneIds.has(i.statusId))
  const openIssues = issues.filter((i) => !doneIds.has(i.statusId))
  const future = allSprints.filter((s) => s.projectId === sprint?.projectId && s.state === 'future').sort((a, b) => a.order - b.order)
  const [dest, setDest] = useState<string>('backlog')
  useEffect(() => {
    if (open) setDest(future[0]?.id ?? 'new')
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const submit = () => {
    if (!sprint || !project) return
    const destName = dest === 'backlog' ? 'the backlog' : dest === 'new' ? 'a new sprint' : (future.find((f) => f.id === dest)?.name ?? 'the backlog')
    completeSprint(sprint.id, dest as 'backlog' | 'new' | string)
    onClose()
    toast({
      title: `${sprint.name} finished`,
      description: `${completed.length} issues done${openIssues.length ? ` · ${openIssues.length} moved to ${destName}` : ''}.`,
      tone: 'success',
    })
  }

  const daysLeft = sprint?.endDate ? differenceInCalendarDays(new Date(sprint.endDate), new Date()) : null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Finish ${sprint?.name ?? 'sprint'}`}
      width={540}
      footer={
        <>
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit}>
            Finish sprint
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="relative overflow-hidden rounded-xl border border-line bg-surface-2 p-5">
          <div className="pointer-events-none absolute -top-8 -right-6 text-[110px] leading-none opacity-[0.08] select-none">🛹</div>
          <p className="display text-2xl">{completed.length === issues.length && issues.length ? 'Clean sweep.' : 'Nice run.'}</p>
          <p className="mt-1 text-[13px] text-muted">
            {daysLeft != null && daysLeft > 0 ? `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} early — ` : ''}this sprint contains:
          </p>
          <ul className="mt-3 space-y-1.5 text-[13px]">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-done-fg" />
              <strong>{completed.length}</strong> completed {completed.length === 1 ? 'issue' : 'issues'}
              {project?.estimation === 'points' && <span className="text-subtle">· {sumPoints(completed)} pts</span>}
            </li>
            <li className="flex items-center gap-2">
              <CircleDashed className={cn('size-4', openIssues.length ? 'text-warn' : 'text-subtle')} />
              <strong>{openIssues.length}</strong> open {openIssues.length === 1 ? 'issue' : 'issues'}
              {project?.estimation === 'points' && <span className="text-subtle">· {sumPoints(openIssues)} pts</span>}
            </li>
          </ul>
        </div>
        {openIssues.length > 0 ? (
          <Field label="Move unfinished tasks to">
            <Select
              value={dest}
              onChange={setDest}
              options={[...future.map((f) => ({ value: f.id, label: f.name })), { value: 'new', label: 'New sprint' }]}
            />
          </Field>
        ) : (
          <p className="text-[13px] text-muted">Every issue is done. Completed issues stay with this sprint for reporting.</p>
        )}
        <p className="text-xs text-subtle">Finished sprints stay on the Sprints page under Finished.</p>
      </div>
    </Modal>
  )
}
