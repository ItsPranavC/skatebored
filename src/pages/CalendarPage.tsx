import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  addDays,
  addMinutes,
  addMonths,
  addWeeks,
  differenceInCalendarDays,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { CalendarCheck, CalendarDays, ChevronLeft, ChevronRight, Flag, MapPin, MoreHorizontal, Pencil, Plus, RefreshCw, Rocket, Trash2 } from 'lucide-react'
import { useMe, useStore } from '@/store/store'
import { toast } from '@/store/ui'
import { Avatar } from '@/components/jira'
import { ConfirmDialog, Menu, Modal, Select, type Option } from '@/components/ui/overlay'
import { Badge, Button, Field, Input, PageHeader, Tabs, Textarea } from '@/components/ui/primitives'
import { ProjectAvatar } from '@/layout/TopNav'
import { cn, toDate } from '@/lib/utils'
import { useGoogleCalendar } from '@/features/calendar/googleCalendar'
import type { TeamEvent } from '@/types'
import { STEPS, docLabel } from '@/lib/sprintPlan'

type View = 'month' | 'week'
type Kind = 'event' | 'sprint' | 'release'

/** One thing on the team calendar: a team event, or a sprint / release date from the workspace. */
interface Item {
  key: string
  kind: Kind
  title: string
  start: Date
  allDay: boolean
  event?: TeamEvent
  sub?: string
  /** Sprint presentations: the step's Google Docs */
  docs?: string[]
}

const KIND_STYLE: Record<Kind, string> = {
  event: 'bg-accent-soft text-fg border-accent/60',
  sprint: 'bg-done text-done-fg border-success/40',
  release: 'bg-warn/15 text-warn border-warn/40',
}
const KIND_LABEL: Record<Kind, string> = { event: 'Team events', sprint: 'Sprints', release: 'Releases' }
const DURATIONS: Option[] = [15, 30, 45, 60, 90, 120, 180, 240, 480].map((m) => ({ value: String(m), label: m < 60 ? `${m} min` : `${m / 60} h` }))

function rangeOf(view: View, cursor: Date) {
  return view === 'month'
    ? { from: startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 }), to: endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 }) }
    : { from: startOfWeek(cursor, { weekStartsOn: 1 }), to: endOfWeek(cursor, { weekStartsOn: 1 }) }
}

function useCalendarItems(): Item[] {
  const events = useStore((s) => s.events)
  const projects = useStore((s) => s.projects)
  const sprints = useStore((s) => s.sprints)
  return useMemo(() => {
    const out: Item[] = []
    for (const e of events) {
      const start = new Date(e.start)
      if (Number.isNaN(start.getTime())) continue
      out.push({ key: `e:${e.id}`, kind: 'event', title: e.title, start, allDay: false, event: e, sub: projects.find((p) => p.id === e.projectId)?.name })
    }
    for (const sp of sprints) {
      if (sp.state === 'closed') continue
      const project = projects.find((p) => p.id === sp.projectId)
      const s = toDate(sp.startDate)
      const e = toDate(sp.endDate)
      if (s) out.push({ key: `ss:${sp.id}`, kind: 'sprint', title: `${sp.name} starts`, start: s, allDay: true, sub: project?.name })
      if (e) out.push({ key: `se:${sp.id}`, kind: 'sprint', title: `${sp.name} ends`, start: e, allDay: true, sub: project?.name })
      // Engineering sprints: each step's presentation, and the implementation date.
      if (project?.engineering && sp.kind)
        for (const { key, label } of STEPS[sp.kind]) {
          const step = sp.steps?.[key]
          const at = toDate(step?.presentAt)
          const day = toDate(step?.date)
          if (at) out.push({ key: `sp:${sp.id}:${key}`, kind: 'sprint', title: `${label} presentation · ${sp.name}`, start: at, allDay: false, sub: project.name, docs: step?.docs })
          if (day) out.push({ key: `si:${sp.id}`, kind: 'sprint', title: `${sp.name} implementation`, start: day, allDay: true, sub: project.name })
        }
    }
    for (const p of projects)
      for (const v of p.versions) {
        const d = toDate(v.releaseDate)
        if (d && !v.released && !v.archived) out.push({ key: `v:${v.id}`, kind: 'release', title: `Release ${v.name}`, start: d, allDay: true, sub: p.name })
      }
    return out.sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.getTime() - b.start.getTime())
  }, [events, projects, sprints])
}

function Stat({ label, value, sub, icon }: { label: string; value: ReactNode; sub?: ReactNode; icon: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-surface p-4">
      <div className="flex items-center gap-2 text-[11px] font-semibold tracking-wide text-subtle uppercase">
        {icon} {label}
      </div>
      <div className="mt-2 truncate text-[22px] font-semibold tracking-tight tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 truncate text-[12px] text-muted">{sub}</div>}
    </div>
  )
}

function Chip({ item, onClick }: { item: Item; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={item.title}
      className={cn('flex w-full items-center gap-1 truncate rounded-md border-l-2 px-1.5 py-0.5 text-left text-[11.5px] leading-tight transition hover:brightness-125', KIND_STYLE[item.kind])}
    >
      {!item.allDay && <span className="shrink-0 tabular-nums opacity-80">{format(item.start, 'H:mm')}</span>}
      <span className="truncate">{item.title}</span>
    </button>
  )
}

/** Create or edit a team event. Times are entered in this browser's timezone and stored as UTC. */
function EventEditor({ event, day, onClose }: { event: TeamEvent | null; day: Date | null; onClose: () => void }) {
  const projects = useStore((s) => s.projects)
  const createEvent = useStore((s) => s.createEvent)
  const updateEvent = useStore((s) => s.updateEvent)
  const initial = event ? new Date(event.start) : (() => {
    const d = day ?? addDays(new Date(), 1)
    d.setHours(10, 0, 0, 0)
    return d
  })()
  const [title, setTitle] = useState(event?.title ?? '')
  const [date, setDate] = useState(format(initial, 'yyyy-MM-dd'))
  const [time, setTime] = useState(format(initial, 'HH:mm'))
  const [duration, setDuration] = useState(String(event?.durationMinutes ?? 30))
  const [location, setLocation] = useState(event?.location ?? '')
  const [projectId, setProjectId] = useState(event?.projectId ?? '__none')
  const [description, setDescription] = useState(event?.description ?? '')
  const start = new Date(`${date}T${time || '00:00'}:00`)
  const valid = title.trim() && !Number.isNaN(start.getTime())
  const projectOptions: Option[] = [{ value: '__none', label: 'Whole team' }, ...projects.map((p) => ({ value: p.id, label: p.name, icon: <ProjectAvatar project={p} size={18} /> }))]

  const save = () => {
    if (!valid) return
    const data = { title: title.trim().slice(0, 300), start: start.toISOString(), durationMinutes: Number(duration), location: location.trim(), description: description.trim(), projectId: projectId === '__none' ? null : projectId }
    if (event) updateEvent(event.id, data)
    else createEvent(data)
    toast({ title: event ? 'Event updated' : 'Event added to the team calendar', description: 'It’s being copied to everyone’s connected Google Calendar.', tone: 'success' })
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      width={560}
      title={event ? 'Edit team event' : 'New team event'}
      footer={
        <>
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!valid} onClick={save}>
            {event ? 'Save' : 'Add to team calendar'}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <Field label="Title" required>
          <Input autoFocus value={title} maxLength={300} onChange={(e) => setTitle(e.target.value)} placeholder="Sprint planning" />
        </Field>
        <div className="grid grid-cols-[1fr_1fr_1fr] gap-3">
          <Field label="Date" required>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Time" required>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
          <Field label="Duration">
            <Select value={duration} options={DURATIONS} onChange={setDuration} width={160} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Location or link">
            <Input value={location} maxLength={500} onChange={(e) => setLocation(e.target.value)} placeholder="Zoom, Discord, Room 2…" />
          </Field>
          <Field label="For">
            <Select value={projectId} options={projectOptions} onChange={setProjectId} width={240} />
          </Field>
        </div>
        <Field label="Details">
          <Textarea rows={3} value={description} maxLength={7000} onChange={(e) => setDescription(e.target.value)} placeholder="Agenda, links…" />
        </Field>
        {/* Lets Enter submit; the visible buttons live in the modal footer, outside the form. */}
        <button type="submit" hidden />
        <p className="text-[12px] text-subtle">Times are in your timezone ({Intl.DateTimeFormat().resolvedOptions().timeZone}). Everyone sees it in theirs.</p>
      </form>
    </Modal>
  )
}

function ItemDetail({ item, onClose, onEdit }: { item: Item; onClose: () => void; onEdit: (e: TeamEvent) => void }) {
  const users = useStore((s) => s.users)
  const deleteEvent = useStore((s) => s.deleteEvent)
  const [confirm, setConfirm] = useState(false)
  const e = item.event
  const creator = e ? users.find((u) => u.id === e.createdById) : undefined
  const when = item.allDay
    ? format(item.start, 'EEEE d MMMM')
    : e
      ? `${format(item.start, 'EEEE d MMMM · H:mm')}–${format(addMinutes(item.start, e.durationMinutes), 'H:mm')}`
      : format(item.start, 'EEEE d MMMM · H:mm')
  return (
    <>
      <Modal
        open={!confirm}
        onClose={onClose}
        width={500}
        title={item.title}
        footer={
          e ? (
            <>
              <Button variant="subtle" icon={<Trash2 className="size-4" />} onClick={() => setConfirm(true)}>
                Delete
              </Button>
              <Button variant="primary" icon={<Pencil className="size-4" />} onClick={() => onEdit(e)}>
                Edit
              </Button>
            </>
          ) : undefined
        }
      >
        <div className="space-y-3 text-[13px]">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={item.kind === 'event' ? 'accent' : item.kind === 'sprint' ? 'success' : 'neutral'}>{KIND_LABEL[item.kind].replace(/s$/, '')}</Badge>
            <span className="text-muted">{when}</span>
          </div>
          {item.sub && <div className="text-muted">{item.sub}</div>}
          {e?.location && (
            <div className="flex items-center gap-2 text-muted">
              <MapPin className="size-4" /> {/^https?:\/\//.test(e.location) ? <a className="text-accent hover:underline" href={e.location} target="_blank" rel="noopener noreferrer">{e.location}</a> : e.location}
            </div>
          )}
          {e?.description && <p className="max-h-48 overflow-auto rounded-lg bg-surface-2 p-3 whitespace-pre-wrap text-muted">{e.description}</p>}
          {creator && (
            <div className="flex items-center gap-2 text-[12px] text-subtle">
              <Avatar user={creator} size="xs" /> Added by {creator.name}
            </div>
          )}
          {!!item.docs?.length && (
            <div className="flex flex-wrap gap-1.5">
              {item.docs.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="rounded-md border border-line px-2 py-0.5 text-accent hover:underline">
                  {docLabel(url)}
                </a>
              ))}
            </div>
          )}
          {!e && (
            <p className="text-[12px] text-subtle">
              {item.allDay
                ? 'From the project’s sprint and release dates; it’s on everyone’s Google Calendar as an all-day event. Change it on the project.'
                : 'From the sprint’s plan; it’s on everyone’s Google Calendar. Change it with Edit sprint.'}
            </p>
          )}
        </div>
      </Modal>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title={`Delete “${item.title}”?`}
        confirmLabel="Delete"
        danger
        onConfirm={() => {
          deleteEvent(e!.id)
          toast({ title: 'Event deleted', description: 'It’s being removed from everyone’s Google Calendar.', tone: 'success' })
          onClose()
        }}
      >
        It’s removed from the team calendar and from every member’s Google Calendar.
      </ConfirmDialog>
    </>
  )
}

function SyncCoverage() {
  const users = useStore((s) => s.users)
  const ids = useGoogleCalendar((s) => s.connectedClerkIds)
  if (!ids) return null
  const synced = users.filter((u) => u.clerkId && ids.includes(u.clerkId))
  const members = users.filter((u) => u.clerkId)
  return (
    <div className="flex items-center gap-2 text-[12px] text-muted" title={synced.map((u) => u.name).join(', ')}>
      <div className="flex -space-x-1.5">
        {synced.slice(0, 5).map((u) => (
          <Avatar key={u.id} user={u} size="xs" className="ring-2 ring-canvas" />
        ))}
      </div>
      Syncing to {synced.length} of {members.length} members’ Google Calendars
    </div>
  )
}

function ConnectCard({ busy, onConnect }: { busy: boolean; onConnect: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-accent/40 bg-accent-soft p-4">
      <div className="grid size-10 place-items-center rounded-full bg-accent text-ink">
        <CalendarDays className="size-5" />
      </div>
      <div className="min-w-[220px] flex-1">
        <div className="font-semibold">Get team events on your Google Calendar</div>
        <div className="text-[13px] text-muted">Team events, sprint dates and releases are added to yours automatically and kept up to date. skatebored never reads your own events.</div>
      </div>
      <Button variant="primary" size="md" disabled={busy} onClick={onConnect}>
        Connect Google Calendar
      </Button>
    </div>
  )
}

export default function CalendarPage() {
  const [params, setParams] = useSearchParams()
  const me = useMe()
  const { status, checkStatus, loadMembers, connect, disconnect, syncNow } = useGoogleCalendar()
  const sprints = useStore((s) => s.sprints)
  const items = useCalendarItems()
  const [view, setView] = useState<View>('month')
  const [cursor, setCursor] = useState(() => new Date())
  const [hidden, setHidden] = useState<Set<Kind>>(new Set())
  const [selected, setSelected] = useState<Item | null>(null)
  const [editing, setEditing] = useState<{ event: TeamEvent | null; day: Date | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)
  const { from, to } = rangeOf(view, cursor)

  // Back from Google's consent screen.
  useEffect(() => {
    if (params.get('connected') !== '1') return
    setParams({}, { replace: true })
    void checkStatus().then((s) => {
      void loadMembers()
      toast(
        s === 'connected'
          ? { title: 'Google Calendar connected', description: 'Upcoming team events are being added to it now.', tone: 'success' }
          : { title: 'Google Calendar wasn’t connected', description: 'Try again, and allow calendar access.', tone: 'error' },
      )
    })
  }, [params, setParams, checkStatus, loadMembers])

  useEffect(() => {
    if (status === 'unknown') void checkStatus()
    void loadMembers()
  }, [status, checkStatus, loadMembers])

  const visible = useMemo(() => items.filter((i) => !hidden.has(i.kind)), [items, hidden])
  const onDay = (d: Date) => visible.filter((i) => isSameDay(i.start, d))

  const stats = useMemo(() => {
    const now = new Date()
    const events = items.filter((i) => i.kind === 'event')
    const wkTo = endOfWeek(now, { weekStartsOn: 1 })
    const thisWeek = events.filter((i) => i.start >= startOfWeek(now, { weekStartsOn: 1 }) && i.start <= wkTo)
    const next = events.find((i) => addMinutes(i.start, i.event!.durationMinutes) > now)
    const active = sprints.filter((s) => s.state === 'active' && s.endDate).sort((a, b) => a.endDate!.localeCompare(b.endDate!))[0]
    const release = items.find((i) => i.kind === 'release' && i.start >= startOfDay(now))
    return { thisWeek: thisWeek.length, upcomingThisWeek: thisWeek.filter((i) => i.start > now).length, next, active, release }
  }, [items, sprints])

  const upcoming = useMemo(() => {
    const start = startOfDay(new Date())
    const end = endOfDay(addDays(start, 6))
    return visible.filter((i) => i.start >= start && i.start <= end)
  }, [visible])

  const doConnect = async () => {
    setBusy(true)
    try {
      await connect()
    } catch (e) {
      setBusy(false)
      toast({ title: 'Couldn’t start Google sign-in', description: (e as Error).message, tone: 'error' })
    }
  }

  const doSync = async () => {
    setSyncing(true)
    try {
      const r = await syncNow()
      toast({ title: r.failed ? 'Synced, with some errors' : 'Google Calendars are up to date', description: `${r.created} added · ${r.updated} updated · ${r.removed} removed${r.failed ? ` · ${r.failed} failed` : ''}`, tone: r.failed ? 'error' : 'success' })
    } catch (e) {
      toast({ title: 'Couldn’t sync', description: (e as Error).message, tone: 'error' })
    } finally {
      setSyncing(false)
    }
  }

  const step = (dir: 1 | -1) => setCursor((c) => (view === 'month' ? addMonths(c, dir) : addWeeks(c, dir)))
  const days: Date[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d)
  const sprintDays = stats.active ? differenceInCalendarDays(toDate(stats.active.endDate)!, new Date()) : null

  return (
    <div className="mx-auto max-w-[1400px] pb-12">
      <PageHeader
        title="Team calendar"
        actions={
          <>
            {status === 'connected' && (
              <Menu
                trigger={<Button variant="ghost" aria-label="Calendar settings" icon={<MoreHorizontal className="size-4" />} />}
                width={260}
                items={[
                  { heading: true, label: 'Your Google Calendar is connected' },
                  { label: 'Sync everyone’s Google Calendar now', icon: <RefreshCw className="size-4" />, onClick: () => void doSync() },
                  { label: 'Disconnect my Google Calendar', onClick: () => setConfirmDisconnect(true) },
                ]}
              />
            )}
            <Button variant="primary" icon={<Plus className="size-4" />} disabled={syncing} onClick={() => setEditing({ event: null, day: null })}>
              New event
            </Button>
          </>
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-[640px] text-sm text-muted">One calendar for the whole team: team events, sprint dates and releases. Everything on it is copied to each member’s Google Calendar.</p>
          <SyncCoverage />
        </div>
      </PageHeader>

      <div className="space-y-5 px-8">
        {status === 'disconnected' && <ConnectCard busy={busy} onConnect={() => void doConnect()} />}
        {status === 'unavailable' && <div className="rounded-xl border border-line p-4 text-[13px] text-muted">Google Calendar sync isn’t enabled on this workspace yet. The team calendar still works here.</div>}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat icon={<CalendarDays className="size-3.5" />} label="Team events this week" value={stats.thisWeek} sub={`${stats.upcomingThisWeek} still to come`} />
          <Stat
            icon={<CalendarCheck className="size-3.5" />}
            label="Next up"
            value={stats.next ? stats.next.title : 'Nothing scheduled'}
            sub={stats.next ? (isToday(stats.next.start) ? `Today ${format(stats.next.start, 'H:mm')}` : format(stats.next.start, 'EEE d MMM · H:mm')) : 'Add one with “New event”'}
          />
          <Stat
            icon={<Flag className="size-3.5" />}
            label="Sprint ends"
            value={stats.active ? (sprintDays! < 0 ? 'Overdue' : sprintDays === 0 ? 'Today' : `${sprintDays} days`) : '—'}
            sub={stats.active ? `${stats.active.name} · ${format(toDate(stats.active.endDate)!, 'EEE d MMM')}` : 'No active sprint'}
          />
          <Stat icon={<Rocket className="size-3.5" />} label="Next release" value={stats.release ? stats.release.title.replace(/^Release /, '') : '—'} sub={stats.release ? format(stats.release.start, 'EEE d MMM') : 'None scheduled'} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="default" onClick={() => setCursor(new Date())}>
            Today
          </Button>
          <Button variant="ghost" aria-label="Previous" icon={<ChevronLeft className="size-4" />} onClick={() => step(-1)} />
          <Button variant="ghost" aria-label="Next" icon={<ChevronRight className="size-4" />} onClick={() => step(1)} />
          <h2 className="ml-1 text-[18px] font-semibold tracking-tight">{view === 'month' ? format(cursor, 'MMMM yyyy') : `${format(from, 'd MMM')} – ${format(to, 'd MMM yyyy')}`}</h2>
          <div className="flex-1" />
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
              <button
                key={k}
                onClick={() => setHidden((h) => (h.has(k) ? new Set([...h].filter((x) => x !== k)) : new Set([...h, k])))}
                className={cn('flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] transition', hidden.has(k) ? 'border-line text-subtle' : 'border-line-strong text-fg')}
                aria-pressed={!hidden.has(k)}
              >
                <span className={cn('size-2 rounded-full border', KIND_STYLE[k], hidden.has(k) && 'opacity-30')} />
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
          <Tabs value={view} onChange={setView} tabs={[{ id: 'month', label: 'Month' }, { id: 'week', label: 'Week' }]} />
        </div>

        <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
          <div className="overflow-hidden rounded-xl border border-line">
            <div className="grid grid-cols-7 border-b border-line bg-surface-2 text-[11px] font-semibold tracking-wide text-subtle uppercase">
              {days.slice(0, 7).map((d) => (
                <div key={d.toISOString()} className="px-2 py-2">
                  {format(d, 'EEE')}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((d) => {
                const list = onDay(d)
                const max = view === 'month' ? 3 : 12
                return (
                  <div
                    key={d.toISOString()}
                    onDoubleClick={() => setEditing({ event: null, day: new Date(d) })}
                    className={cn('group min-w-0 border-r border-b border-line p-1.5 [&:nth-child(7n)]:border-r-0', view === 'month' ? 'min-h-[112px]' : 'min-h-[420px]', view === 'month' && !isSameMonth(d, cursor) && 'bg-surface-2/50 opacity-60')}
                  >
                    <div className="mb-1 flex items-center justify-between px-0.5">
                      <span className={cn('grid size-6 place-items-center rounded-full text-[12px] tabular-nums', isToday(d) ? 'bg-accent font-semibold text-ink' : 'text-muted')}>{format(d, 'd')}</span>
                      <button
                        onClick={() => setEditing({ event: null, day: new Date(d) })}
                        className="grid size-5 place-items-center rounded text-subtle opacity-0 group-hover:opacity-100 hover:bg-hover hover:text-fg focus:opacity-100"
                        aria-label={`New event on ${format(d, 'd MMMM')}`}
                      >
                        <Plus className="size-3.5" />
                      </button>
                    </div>
                    <div className="space-y-0.5">
                      {list.slice(0, max).map((i) => (
                        <Chip key={i.key} item={i} onClick={() => setSelected(i)} />
                      ))}
                      {list.length > max && (
                        <button
                          className="px-1.5 text-[11px] text-muted hover:text-fg"
                          onClick={() => {
                            setView('week')
                            setCursor(d)
                          }}
                        >
                          +{list.length - max} more
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <aside className="rounded-xl border border-line p-4">
            <h3 className="text-[15px] font-semibold">Next 7 days</h3>
            {upcoming.length === 0 ? (
              <p className="mt-3 text-[13px] text-muted">Nothing on the team calendar this week.</p>
            ) : (
              <ol className="mt-2 space-y-3">
                {Array.from({ length: 7 }, (_, n) => addDays(startOfDay(new Date()), n)).map((d) => {
                  const list = upcoming.filter((i) => isSameDay(i.start, d))
                  if (!list.length) return null
                  return (
                    <li key={d.toISOString()}>
                      <div className="mb-1 text-[11px] font-semibold tracking-wide text-subtle uppercase">{isToday(d) ? 'Today' : format(d, 'EEEE d MMM')}</div>
                      <ul className="space-y-0.5">
                        {list.map((i) => (
                          <li key={i.key}>
                            <button onClick={() => setSelected(i)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-hover">
                              <span className={cn('size-2 shrink-0 rounded-full border', KIND_STYLE[i.kind])} />
                              <span className="min-w-0 flex-1 truncate">{i.title}</span>
                              <span className="shrink-0 text-[12px] text-subtle tabular-nums">{i.allDay ? 'All day' : format(i.start, 'H:mm')}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </li>
                  )
                })}
              </ol>
            )}
          </aside>
        </div>
      </div>

      {selected && (
        <ItemDetail
          key={selected.key}
          item={selected}
          onClose={() => setSelected(null)}
          onEdit={(e) => {
            setSelected(null)
            setEditing({ event: e, day: null })
          }}
        />
      )}
      {editing && <EventEditor key={editing.event?.id ?? 'new'} event={editing.event} day={editing.day} onClose={() => setEditing(null)} />}

      <ConfirmDialog
        open={confirmDisconnect}
        onClose={() => setConfirmDisconnect(false)}
        title="Disconnect your Google Calendar?"
        confirmLabel="Disconnect"
        danger
        onConfirm={async () => {
          await disconnect().catch((e: Error) => toast({ title: 'Couldn’t disconnect', description: e.message, tone: 'error' }))
          setConfirmDisconnect(false)
        }}
      >
        Team events are removed from your Google Calendar and stop being added, {me.name.split(' ')[0]}. The team calendar here doesn’t change.
      </ConfirmDialog>
    </div>
  )
}
