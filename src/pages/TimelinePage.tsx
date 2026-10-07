import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { useParams } from 'react-router-dom'
import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  eachMonthOfInterval,
  eachWeekOfInterval,
  endOfMonth,
  format,
  max as maxDate,
  min as minDate,
  startOfDay,
  startOfMonth,
  startOfQuarter,
} from 'date-fns'
import { CalendarPlus, ChevronDown, ChevronRight, Crosshair, Plus, Search } from 'lucide-react'
import { useProjectByKey, useStore } from '@/store/store'
import { IssueTypeIcon, StatusLozenge, useIssueModal, Avatar } from '@/components/jira'
import { Button, Input, PageHeader } from '@/components/ui/primitives'
import { cn, toDate, fmtDate } from '@/lib/utils'
import type { Issue, StatusCategory } from '@/types'

type Zoom = 'weeks' | 'months' | 'quarters'
const PX: Record<Zoom, number> = { weeks: 26, months: 7, quarters: 2.6 }
const LEFT = 360
const ROW = 40

type DragMode = 'move' | 'start' | 'end'
interface DragState {
  issueId: string
  mode: DragMode
  x0: number
  start: Date
  end: Date
  delta: number
}

export default function TimelinePage() {
  const { projectKey } = useParams()
  const project = useProjectByKey(projectKey)!
  const allIssues = useStore((s) => s.issues)
  const sprints = useStore((s) => s.sprints)
  const users = useStore((s) => s.users)
  const updateIssue = useStore((s) => s.updateIssue)
  const createIssue = useStore((s) => s.createIssue)
  const { open } = useIssueModal()

  const [zoom, setZoom] = useState<Zoom>('months')
  const [q, setQ] = useState('')
  const [cats, setCats] = useState<StatusCategory[]>([])
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [drag, setDrag] = useState<DragState | null>(null)
  const [newEpic, setNewEpic] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const px = PX[zoom]
  const today = startOfDay(new Date())
  const issues = allIssues.filter((i) => i.projectId === project.id)
  const catOf = (i: Issue) => project.statuses.find((s) => s.id === i.statusId)?.category ?? 'todo'
  const projectSprints = sprints.filter((s) => s.projectId === project.id && s.startDate && s.endDate).sort((a, b) => a.order - b.order)

  const epics = issues
    .filter((i) => i.type === 'epic')
    .filter((e) => {
      const kids = issues.filter((c) => c.epicId === e.id)
      const text = q.toLowerCase()
      const matchText = !q || `${e.key} ${e.summary}`.toLowerCase().includes(text) || kids.some((k) => `${k.key} ${k.summary}`.toLowerCase().includes(text))
      return matchText && (!cats.length || cats.includes(catOf(e)))
    })
    .sort((a, b) => a.rank - b.rank)

  // Visible date range
  const range = useMemo(() => {
    const dates: Date[] = [addDays(today, -45), addDays(today, 120)]
    for (const e of issues) {
      const s = toDate(e.startDate)
      const d = toDate(e.dueDate)
      if (e.type === 'epic' && s) dates.push(s)
      if (e.type === 'epic' && d) dates.push(d)
    }
    for (const s of projectSprints) {
      dates.push(new Date(s.startDate!), new Date(s.endDate!))
    }
    let start = minDate(dates)
    let end = maxDate(dates)
    if (zoom === 'quarters') {
      start = startOfQuarter(addMonths(start, -1))
      end = endOfMonth(addMonths(end, 4))
    } else {
      start = startOfMonth(addMonths(start, -1))
      end = endOfMonth(addMonths(end, 1))
    }
    return { start, end, days: differenceInCalendarDays(end, start) + 1 }
  }, [issues.length, projectSprints.length, zoom]) // eslint-disable-line react-hooks/exhaustive-deps

  const width = range.days * px
  const dayX = (d: Date) => differenceInCalendarDays(d, range.start) * px

  const scrollToToday = () => {
    const el = scrollRef.current
    if (el) el.scrollLeft = Math.max(0, dayX(today) - (el.clientWidth - LEFT) / 3)
  }
  useEffect(scrollToToday, [zoom]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── drag ───
  const beginDrag = (e: RPointerEvent, issue: Issue, mode: DragMode, start: Date, end: Date) => {
    e.stopPropagation()
    e.preventDefault()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    setDrag({ issueId: issue.id, mode, x0: e.clientX, start, end, delta: 0 })
  }
  const onPointerMove = (e: RPointerEvent) => {
    if (!drag) return
    const delta = Math.round((e.clientX - drag.x0) / px)
    if (delta !== drag.delta) setDrag({ ...drag, delta })
  }
  const endDrag = (e: RPointerEvent) => {
    if (!drag) return
    const moved = Math.abs(e.clientX - drag.x0) > 3
    const issue = issues.find((i) => i.id === drag.issueId)
    if (issue && !moved && drag.mode === 'move') open(issue.key)
    else if (issue && drag.delta !== 0) {
      const { start, end } = applyDrag(drag)
      updateIssue(issue.id, { startDate: start.toISOString(), dueDate: end.toISOString() })
    }
    setDrag(null)
  }
  const applyDrag = (d: DragState) => {
    let start = d.start
    let end = d.end
    if (d.mode === 'move') {
      start = addDays(start, d.delta)
      end = addDays(end, d.delta)
    } else if (d.mode === 'start') {
      start = addDays(start, d.delta)
      if (start > end) start = end
    } else {
      end = addDays(end, d.delta)
      if (end < start) end = start
    }
    return { start, end }
  }

  // ─── header ticks ───
  const topTicks =
    zoom === 'quarters'
      ? eachMonthOfInterval({ start: range.start, end: range.end })
          .filter((m) => m.getMonth() % 3 === 0)
          .map((m) => ({ x: dayX(m), label: `Q${Math.floor(m.getMonth() / 3) + 1} ${format(m, 'yyyy')}` }))
      : eachMonthOfInterval({ start: range.start, end: range.end }).map((m) => ({ x: dayX(m), label: format(m, zoom === 'weeks' ? 'MMMM yyyy' : 'MMM yyyy') }))
  const subTicks =
    zoom === 'weeks'
      ? eachWeekOfInterval({ start: range.start, end: range.end }, { weekStartsOn: 1 }).map((w) => ({ x: dayX(w), label: format(w, 'd') }))
      : eachMonthOfInterval({ start: range.start, end: range.end }).map((m) => ({ x: dayX(m), label: zoom === 'months' ? '' : format(m, 'MMM') }))

  const toggleCat = (c: StatusCategory) => setCats((cs) => (cs.includes(c) ? cs.filter((x) => x !== c) : [...cs, c]))

  const renderBar = (issue: Issue, startISO: string | null, endISO: string | null, color: string, opts: { progress?: number; draggable: boolean; label?: string }) => {
    let s = toDate(startISO)
    let e = toDate(endISO)
    if (!s && !e) return null
    if (!s) s = addDays(e!, -14)
    if (!e) e = addDays(s, 14)
    if (drag?.issueId === issue.id) ({ start: s, end: e } = applyDrag({ ...drag, start: s, end: e }))
    const left = dayX(s)
    const w = Math.max(px, (differenceInCalendarDays(e, s) + 1) * px)
    const isDragging = drag?.issueId === issue.id
    return (
      <div
        className={cn('group/bar absolute top-1/2 flex h-6 -translate-y-1/2 items-center overflow-hidden rounded-md text-[11px] font-semibold text-[#160707] shadow-sm', opts.draggable ? 'cursor-grab' : 'cursor-pointer', isDragging && 'cursor-grabbing ring-2 ring-fg')}
        style={{ left, width: w, background: `color-mix(in srgb, ${color} 45%, var(--surface-3))` }}
        onPointerDown={opts.draggable ? (ev) => beginDrag(ev, issue, 'move', s!, e!) : undefined}
        onClick={opts.draggable ? undefined : () => open(issue.key)}
        title={`${issue.key}: ${fmtDate(s.toISOString())} → ${fmtDate(e.toISOString())}`}
      >
        <div className="absolute inset-y-0 left-0" style={{ width: `${(opts.progress ?? 0) * 100}%`, background: color }} />
        {w > 60 && <span className="relative truncate px-2">{opts.label}</span>}
        {opts.draggable && (
          <>
            <span onPointerDown={(ev) => beginDrag(ev, issue, 'start', s!, e!)} className="absolute inset-y-0 left-0 w-2 cursor-ew-resize opacity-0 group-hover/bar:bg-black/25 group-hover/bar:opacity-100" />
            <span onPointerDown={(ev) => beginDrag(ev, issue, 'end', s!, e!)} className="absolute inset-y-0 right-0 w-2 cursor-ew-resize opacity-0 group-hover/bar:bg-black/25 group-hover/bar:opacity-100" />
          </>
        )}
      </div>
    )
  }

  const submitEpic = () => {
    const summary = newEpic?.trim()
    if (summary) createIssue({ projectId: project.id, type: 'epic', summary })
    setNewEpic(null)
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        breadcrumbs={
          <>
            <span>Projects</span>/<span>{project.name}</span>
          </>
        }
        title="Timeline"
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-56">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search timeline" className="h-8 pl-9" />
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-line p-0.5">
            {(['todo', 'inprogress', 'done'] as const).map((c) => (
              <button key={c} onClick={() => toggleCat(c)} className={cn('h-7 rounded-md px-2.5 text-[12px] font-medium transition', cats.includes(c) ? 'bg-accent text-ink' : 'text-muted hover:bg-hover hover:text-fg')}>
                {{ todo: 'To do', inprogress: 'In progress', done: 'Done' }[c]}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          <Button size="sm" variant="subtle" icon={<Crosshair className="size-4" />} onClick={scrollToToday}>
            Today
          </Button>
          <div className="flex items-center gap-0.5 rounded-lg border border-line p-0.5">
            {(['weeks', 'months', 'quarters'] as Zoom[]).map((z) => (
              <button key={z} onClick={() => setZoom(z)} className={cn('h-7 rounded-md px-2.5 text-[12px] font-medium capitalize transition', zoom === z ? 'bg-surface-3 text-fg' : 'text-muted hover:text-fg')}>
                {z}
              </button>
            ))}
          </div>
        </div>
      </PageHeader>

      <div className="min-h-0 flex-1 px-8 pb-6">
        <div ref={scrollRef} className="relative h-full overflow-auto rounded-xl border border-line bg-surface" onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={() => setDrag(null)}>
          <div style={{ width: LEFT + width }} className="relative min-h-full">
            {/* Header */}
            <div className="sticky top-0 z-20 flex border-b border-line bg-surface-2">
              <div className="sticky left-0 z-10 flex shrink-0 items-end border-r border-line bg-surface-2 px-4 pb-2 text-xs font-semibold text-muted" style={{ width: LEFT }}>
                Epic
              </div>
              <div className="relative" style={{ width }}>
                <div className="relative h-7 border-b border-line">
                  {topTicks.map((t) => (
                    <div key={t.x} className="absolute top-0 h-full border-l border-line pt-1.5 pl-2 text-[11px] font-semibold whitespace-nowrap text-muted" style={{ left: t.x }}>
                      {t.label}
                    </div>
                  ))}
                </div>
                {zoom === 'weeks' && (
                  <div className="relative h-6">
                    {subTicks.map((t) => (
                      <div key={t.x} className="absolute top-0 h-full border-l border-line/60 pt-1 pl-1 text-[10px] text-subtle" style={{ left: t.x }}>
                        {t.label}
                      </div>
                    ))}
                  </div>
                )}
                {project.type === 'scrum' && projectSprints.length > 0 && (
                  <div className="relative h-6 border-t border-line">
                    {projectSprints.map((s) => {
                      const l = dayX(new Date(s.startDate!))
                      const w = differenceInCalendarDays(new Date(s.endDate!), new Date(s.startDate!)) * px
                      return (
                          <div
                            key={s.id}
                            title={`${s.name} · ${fmtDate(s.startDate)} – ${fmtDate(s.endDate)}`}
                            className={cn(
                              'absolute top-1 h-4 truncate rounded px-1.5 text-[10px] leading-4 font-semibold',
                              s.state === 'active' ? 'bg-accent text-ink' : s.state === 'closed' ? 'bg-surface-3 text-subtle' : 'border border-dashed border-line-strong text-muted',
                            )}
                            style={{ left: l + 1, width: Math.max(4, w - 2) }}
                          >
                            {w > 50 ? s.name : ''}
                          </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Grid lines + today */}
            <div className="pointer-events-none absolute inset-y-0 z-0" style={{ left: LEFT, width }}>
              {subTicks.map((t) => (
                <div key={t.x} className="absolute inset-y-0 border-l border-line/50" style={{ left: t.x }} />
              ))}
              <div className="absolute inset-y-0 z-10 w-0.5 bg-accent" style={{ left: dayX(today) + px / 2 }}>
                <span className="absolute top-1 -translate-x-1/2 rounded-full bg-accent px-1.5 text-[10px] font-bold text-ink">Today</span>
              </div>
            </div>

            {/* Rows */}
            {epics.map((epic) => {
              const kids = issues.filter((c) => c.epicId === epic.id && c.type !== 'subtask').sort((a, b) => a.rank - b.rank)
              const done = kids.filter((k) => catOf(k) === 'done').length
              const isOpen = expanded[epic.id]
              const unscheduled = !epic.startDate && !epic.dueDate
              return (
                <div key={epic.id}>
                  <div className="group/row relative z-[1] flex border-b border-line hover:bg-hover" style={{ height: ROW }}>
                    <div className="sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r border-line bg-surface px-2 group-hover/row:bg-surface-2" style={{ width: LEFT }}>
                      <button onClick={() => setExpanded((x) => ({ ...x, [epic.id]: !isOpen }))} className="grid size-6 place-items-center rounded text-muted hover:bg-hover" aria-label={isOpen ? 'Collapse' : 'Expand'} disabled={!kids.length}>
                        {kids.length ? isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" /> : null}
                      </button>
                      <IssueTypeIcon type="epic" />
                      <button onClick={() => open(epic.key)} className="shrink-0 text-[12px] text-muted hover:text-accent hover:underline">
                        {epic.key}
                      </button>
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{epic.summary}</span>
                      <span className="text-[11px] text-subtle tabular-nums">
                        {done}/{kids.length}
                      </span>
                    </div>
                    <div className="relative" style={{ width }}>
                      {unscheduled ? (
                        <button
                          className="absolute top-1/2 hidden h-6 -translate-y-1/2 items-center gap-1 rounded-md border border-dashed border-line-strong px-2 text-[11px] text-muted group-hover/row:inline-flex hover:border-accent hover:text-accent"
                          style={{ left: dayX(today) + 4 }}
                          onClick={() => updateIssue(epic.id, { startDate: today.toISOString(), dueDate: addDays(today, 14).toISOString() })}
                        >
                          <CalendarPlus className="size-3.5" /> Schedule
                        </button>
                      ) : (
                        renderBar(epic, epic.startDate, epic.dueDate, epic.color ?? '#b48cff', { progress: kids.length ? done / kids.length : 0, draggable: true, label: epic.summary })
                      )}
                    </div>
                  </div>
                  {isOpen &&
                    kids.map((k) => {
                      const sprint = sprints.find((s) => s.id === k.sprintId)
                      const assignee = users.find((u) => u.id === k.assigneeId)
                      return (
                        <div key={k.id} className="group/row relative z-[1] flex border-b border-line/60 hover:bg-hover" style={{ height: 36 }}>
                          <div className="sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r border-line bg-surface pr-2 pl-10 group-hover/row:bg-surface-2" style={{ width: LEFT }}>
                            <IssueTypeIcon type={k.type} />
                            <button onClick={() => open(k.key)} className={cn('shrink-0 text-[12px] text-muted hover:text-accent hover:underline', catOf(k) === 'done' && 'line-through')}>
                              {k.key}
                            </button>
                            <span className="min-w-0 flex-1 truncate text-[13px]">{k.summary}</span>
                            <StatusLozenge status={project.statuses.find((s) => s.id === k.statusId)} className="max-w-[90px]" />
                            <Avatar user={assignee} size="xs" />
                          </div>
                          <div className="relative" style={{ width }}>
                            {sprint?.startDate && sprint.endDate
                              ? renderBar(k, sprint.startDate, addDays(new Date(sprint.endDate), -1).toISOString(), catOf(k) === 'done' ? '#5cc47e' : epic.color ?? '#b48cff', {
                                  progress: catOf(k) === 'done' ? 1 : 0,
                                  draggable: false,
                                  label: sprint.name,
                                })
                              : null}
                          </div>
                        </div>
                      )
                    })}
                </div>
              )
            })}

            {epics.length === 0 && (
              <div className="sticky left-0 px-6 py-10 text-[13px] text-muted" style={{ width: LEFT + 400 }}>
                {q || cats.length ? 'No epics match your filters.' : 'No epics yet. Create one to start planning your roadmap.'}
              </div>
            )}

            {/* Create epic */}
            <div className="relative z-[1] flex border-b border-line" style={{ height: ROW }}>
              <div className="sticky left-0 z-10 flex shrink-0 items-center border-r border-line bg-surface px-2" style={{ width: LEFT }}>
                {newEpic === null ? (
                  <button onClick={() => setNewEpic('')} className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-[13px] text-muted hover:bg-hover hover:text-fg">
                    <Plus className="size-4" /> Create epic
                  </button>
                ) : (
                  <div className="flex w-full items-center gap-2">
                    <IssueTypeIcon type="epic" />
                    <input
                      autoFocus
                      value={newEpic}
                      onChange={(e) => setNewEpic(e.target.value)}
                      onBlur={submitEpic}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') submitEpic()
                        if (e.key === 'Escape') setNewEpic(null)
                      }}
                      placeholder="What needs to be done?"
                      className="h-8 flex-1 rounded-md border border-accent bg-surface-2 px-2 text-[13px] outline-none"
                    />
                  </div>
                )}
              </div>
              <div style={{ width }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
