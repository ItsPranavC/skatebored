import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  addDays,
  addMonths,
  addWeeks,
  differenceInMinutes,
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
import { CalendarDays, ChevronLeft, ChevronRight, ExternalLink, MapPin, MoreHorizontal, Plus, RefreshCw, Rocket, Timer, Users, Video } from 'lucide-react'
import { useMe, useStore } from '@/store/store'
import { toast } from '@/store/ui'
import { IssueTypeIcon, useIssueModal } from '@/components/jira'
import { ConfirmDialog, Menu, Modal, Select } from '@/components/ui/overlay'
import { Badge, Button, PageHeader, Spinner, Tabs } from '@/components/ui/primitives'
import { ProjectAvatar } from '@/layout/TopNav'
import { cn, isDone, timeAgo, toDate } from '@/lib/utils'
import { useGoogleCalendar, type GCalEvent } from '@/features/calendar/googleCalendar'
import type { Issue } from '@/types'

type View = 'month' | 'week'
type Kind = 'google' | 'issue' | 'sprint' | 'release'

/** One thing on the calendar: a Google event or a dated piece of workspace work. */
interface Item {
  key: string
  kind: Kind
  title: string
  start: Date
  end: Date | null
  allDay: boolean
  event?: GCalEvent
  issue?: Issue
  sub?: string
}

const KIND_STYLE: Record<Kind, string> = {
  google: 'bg-info/15 text-progress-fg border-info/40',
  issue: 'bg-accent-soft text-fg border-accent/50',
  sprint: 'bg-done text-done-fg border-success/40',
  release: 'bg-warn/15 text-warn border-warn/40',
}
const KIND_LABEL: Record<Kind, string> = { google: 'Google Calendar', issue: 'My due issues', sprint: 'Sprints', release: 'Releases' }
const POLL_MS = 60_000

function rangeOf(view: View, cursor: Date) {
  return view === 'month'
    ? { from: startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 }), to: endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 }) }
    : { from: startOfWeek(cursor, { weekStartsOn: 1 }), to: endOfWeek(cursor, { weekStartsOn: 1 }) }
}

/** Google all-day events are date-only strings; read them as local days, not UTC midnight. */
const parseEventDate = (v: string, allDay: boolean) => (allDay ? new Date(`${v.slice(0, 10)}T00:00:00`) : new Date(v))

function useWorkItems(): Item[] {
  const me = useMe()
  const issues = useStore((s) => s.issues)
  const projects = useStore((s) => s.projects)
  const sprints = useStore((s) => s.sprints)
  return useMemo(() => {
    const out: Item[] = []
    for (const i of issues) {
      const due = toDate(i.dueDate)
      if (!due || i.assigneeId !== me.id) continue
      const project = projects.find((p) => p.id === i.projectId)
      if (isDone(project, i)) continue
      out.push({ key: `i:${i.id}`, kind: 'issue', title: `${i.key} ${i.summary}`, start: due, end: null, allDay: true, issue: i, sub: project?.name })
    }
    for (const sp of sprints) {
      if (sp.state === 'closed') continue
      const project = projects.find((p) => p.id === sp.projectId)
      const s = toDate(sp.startDate)
      const e = toDate(sp.endDate)
      if (s) out.push({ key: `ss:${sp.id}`, kind: 'sprint', title: `${sp.name} starts`, start: s, end: null, allDay: true, sub: project?.name })
      if (e) out.push({ key: `se:${sp.id}`, kind: 'sprint', title: `${sp.name} ends`, start: e, end: null, allDay: true, sub: project?.name })
    }
    for (const p of projects)
      for (const v of p.versions) {
        const d = toDate(v.releaseDate)
        if (d && !v.released && !v.archived) out.push({ key: `v:${v.id}`, kind: 'release', title: `Release ${v.name}`, start: d, end: null, allDay: true, sub: p.name })
      }
    return out
  }, [issues, projects, sprints, me.id])
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
  const declined = item.event?.response === 'declined'
  return (
    <button
      onClick={onClick}
      title={item.title}
      className={cn('flex w-full items-center gap-1 truncate rounded-md border-l-2 px-1.5 py-0.5 text-left text-[11.5px] leading-tight transition hover:brightness-125', KIND_STYLE[item.kind], declined && 'line-through opacity-50')}
    >
      {!item.allDay && <span className="shrink-0 tabular-nums opacity-80">{format(item.start, 'H:mm')}</span>}
      <span className="truncate">{item.title}</span>
    </button>
  )
}

function ConnectCard({ busy, onConnect }: { busy: boolean; onConnect: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-accent/40 bg-accent-soft p-4">
      <div className="grid size-10 place-items-center rounded-full bg-accent text-ink">
        <CalendarDays className="size-5" />
      </div>
      <div className="min-w-[220px] flex-1">
        <div className="font-semibold">Bring your Google Calendar in</div>
        <div className="text-[13px] text-muted">See meetings next to sprint work. New events show up here automatically — only you can see them.</div>
      </div>
      <Button variant="primary" size="md" disabled={busy} onClick={onConnect}>
        Connect Google Calendar
      </Button>
    </div>
  )
}

function ItemDetail({ item, onClose }: { item: Item | null; onClose: () => void }) {
  const projects = useStore((s) => s.projects)
  const createIssue = useStore((s) => s.createIssue)
  const me = useMe()
  const status = useGoogleCalendar((s) => s.status)
  const addEvent = useGoogleCalendar((s) => s.addEvent)
  const { open: openIssue } = useIssueModal()
  const [projectId, setProjectId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const projectOptions = useMemo(() => projects.map((p) => ({ value: p.id, label: p.name, icon: <ProjectAvatar project={p} size={18} /> })), [projects])
  if (!item) return null
  const e = item.event
  const when = item.allDay
    ? format(item.start, 'EEEE d MMMM')
    : `${format(item.start, 'EEEE d MMMM · H:mm')}${item.end ? `–${format(item.end, 'H:mm')}` : ''}`

  const toIssue = () => {
    const pid = projectId ?? projects[0]?.id
    if (!pid || !e) return
    const issue = createIssue({
      projectId: pid,
      type: 'task',
      summary: e.title,
      description: [e.description, e.htmlLink ? `From Google Calendar: ${e.htmlLink}` : ''].filter(Boolean).join('\n\n'),
      dueDate: format(item.start, 'yyyy-MM-dd'),
      assigneeId: me.id,
    })
    toast({ title: `Created ${issue.key}`, tone: 'success', action: { label: 'Open', onClick: () => openIssue(issue.key) } })
    onClose()
  }

  const toGoogle = async () => {
    setBusy(true)
    try {
      await addEvent({ title: item.title, description: item.issue ? `${item.issue.description}\n\n${window.location.origin}/browse/${item.issue.key}`.trim() : item.sub ?? '', start: format(item.start, "yyyy-MM-dd'T'09:00:00") })
      toast({ title: 'Added to your Google Calendar', description: `${format(item.start, 'EEE d MMM')}, 9:00–9:30`, tone: 'success' })
      onClose()
    } catch (err) {
      toast({ title: 'Couldn’t add it', description: (err as Error).message, tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      width={520}
      title={item.title}
      footer={
        <>
          {item.issue && (
            <Button
              variant="subtle"
              onClick={() => {
                openIssue(item.issue!.key)
                onClose()
              }}
            >
              Open issue
            </Button>
          )}
          {!e && status === 'connected' && (
            <Button variant="primary" disabled={busy} icon={<Plus className="size-4" />} onClick={() => void toGoogle()}>
              Add to Google Calendar
            </Button>
          )}
          {e?.htmlLink && (
            <Button variant="subtle" icon={<ExternalLink className="size-4" />} onClick={() => window.open(e.htmlLink!, '_blank', 'noopener')}>
              Open in Google
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-3 text-[13px]">
        <div className="flex items-center gap-2">
          <Badge tone={item.kind === 'google' ? 'info' : item.kind === 'sprint' ? 'success' : 'accent'}>{KIND_LABEL[item.kind]}</Badge>
          <span className="text-muted">{when}</span>
        </div>
        {item.sub && <div className="text-muted">{item.sub}</div>}
        {e?.location && (
          <div className="flex items-center gap-2 text-muted">
            <MapPin className="size-4" /> {e.location}
          </div>
        )}
        {e?.meetLink && (
          <a href={e.meetLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-accent hover:underline">
            <Video className="size-4" /> Join video call
          </a>
        )}
        {!!e?.attendees && (
          <div className="flex items-center gap-2 text-muted">
            <Users className="size-4" /> {e.attendees} guests{e.response && e.response !== 'accepted' ? ` · you: ${e.response === 'needsAction' ? 'not replied' : e.response}` : ''}
          </div>
        )}
        {e?.description && <p className="max-h-40 overflow-auto rounded-lg bg-surface-2 p-3 whitespace-pre-wrap text-muted">{e.description}</p>}
        {e && projects.length > 0 && (
          <div className="rounded-lg border border-line p-3">
            <div className="mb-2 font-semibold">Track it as an issue</div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={projectId ?? projects[0]!.id} options={projectOptions} onChange={setProjectId} width={240} />
              <Button variant="primary" icon={<Plus className="size-4" />} onClick={toIssue}>
                Create issue
              </Button>
            </div>
            <p className="mt-2 text-[12px] text-subtle">Assigned to you, due on the event’s date.</p>
          </div>
        )}
      </div>
    </Modal>
  )
}

export default function CalendarPage() {
  const [params, setParams] = useSearchParams()
  const { status, events, syncedAt, syncing, error, connectedAt, checkStatus, connect, disconnect, sync } = useGoogleCalendar()
  const work = useWorkItems()
  const [view, setView] = useState<View>('month')
  const [cursor, setCursor] = useState(() => new Date())
  const [hidden, setHidden] = useState<Set<Kind>>(new Set())
  const [selected, setSelected] = useState<Item | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)
  const { from, to } = rangeOf(view, cursor)

  // Back from Google's consent screen.
  useEffect(() => {
    if (params.get('connected') !== '1') return
    setParams({}, { replace: true })
    void checkStatus().then((s) =>
      toast(s === 'connected' ? { title: 'Google Calendar connected', description: 'Your events will stay in sync here.', tone: 'success' } : { title: 'Google Calendar wasn’t connected', description: 'Try again, and allow calendar access.', tone: 'error' }),
    )
  }, [params, setParams, checkStatus])

  useEffect(() => {
    if (status === 'unknown') void checkStatus()
  }, [status, checkStatus])

  // Keep in sync: fetch the visible range now, then every minute and whenever the tab regains focus.
  useEffect(() => {
    if (status !== 'connected') return
    void sync(from, to)
    const tick = () => document.visibilityState === 'visible' && void sync()
    const id = setInterval(tick, POLL_MS)
    window.addEventListener('focus', tick)
    return () => {
      clearInterval(id)
      window.removeEventListener('focus', tick)
    }
  }, [status, from.getTime(), to.getTime()]) // eslint-disable-line react-hooks/exhaustive-deps

  const items = useMemo(() => {
    const google: Item[] = events.map((e) => ({
      key: `g:${e.id}`,
      kind: 'google',
      title: e.title,
      start: parseEventDate(e.start, e.allDay),
      end: e.end ? parseEventDate(e.end, e.allDay) : null,
      allDay: e.allDay,
      event: e,
    }))
    return [...google, ...work].filter((i) => !hidden.has(i.kind)).sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.getTime() - b.start.getTime())
  }, [events, work, hidden])

  const onDay = (d: Date) => items.filter((i) => (i.allDay && i.end ? i.start <= d && d < i.end : isSameDay(i.start, d)) || (i.allDay && !i.end && isSameDay(i.start, d)))

  const stats = useMemo(() => {
    const now = new Date()
    const meetings = events.filter((e) => !e.allDay && e.response !== 'declined').map((e) => ({ ...e, s: new Date(e.start), e: e.end ? new Date(e.end) : new Date(e.start) }))
    const today = meetings.filter((m) => isSameDay(m.s, now))
    const wkFrom = startOfWeek(now, { weekStartsOn: 1 })
    const wkTo = endOfWeek(now, { weekStartsOn: 1 })
    const weekMins = meetings.filter((m) => m.s >= wkFrom && m.s <= wkTo).reduce((n, m) => n + Math.max(0, differenceInMinutes(m.e, m.s)), 0)
    const next = meetings.find((m) => m.e > now)
    const due = work.filter((w) => w.kind === 'issue' && w.start >= startOfDay(now) && w.start <= wkTo).length
    const overdue = work.filter((w) => w.kind === 'issue' && w.start < startOfDay(now)).length
    return { today: today.length, todayLeft: today.filter((m) => m.e > now).length, weekHours: weekMins / 60, next, due, overdue }
  }, [events, work])

  const upcoming = useMemo(() => {
    const start = startOfDay(new Date())
    const end = endOfDay(addDays(start, 6))
    return items.filter((i) => (i.end ?? i.start) >= start && i.start <= end && !(i.kind === 'issue' && i.start < start))
  }, [items])

  const doConnect = async () => {
    setBusy(true)
    try {
      await connect()
    } catch (e) {
      setBusy(false)
      toast({ title: 'Couldn’t start Google sign-in', description: (e as Error).message, tone: 'error' })
    }
  }

  const step = (dir: 1 | -1) => setCursor((c) => (view === 'month' ? addMonths(c, dir) : addWeeks(c, dir)))
  const days: Date[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d)
  const connected = status === 'connected'

  return (
    <div className="mx-auto max-w-[1400px] pb-12">
      <PageHeader
        title="Calendar"
        actions={
          connected ? (
            <>
              <span className="flex items-center gap-1.5 text-[12px] text-subtle">
                <span className={cn('size-2 rounded-full', error ? 'bg-warn' : 'bg-success')} />
                {syncing ? 'Syncing…' : error ? 'Sync paused' : syncedAt ? `Synced ${timeAgo(syncedAt)}` : 'Connected'}
              </span>
              <Button variant="ghost" aria-label="Sync now" disabled={syncing} icon={<RefreshCw className={cn('size-4', syncing && 'animate-spin')} />} onClick={() => void sync()} />
              <Menu
                trigger={<Button variant="ghost" aria-label="Calendar settings" icon={<MoreHorizontal className="size-4" />} />}
                items={[
                  { heading: true, label: connectedAt ? `Connected ${timeAgo(connectedAt)}` : 'Google Calendar' },
                  { label: 'Disconnect Google Calendar', onClick: () => setConfirmDisconnect(true) },
                ]}
              />
            </>
          ) : undefined
        }
      >
        <p className="max-w-[680px] text-sm text-muted">Your Google Calendar alongside the work you own: issue due dates, sprint boundaries and releases.</p>
      </PageHeader>

      <div className="space-y-5 px-8">
        {status === 'disconnected' && <ConnectCard busy={busy} onConnect={() => void doConnect()} />}
        {status === 'unavailable' && <div className="rounded-xl border border-line p-4 text-[13px] text-muted">Google Calendar isn’t enabled on this workspace yet. Your sprint work is still shown below.</div>}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat icon={<CalendarDays className="size-3.5" />} label="Meetings today" value={connected ? stats.today : '—'} sub={connected ? `${stats.todayLeft} still to come` : 'Connect Google Calendar'} />
          <Stat icon={<Timer className="size-3.5" />} label="In meetings this week" value={connected ? `${stats.weekHours.toFixed(1)} h` : '—'} sub={connected ? `${Math.max(0, 40 - stats.weekHours).toFixed(0)} h left for focus work` : undefined} />
          <Stat
            icon={<Video className="size-3.5" />}
            label="Next up"
            value={stats.next ? stats.next.title : connected ? 'Nothing scheduled' : '—'}
            sub={stats.next ? (isToday(stats.next.s) ? `Today ${format(stats.next.s, 'H:mm')}` : format(stats.next.s, 'EEE d MMM · H:mm')) : undefined}
          />
          <Stat icon={<Rocket className="size-3.5" />} label="Due this week" value={stats.due} sub={stats.overdue ? <span className="text-accent">{stats.overdue} overdue</span> : 'Nothing overdue'} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="default" onClick={() => setCursor(new Date())}>
            Today
          </Button>
          <Button variant="ghost" aria-label="Previous" icon={<ChevronLeft className="size-4" />} onClick={() => step(-1)} />
          <Button variant="ghost" aria-label="Next" icon={<ChevronRight className="size-4" />} onClick={() => step(1)} />
          <h2 className="ml-1 text-[18px] font-semibold tracking-tight">{view === 'month' ? format(cursor, 'MMMM yyyy') : `${format(from, 'd MMM')} – ${format(to, 'd MMM yyyy')}`}</h2>
          {syncing && events.length === 0 && <Spinner className="ml-2 size-4" />}
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
                    className={cn('min-w-0 border-r border-b border-line p-1.5 [&:nth-child(7n)]:border-r-0', view === 'month' ? 'min-h-[112px]' : 'min-h-[420px]', view === 'month' && !isSameMonth(d, cursor) && 'bg-surface-2/50 opacity-60')}
                  >
                    <div className="mb-1 flex items-center justify-between px-0.5">
                      <span className={cn('grid size-6 place-items-center rounded-full text-[12px] tabular-nums', isToday(d) ? 'bg-accent font-semibold text-ink' : 'text-muted')}>{format(d, 'd')}</span>
                      {view === 'week' && <span className="text-[11px] text-subtle">{format(d, 'MMM')}</span>}
                    </div>
                    <div className="space-y-0.5">
                      {list.slice(0, max).map((i) => (
                        <Chip key={i.key + d.toISOString()} item={i} onClick={() => setSelected(i)} />
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
              <p className="mt-3 text-[13px] text-muted">Nothing on the calendar. A good week for deep work.</p>
            ) : (
              <ol className="mt-2 space-y-3">
                {Array.from({ length: 7 }, (_, n) => addDays(startOfDay(new Date()), n)).map((d) => {
                  const list = upcoming.filter((i) => onDay(d).includes(i))
                  if (!list.length) return null
                  return (
                    <li key={d.toISOString()}>
                      <div className="mb-1 text-[11px] font-semibold tracking-wide text-subtle uppercase">{isToday(d) ? 'Today' : format(d, 'EEEE d MMM')}</div>
                      <ul className="space-y-0.5">
                        {list.map((i) => (
                          <li key={i.key}>
                            <button onClick={() => setSelected(i)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-hover">
                              {i.issue ? <IssueTypeIcon type={i.issue.type} /> : <span className={cn('size-2 shrink-0 rounded-full border', KIND_STYLE[i.kind])} />}
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

      <ItemDetail key={selected?.key} item={selected} onClose={() => setSelected(null)} />

      <ConfirmDialog
        open={confirmDisconnect}
        onClose={() => setConfirmDisconnect(false)}
        title="Disconnect Google Calendar?"
        confirmLabel="Disconnect"
        danger
        onConfirm={async () => {
          await disconnect().catch((e: Error) => toast({ title: 'Couldn’t disconnect', description: e.message, tone: 'error' }))
          setConfirmDisconnect(false)
        }}
      >
        skatebored stops reading your calendar. Nothing in Google Calendar is deleted, and issues you created from events stay.
      </ConfirmDialog>
    </div>
  )
}
