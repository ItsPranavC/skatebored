import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { differenceInCalendarDays } from 'date-fns'
import { ChevronDown, ChevronRight, Clock, Columns3, MoreHorizontal, Settings2, Target, Maximize2 } from 'lucide-react'
import type { Issue, Priority, Project, Sprint } from '@/types'
import { useMe, useProjectByKey, useStore } from '@/store/store'
import { byRank, cn, fmtDate, PRIORITIES, sumPoints } from '@/lib/utils'
import { Avatar, PriorityIcon, StatusLozenge, useIssueModal } from '@/components/jira'
import { Menu, Select, Tooltip } from '@/components/ui/overlay'
import { Button, EmptyState, PillButton } from '@/components/ui/primitives'
import { IssueCard } from '@/features/board/IssueCard'
import { EMPTY_FILTERS, FilterBar, applyFilters, usePersistentState, type IssueFilters } from '@/features/board/filters'
import { ContextMenu, useContextMenu, useIssueMenu } from '@/features/board/issueMenu'
import { QuickCreate } from '@/features/board/QuickCreate'
import { multiContainerCollision } from '@/features/board/collision'
import { CompleteSprintModal, EditSprintModal } from '@/features/backlog/SprintModals'

type GroupBy = 'none' | 'assignee' | 'epic' | 'subtask' | 'priority'

interface Lane {
  id: string
  kind: GroupBy
  title: ReactNode
  issues: Issue[]
}

const CELL_SEP = '|'
const cellId = (lane: string, col: string) => `${lane}${CELL_SEP}${col}`
const parseCell = (id: string) => {
  const [lane, col] = id.split(CELL_SEP)
  return { lane: lane!, col: col! }
}


export default function BoardPage() {
  const { projectKey } = useParams()
  const project = useProjectByKey(projectKey)!
  const sprints = useStore((s) => s.sprints)
  const allIssues = useStore((s) => s.issues)
  const activeSprints = useMemo(() => sprints.filter((s) => s.projectId === project.id && s.state === 'active').sort((a, b) => a.order - b.order), [sprints, project.id])
  const [sprintId, setSprintId] = useState<string | null>(null)
  const sprint = activeSprints.find((s) => s.id === sprintId) ?? activeSprints[0] ?? null
  const [completeOpen, setCompleteOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const navigate = useNavigate()

  const isKanban = project.type === 'kanban'
  const daysLeft = sprint?.endDate ? differenceInCalendarDays(new Date(sprint.endDate), new Date()) : null

  if (!isKanban && !sprint) {
    const future = sprints.filter((s) => s.projectId === project.id && s.state === 'future')
    return (
      <div className="flex min-h-full flex-col">
        <BoardHeader project={project} title="Active sprints" />
        <EmptyState
          icon="🛹"
          title="Get started in the backlog"
          action={<PillButton onClick={() => navigate(`/projects/${project.key}/backlog`)}>Go to backlog</PillButton>}
        >
          {future.length
            ? `There's no active sprint. Plan ${future[0]!.name} in the backlog, then start it to see its issues here.`
            : 'Plan and start a sprint to see issues here. Create a sprint in the backlog, drag issues into it, and press Start sprint.'}
        </EmptyState>
      </div>
    )
  }

  const sprintIssues = sprint ? allIssues.filter((i) => i.sprintId === sprint.id && i.type !== 'subtask' && i.type !== 'epic') : []
  const doneIds = new Set(project.statuses.filter((s) => s.category === 'done').map((s) => s.id))

  return (
    <div className="flex h-full min-h-0 flex-col">
      <BoardHeader
        project={project}
        title={isKanban ? `${project.key} board` : sprint!.name}
        right={
          !isKanban &&
          sprint && (
            <>
              {activeSprints.length > 1 && (
                <div className="w-48">
                  <Select value={sprint.id} onChange={setSprintId} options={activeSprints.map((s) => ({ value: s.id, label: s.name }))} />
                </div>
              )}
              {daysLeft != null && (
                <Tooltip label={`${fmtDate(sprint.startDate)} – ${fmtDate(sprint.endDate)}`} side="bottom">
                  <span className={cn('inline-flex items-center gap-1.5 text-[13px]', daysLeft < 0 ? 'text-accent' : 'text-muted')}>
                    <Clock className="size-4" />
                    {daysLeft < 0 ? `${-daysLeft} days overdue` : daysLeft === 0 ? 'Ends today' : `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} remaining`}
                  </span>
                </Tooltip>
              )}
              <Button variant="default" onClick={() => setCompleteOpen(true)}>
                Complete sprint
              </Button>
              <Menu
                trigger={<Button variant="default" aria-label="Sprint actions" icon={<MoreHorizontal className="size-4" />} />}
                items={[
                  { label: 'Edit sprint', onClick: () => setEditOpen(true) },
                  { label: 'Manage columns', icon: <Columns3 className="size-4" />, onClick: () => navigate(`/projects/${project.key}/settings/columns`) },
                  { label: 'Go to backlog', onClick: () => navigate(`/projects/${project.key}/backlog`) },
                  { label: 'Sprint reports', onClick: () => navigate(`/projects/${project.key}/reports`) },
                ]}
              />
            </>
          )
        }
      >
        {!isKanban && sprint && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted">
            {sprint.goal && (
              <span className="inline-flex items-center gap-1.5">
                <Target className="size-4 text-accent" />
                <span className="text-fg">{sprint.goal}</span>
              </span>
            )}
            {project.estimation === 'points' && (
              <span>
                {sumPoints(sprintIssues.filter((i) => doneIds.has(i.statusId)))} of {sumPoints(sprintIssues)} points done
              </span>
            )}
          </div>
        )}
        {isKanban && <p className="mt-1.5 text-[13px] text-muted">Continuous flow · completed work stays visible for 14 days</p>}
      </BoardHeader>
      <Board key={`${project.id}:${sprint?.id ?? 'kanban'}`} project={project} sprint={sprint} />
      <CompleteSprintModal sprint={sprint} open={completeOpen} onClose={() => setCompleteOpen(false)} />
      <EditSprintModal sprint={sprint} open={editOpen} onClose={() => setEditOpen(false)} />
    </div>
  )
}

function BoardHeader({ project, title, right, children }: { project: Project; title: ReactNode; right?: ReactNode; children?: ReactNode }) {
  return (
    <div className="px-8 pt-6 pb-3">
      <div className="mb-2 flex items-center gap-1.5 text-[13px] text-muted">
        <Link to="/projects" className="hover:text-fg hover:underline">
          Projects
        </Link>
        <span>/</span>
        <Link to={`/projects/${project.key}/board`} className="hover:text-fg hover:underline">
          {project.name}
        </Link>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="display text-[28px]">{title}</h1>
        {right && <div className="flex items-center gap-2">{right}</div>}
      </div>
      {children}
    </div>
  )
}

// ───────────────────────────── Board body ─────────────────────────────

function Board({ project, sprint }: { project: Project; sprint: Sprint | null }) {
  const me = useMe()
  const allIssues = useStore((s) => s.issues)
  const users = useStore((s) => s.users)
  const history = useStore((s) => s.history)
  const updateIssue = useStore((s) => s.updateIssue)
  const rankIssues = useStore((s) => s.rankIssues)
  const { open: openIssue, selectedKey } = useIssueModal()
  const [filters, setFilters] = useState<IssueFilters>(EMPTY_FILTERS)
  const [groupBy, setGroupBy] = usePersistentState<GroupBy>(`sb.board.group.${project.id}`, 'none')
  const [collapsedCols, setCollapsedCols] = usePersistentState<string[]>(`sb.board.cols.${project.id}`, [])
  const [showLabels, setShowLabels] = usePersistentState(`sb.board.labels`, true)
  const [showDays, setShowDays] = usePersistentState(`sb.board.days`, true)
  const [collapsedLanes, setCollapsedLanes] = useState<string[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [overCell, setOverCell] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const menu = useIssueMenu(project)
  const ctx = useContextMenu()

  const byId = useMemo(() => new Map(allIssues.map((i) => [i.id, i])), [allIssues])
  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users])
  const doneIds = useMemo(() => new Set(project.statuses.filter((s) => s.category === 'done').map((s) => s.id)), [project.statuses])

  // Everything that belongs on this board (pre-filter).
  const boardIssues = useMemo(() => {
    if (project.type === 'kanban') {
      const cutoff = Date.now() - 14 * 864e5
      return allIssues.filter(
        (i) => i.projectId === project.id && i.type !== 'epic' && (!doneIds.has(i.statusId) || (i.resolvedAt && Date.parse(i.resolvedAt) >= cutoff)),
      )
    }
    return allIssues.filter((i) => i.sprintId === sprint?.id && i.type !== 'epic')
  }, [allIssues, project, sprint, doneIds])

  const visible = useMemo(() => applyFilters(boardIssues, filters, me.id, allIssues).sort(byRank), [boardIssues, filters, me.id, allIssues])

  // Subtask progress per parent
  const subtaskStats = useMemo(() => {
    const m = new Map<string, { done: number; total: number }>()
    for (const i of allIssues) {
      if (!i.parentId) continue
      const s = m.get(i.parentId) ?? { done: 0, total: 0 }
      s.total++
      if (doneIds.has(i.statusId)) s.done++
      m.set(i.parentId, s)
    }
    return m
  }, [allIssues, doneIds])

  // Days since the last status change
  const daysInColumn = useMemo(() => {
    const last = new Map<string, number>()
    for (const h of history) {
      if (h.field !== 'status' && h.field !== 'created') continue
      const t = Date.parse(h.createdAt)
      if ((last.get(h.issueId) ?? 0) < t) last.set(h.issueId, t)
    }
    const m = new Map<string, number>()
    for (const i of boardIssues) m.set(i.id, Math.floor((Date.now() - (last.get(i.id) ?? Date.parse(i.createdAt))) / 864e5))
    return m
  }, [history, boardIssues])

  const epicOf = useCallback((i: Issue) => {
    const id = i.epicId ?? (i.parentId ? byId.get(i.parentId)?.epicId : null)
    return id ? byId.get(id) : undefined
  }, [byId])

  const lanes: Lane[] = useMemo(() => {
    switch (groupBy) {
      case 'assignee': {
        const ids = Array.from(new Set(visible.map((i) => i.assigneeId ?? '__none')))
        ids.sort((a, b) => (a === '__none' ? 1 : b === '__none' ? -1 : a === me.id ? -1 : b === me.id ? 1 : (userById.get(a)?.name ?? '').localeCompare(userById.get(b)?.name ?? '')))
        return ids.map((id) => {
          const u = userById.get(id)
          return {
            id,
            kind: groupBy,
            title: (
              <span className="flex items-center gap-2">
                <Avatar user={u} size="sm" showTooltip={false} />
                <span className="font-semibold">{u ? (u.id === me.id ? `${u.name} (you)` : u.name) : 'Unassigned'}</span>
              </span>
            ),
            issues: visible.filter((i) => (i.assigneeId ?? '__none') === id),
          }
        })
      }
      case 'epic': {
        const ids = Array.from(new Set(visible.map((i) => epicOf(i)?.id ?? '__none')))
        ids.sort((a, b) => (a === '__none' ? 1 : b === '__none' ? -1 : (byId.get(a)?.rank ?? 0) - (byId.get(b)?.rank ?? 0)))
        return ids.map((id) => {
          const e = byId.get(id)
          return {
            id,
            kind: groupBy,
            title: e ? (
              <span className="flex items-center gap-2">
                <span className="size-3 rounded-sm" style={{ background: e.color ?? '#b48cff' }} />
                <span className="font-semibold">{e.summary}</span>
                <span className="text-xs text-subtle">{e.key}</span>
              </span>
            ) : (
              <span className="font-semibold">Issues without epic</span>
            ),
            issues: visible.filter((i) => (epicOf(i)?.id ?? '__none') === id),
          }
        })
      }
      case 'priority':
        return PRIORITIES.filter((p) => visible.some((i) => i.priority === p.id)).map((p) => ({
          id: p.id,
          kind: groupBy,
          title: (
            <span className="flex items-center gap-2">
              <PriorityIcon priority={p.id} />
              <span className="font-semibold">{p.label}</span>
            </span>
          ),
          issues: visible.filter((i) => i.priority === p.id),
        }))
      case 'subtask': {
        const parents = visible.filter((i) => i.type !== 'subtask' && visible.some((s) => s.parentId === i.id))
        const parentIds = new Set(parents.map((p) => p.id))
        const out: Lane[] = parents.map((p) => ({
          id: p.id,
          kind: groupBy,
          title: (
            <span className="flex min-w-0 items-center gap-2">
              <span className="text-xs font-medium text-muted">{p.key}</span>
              <span className="truncate font-semibold">{p.summary}</span>
              <StatusLozenge status={project.statuses.find((s) => s.id === p.statusId)} />
            </span>
          ),
          issues: visible.filter((i) => i.parentId === p.id),
        }))
        const others = visible.filter((i) => !parentIds.has(i.id) && !(i.parentId && parentIds.has(i.parentId)))
        if (others.length || !out.length) out.push({ id: '__other', kind: groupBy, title: <span className="font-semibold">Other issues</span>, issues: others })
        return out
      }
      default:
        return [{ id: '__all', kind: 'none', title: null, issues: visible }]
    }
  }, [groupBy, visible, me.id, userById, byId, epicOf, project.statuses])

  const columns = project.columns
  const cellIssues = useCallback(
    (lane: Lane, colId: string) => {
      const col = columns.find((c) => c.id === colId)
      return col ? lane.issues.filter((i) => col.statusIds.includes(i.statusId)) : []
    },
    [columns],
  )

  // Flattened order for j/k navigation
  const order = useMemo(
    () => lanes.filter((l) => !collapsedLanes.includes(l.id)).flatMap((l) => columns.filter((c) => !collapsedCols.includes(c.id)).flatMap((c) => cellIssues(l, c.id))),
    [lanes, columns, collapsedLanes, collapsedCols, cellIssues],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.metaKey || e.ctrlKey || e.altKey || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable || document.querySelector('[role="dialog"]')) return
      if (e.key === 'j' || e.key === 'k') {
        e.preventDefault()
        const idx = order.findIndex((i) => i.id === selectedId)
        const next = e.key === 'j' ? Math.min(order.length - 1, idx + 1) : Math.max(0, idx < 0 ? 0 : idx - 1)
        const issue = order[next]
        if (issue) {
          setSelectedId(issue.id)
          document.querySelector(`[data-issue-card="${issue.id}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
        }
      } else if (e.key === 'Enter' && selectedId) {
        const issue = byId.get(selectedId)
        if (issue) openIssue(issue.key)
      } else if (e.key === 'f') {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [order, selectedId, byId, openIssue])

  // ─────────── drag & drop ───────────
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))

  const containerOf = (id: string | number | undefined, data?: { current?: Record<string, unknown> | null }): string | null => {
    if (id == null) return null
    const sortable = data?.current?.sortable as { containerId?: string } | undefined
    if (sortable?.containerId) return String(sortable.containerId)
    const s = String(id)
    return s.includes(CELL_SEP) ? s : null
  }

  const onDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id))
    setSelectedId(String(e.active.id))
  }
  const onDragOver = (e: DragOverEvent) => setOverCell(containerOf(e.over?.id, e.over?.data))
  const onDragCancel = () => {
    setActiveId(null)
    setOverCell(null)
  }
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null)
    setOverCell(null)
    const { active, over } = e
    if (!over) return
    const issue = byId.get(String(active.id))
    if (!issue) return
    const from = containerOf(active.id, active.data)
    const to = containerOf(over.id, over.data)
    if (!from || !to) return
    const target = parseCell(to)
    const source = parseCell(from)
    const lane = lanes.find((l) => l.id === target.lane)
    const col = columns.find((c) => c.id === target.col)
    if (!lane || !col) return

    const patch: Partial<Issue> = {}
    if (!col.statusIds.includes(issue.statusId) && col.statusIds[0]) patch.statusId = col.statusIds[0]
    if (target.lane !== source.lane) {
      if (groupBy === 'assignee') patch.assigneeId = target.lane === '__none' ? null : target.lane
      if (groupBy === 'priority') patch.priority = target.lane as Priority
      if (groupBy === 'epic' && issue.type !== 'subtask') patch.epicId = target.lane === '__none' ? null : target.lane
    }
    if (Object.keys(patch).length) updateIssue(issue.id, patch)

    const ids = cellIssues(lane, col.id).map((i) => i.id)
    const overIndex = (over.data.current?.sortable as { index?: number } | undefined)?.index
    if (from === to) {
      const oldIndex = ids.indexOf(issue.id)
      const newIndex = overIndex ?? ids.length - 1
      if (oldIndex >= 0 && newIndex !== oldIndex) rankIssues(arrayMove(ids, oldIndex, newIndex))
    } else {
      const without = ids.filter((id) => id !== issue.id)
      const at = overIndex == null ? without.length : Math.min(overIndex, without.length)
      without.splice(at, 0, issue.id)
      if (without.length > 1) rankIssues(without)
    }
  }

  const activeIssue = activeId ? byId.get(activeId) : null
  const firstColId = columns[0]?.id
  const colCounts = useMemo(() => new Map(columns.map((c) => [c.id, boardIssues.filter((i) => c.statusIds.includes(i.statusId)).length])), [columns, boardIssues])
  const gridTemplate = columns.map((c) => (collapsedCols.includes(c.id) ? '44px' : 'minmax(250px, 1fr)')).join(' ')

  const cardProps = (i: Issue) => ({
    issue: i,
    project,
    epic: groupBy === 'epic' ? null : epicOf(i),
    parent: i.parentId && groupBy !== 'subtask' ? byId.get(i.parentId) : null,
    assignee: i.assigneeId ? userById.get(i.assigneeId) : undefined,
    subtasks: subtaskStats.get(i.id),
    daysInColumn: showDays ? daysInColumn.get(i.id) : undefined,
    showLabels,
  })

  const contextIssue = ctx.state ? byId.get(ctx.state.issueId) : undefined

  return (
    <>
      <div className="px-8 pb-4">
        <FilterBar
          project={project}
          issues={boardIssues}
          filters={filters}
          onChange={setFilters}
          searchRef={searchRef}
          right={
            <>
              <span className="text-[13px] text-muted">Group by</span>
              <div className="w-36">
                <Select<GroupBy>
                  value={groupBy}
                  onChange={setGroupBy}
                  className="h-8 text-[13px]"
                  width={200}
                  options={[
                    { value: 'none', label: 'None' },
                    { value: 'assignee', label: 'Assignee' },
                    { value: 'epic', label: 'Epic' },
                    { value: 'subtask', label: 'Subtask' },
                    { value: 'priority', label: 'Priority' },
                  ]}
                />
              </div>
              <Menu
                width={240}
                trigger={<Button variant="default" aria-label="View settings" icon={<Settings2 className="size-4" />} />}
                items={[
                  { heading: true, label: 'Card layout' },
                  { label: 'Show labels', checked: showLabels, onClick: () => setShowLabels(!showLabels) },
                  { label: 'Show days in column', checked: showDays, onClick: () => setShowDays(!showDays) },
                  { divider: true, label: '' },
                  { label: 'Expand all columns', icon: <Maximize2 className="size-4" />, onClick: () => setCollapsedCols([]) },
                  { label: 'Expand all swimlanes', onClick: () => setCollapsedLanes([]) },
                  { label: 'Collapse all swimlanes', onClick: () => setCollapsedLanes(lanes.map((l) => l.id)) },
                ]}
              />
            </>
          }
        />
      </div>

      <DndContext sensors={sensors} collisionDetection={multiContainerCollision} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={onDragCancel}>
        <div className="min-h-0 flex-1 overflow-auto px-8 pb-8">
          <div className="grid min-w-max gap-x-2" style={{ gridTemplateColumns: gridTemplate }}>
            {/* Column headers */}
            {columns.map((c) => {
              const collapsed = collapsedCols.includes(c.id)
              const count = colCounts.get(c.id) ?? 0
              const over = c.wipLimit != null && count > c.wipLimit
              const isDoneCol = c.statusIds.some((s) => doneIds.has(s))
              return (
                <div
                  key={c.id}
                  className={cn(
                    'group/col sticky top-0 z-20 flex h-10 items-center gap-2 rounded-t-xl px-3 text-[12px] font-semibold tracking-wide uppercase',
                    over ? 'bg-[color-mix(in_srgb,var(--accent)_22%,var(--surface))] text-accent' : 'bg-surface text-muted',
                    collapsed && 'justify-center px-0',
                  )}
                >
                  {collapsed ? (
                    <Tooltip label={`Expand ${c.name}`}>
                      <button onClick={() => setCollapsedCols(collapsedCols.filter((x) => x !== c.id))} className="grid size-6 place-items-center rounded hover:bg-hover" aria-label={`Expand ${c.name}`}>
                        <ChevronRight className="size-4" />
                      </button>
                    </Tooltip>
                  ) : (
                    <>
                      <span className="truncate">{c.name}</span>
                      <span className={cn('rounded-full px-1.5 text-[11px] normal-case', over ? 'bg-accent text-ink' : 'bg-surface-3')}>
                        {count}
                        {c.wipLimit != null && ` / ${c.wipLimit}`}
                      </span>
                      {over && <span className="text-[11px] font-semibold normal-case">Max exceeded</span>}
                      {isDoneCol && !over && <span className="text-done-fg">✓</span>}
                      <span className="flex-1" />
                      <Tooltip label="Collapse column">
                        <button
                          onClick={() => setCollapsedCols([...collapsedCols, c.id])}
                          className="grid size-6 place-items-center rounded opacity-0 transition group-hover/col:opacity-100 hover:bg-hover focus:opacity-100"
                          aria-label={`Collapse ${c.name}`}
                        >
                          <ChevronDown className="size-4 rotate-90" />
                        </button>
                      </Tooltip>
                    </>
                  )}
                </div>
              )
            })}

            {lanes.map((lane, li) => {
              const laneCollapsed = collapsedLanes.includes(lane.id)
              return (
                <LaneRows
                  key={lane.id}
                  lane={lane}
                  collapsed={laneCollapsed}
                  onToggle={() => setCollapsedLanes(laneCollapsed ? collapsedLanes.filter((x) => x !== lane.id) : [...collapsedLanes, lane.id])}
                  columnsCount={columns.length}
                  points={project.estimation === 'points' ? sumPoints(lane.issues) : null}
                  last={li === lanes.length - 1}
                >
                  {columns.map((c) => {
                    const id = cellId(lane.id, c.id)
                    const items = cellIssues(lane, c.id)
                    const collapsed = collapsedCols.includes(c.id)
                    return (
                      <Cell key={id} id={id} highlight={!!activeId && overCell === id} collapsed={collapsed} count={items.length} name={c.name} last={li === lanes.length - 1}>
                        {!collapsed && (
                          <SortableContext id={id} items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                            {items.map((i) => (
                              <SortableCard
                                key={i.id}
                                {...cardProps(i)}
                                selected={selectedId === i.id || selectedKey === i.key}
                                onClick={() => {
                                  setSelectedId(i.id)
                                  openIssue(i.key)
                                }}
                                onContextMenu={(e) => {
                                  setSelectedId(i.id)
                                  ctx.openAt(e, i.id)
                                }}
                                menuItems={() => menu.items(i, { containerIds: items.map((x) => x.id), statusMoves: true })}
                              />
                            ))}
                          </SortableContext>
                        )}
                        {!collapsed && c.id === firstColId && li === 0 && (
                          <QuickCreate
                            variant="card"
                            projectId={project.id}
                            defaultType={project.type === 'kanban' ? 'task' : 'story'}
                            defaults={{
                              sprintId: sprint?.id ?? null,
                              statusId: c.statusIds[0],
                              ...(groupBy === 'assignee' && lane.id !== '__none' ? { assigneeId: lane.id } : {}),
                            }}
                          />
                        )}
                        {!collapsed && items.length === 0 && !(c.id === firstColId && li === 0) && (
                          <div className={cn('grid h-16 place-items-center rounded-lg border border-dashed text-[12px] text-subtle transition', activeId ? 'border-line-strong' : 'border-transparent')}>
                            {activeId ? 'Drop here' : ''}
                          </div>
                        )}
                      </Cell>
                    )
                  })}
                </LaneRows>
              )
            })}
          </div>
          {visible.length === 0 && boardIssues.length > 0 && (
            <div className="py-10 text-center text-[13px] text-muted">
              No issues match your filters.{' '}
              <button className="font-semibold text-accent hover:underline" onClick={() => setFilters(EMPTY_FILTERS)}>
                Clear filters
              </button>
            </div>
          )}
        </div>
        <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' }}>
          {activeIssue ? <IssueCard {...cardProps(activeIssue)} overlay className="w-[270px]" /> : null}
        </DragOverlay>
      </DndContext>

      <ContextMenu
        at={ctx.state?.at ?? null}
        onClose={ctx.close}
        items={contextIssue ? menu.items(contextIssue, { statusMoves: true, containerIds: order.filter((i) => i.statusId === contextIssue.statusId).map((i) => i.id) }) : []}
      />
      {menu.dialog}
    </>
  )
}

function LaneRows({
  lane,
  collapsed,
  onToggle,
  columnsCount,
  points,
  children,
}: {
  lane: Lane
  collapsed: boolean
  onToggle: () => void
  columnsCount: number
  points: number | null
  last: boolean
  children: ReactNode
}) {
  if (lane.kind === 'none') return <>{children}</>
  return (
    <>
      <div style={{ gridColumn: `1 / span ${columnsCount}` }} className="sticky left-0 mt-3 flex items-center">
        <button onClick={onToggle} className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-hover" aria-expanded={!collapsed}>
          {collapsed ? <ChevronRight className="size-4 shrink-0 text-muted" /> : <ChevronDown className="size-4 shrink-0 text-muted" />}
          {lane.title}
          <span className="shrink-0 text-[12px] text-subtle">
            {lane.issues.length} {lane.issues.length === 1 ? 'issue' : 'issues'}
            {points != null && points > 0 ? ` · ${points} pts` : ''}
          </span>
        </button>
      </div>
      {!collapsed && children}
    </>
  )
}

function Cell({ id, children, highlight, collapsed, count, name, last }: { id: string; children: ReactNode; highlight: boolean; collapsed: boolean; count: number; name: string; last: boolean }) {
  const { setNodeRef } = useDroppable({ id })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex flex-col gap-2 bg-surface p-2 transition-colors',
        last && 'rounded-b-xl',
        'min-h-[120px]',
        highlight && 'bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))] ring-2 ring-accent/50 ring-inset',
        collapsed && 'items-center',
      )}
    >
      {collapsed ? (
        <div className="flex flex-col items-center gap-2 pt-2 text-[11px] font-semibold tracking-wide text-muted uppercase">
          <span className="rounded-full bg-surface-3 px-1.5">{count}</span>
          <span className="[writing-mode:vertical-rl]">{name}</span>
        </div>
      ) : (
        children
      )}
    </div>
  )
}

function SortableCard(props: ComponentProps<typeof IssueCard>) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: props.issue.id })
  return (
    <IssueCard
      ref={setNodeRef}
      {...props}
      {...attributes}
      {...listeners}
      dragging={isDragging}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    />
  )
}

