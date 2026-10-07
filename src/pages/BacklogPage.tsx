import { useCallback, useMemo, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
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
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronDown, ChevronRight, MoreHorizontal, Pencil, Trash2, X, Layers } from 'lucide-react'
import type { Issue, Project, Sprint } from '@/types'
import { useMe, useProjectByKey, useStore } from '@/store/store'
import { toast } from '@/store/ui'
import { byRank, cn, fmtDate, sumPoints } from '@/lib/utils'
import { Avatar, EpicTag, FlagIcon, IssueTypeIcon, LabelTag, PriorityIcon, StatusLozenge, useIssueModal } from '@/components/jira'
import { ConfirmDialog, Menu, Tooltip, type MenuItem } from '@/components/ui/overlay'
import { Button, ProgressBar } from '@/components/ui/primitives'
import { EMPTY_FILTERS, FilterBar, applyFilters, hasActiveFilters, usePersistentState, type IssueFilters } from '@/features/board/filters'
import { ContextMenu, useContextMenu, useIssueMenu } from '@/features/board/issueMenu'
import { QuickCreate } from '@/features/board/QuickCreate'
import { multiContainerCollision } from '@/features/board/collision'
import { CompleteSprintModal, EditSprintModal, StartSprintModal } from '@/features/backlog/SprintModals'

const BACKLOG = 'backlog'


export default function BacklogPage() {
  const { projectKey } = useParams()
  const project = useProjectByKey(projectKey)!
  if (project.type === 'kanban') return <Navigate to={`/projects/${project.key}/board`} replace />
  return <Backlog key={project.id} project={project} />
}

function Backlog({ project }: { project: Project }) {
  const me = useMe()
  const allIssues = useStore((s) => s.issues)
  const allSprints = useStore((s) => s.sprints)
  const users = useStore((s) => s.users)
  const moveToSprint = useStore((s) => s.moveToSprint)
  const rankIssues = useStore((s) => s.rankIssues)
  const createSprint = useStore((s) => s.createSprint)
  const deleteSprint = useStore((s) => s.deleteSprint)
  const { open: openIssue, selectedKey } = useIssueModal()

  const [filters, setFilters] = useState<IssueFilters>(EMPTY_FILTERS)
  const [epicPanel, setEpicPanel] = usePersistentState(`sb.backlog.epics.${project.id}`, false)
  const [collapsed, setCollapsed] = usePersistentState<string[]>(`sb.backlog.collapsed.${project.id}`, [])
  const [selection, setSelection] = useState<string[]>([])
  const [anchor, setAnchor] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [overContainer, setOverContainer] = useState<string | null>(null)
  const [startFor, setStartFor] = useState<Sprint | null>(null)
  const [completeFor, setCompleteFor] = useState<Sprint | null>(null)
  const [editFor, setEditFor] = useState<Sprint | null>(null)
  const [deleteFor, setDeleteFor] = useState<Sprint | null>(null)
  const menu = useIssueMenu(project)
  const ctx = useContextMenu()

  const byId = useMemo(() => new Map(allIssues.map((i) => [i.id, i])), [allIssues])
  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users])
  const doneIds = useMemo(() => new Set(project.statuses.filter((s) => s.category === 'done').map((s) => s.id)), [project.statuses])

  const sprints = useMemo(
    () =>
      allSprints
        .filter((s) => s.projectId === project.id && s.state !== 'closed')
        .sort((a, b) => (a.state === b.state ? a.order - b.order : a.state === 'active' ? -1 : 1)),
    [allSprints, project.id],
  )
  const hasActive = sprints.some((s) => s.state === 'active')
  const firstFuture = sprints.find((s) => s.state === 'future')

  // Unfiltered contents per container
  const raw = useMemo(() => {
    const m = new Map<string, Issue[]>()
    for (const s of sprints) m.set(s.id, [])
    m.set(BACKLOG, [])
    for (const i of allIssues) {
      if (i.projectId !== project.id || i.type === 'subtask' || i.type === 'epic') continue
      if (i.sprintId && m.has(i.sprintId)) m.get(i.sprintId)!.push(i)
      else if (!i.sprintId && !doneIds.has(i.statusId)) m.get(BACKLOG)!.push(i)
    }
    for (const list of m.values()) list.sort(byRank)
    return m
  }, [allIssues, sprints, project.id, doneIds])

  const visibleIn = useCallback((cid: string) => applyFilters(raw.get(cid) ?? [], filters, me.id, allIssues), [raw, filters, me.id, allIssues])
  const allVisible = useMemo(() => [...sprints.map((s) => s.id), BACKLOG].flatMap((cid) => visibleIn(cid)), [sprints, visibleIn])
  const filterIssues = useMemo(() => [...raw.values()].flat(), [raw])

  const containerOfIssue = (id: string) => {
    const i = byId.get(id)
    if (!i) return null
    return i.sprintId && raw.has(i.sprintId) ? i.sprintId : BACKLOG
  }

  // ─────────── selection ───────────
  const onRowClick = (e: ReactMouseEvent, issue: Issue, cid: string) => {
    if (e.metaKey || e.ctrlKey) {
      setSelection((sel) => (sel.includes(issue.id) ? sel.filter((x) => x !== issue.id) : [...sel, issue.id]))
      setAnchor(issue.id)
      return
    }
    if (e.shiftKey && anchor && containerOfIssue(anchor) === cid) {
      const ids = visibleIn(cid).map((i) => i.id)
      const a = ids.indexOf(anchor)
      const b = ids.indexOf(issue.id)
      if (a >= 0 && b >= 0) {
        setSelection(ids.slice(Math.min(a, b), Math.max(a, b) + 1))
        return
      }
    }
    setSelection([issue.id])
    setAnchor(issue.id)
    openIssue(issue.key)
  }

  // ─────────── drag & drop ───────────
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const containerOf = (id: string | number | undefined, data?: { current?: Record<string, unknown> | null }) => {
    if (id == null) return null
    const sortable = data?.current?.sortable as { containerId?: string } | undefined
    if (sortable?.containerId) return String(sortable.containerId)
    const s = String(id)
    return s === BACKLOG || raw.has(s) ? s : null
  }
  const moving = (activeIdent: string) => {
    if (!selection.includes(activeIdent) || selection.length < 2) return [activeIdent]
    const order = new Map(allVisible.map((i, k) => [i.id, k]))
    return [...selection].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0))
  }

  const onDragStart = (e: DragStartEvent) => {
    const id = String(e.active.id)
    setActiveId(id)
    if (!selection.includes(id)) setSelection([id])
  }
  const onDragOver = (e: DragOverEvent) => setOverContainer(containerOf(e.over?.id, e.over?.data))
  const onDragCancel = () => {
    setActiveId(null)
    setOverContainer(null)
  }
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null)
    setOverContainer(null)
    const { active, over } = e
    if (!over) return
    const to = containerOf(over.id, over.data)
    if (!to) return
    const ids = moving(String(active.id))
    const targetSprint = to === BACKLOG ? null : to
    const changing = ids.filter((id) => (byId.get(id)?.sprintId ?? null) !== targetSprint)
    if (changing.length) moveToSprint(changing, targetSprint)

    // Re-rank inside the target container.
    const current = visibleIn(to).map((i) => i.id)
    const without = current.filter((id) => !ids.includes(id))
    let at = without.length
    const overId = String(over.id)
    if (overId !== to && !ids.includes(overId)) {
      const overPos = without.indexOf(overId)
      const activePos = current.indexOf(String(active.id))
      const overOrig = current.indexOf(overId)
      // dropping below an item when dragging downward inside the same list
      at = overPos < 0 ? without.length : activePos >= 0 && activePos < overOrig ? overPos + 1 : overPos
    } else if (overId !== to && ids.includes(overId)) {
      at = Math.min(current.indexOf(overId), without.length)
    }
    without.splice(at, 0, ...ids)
    if (without.length > 1) rankIssues(without)
    if (changing.length) {
      const name = targetSprint ? sprints.find((s) => s.id === targetSprint)?.name : 'Backlog'
      toast({ title: `${changing.length === 1 ? byId.get(changing[0]!)?.key : `${changing.length} issues`} moved to ${name}` })
    }
  }

  const activeIssue = activeId ? byId.get(activeId) : null
  const dragCount = activeId ? moving(activeId).length : 0
  const contextIssue = ctx.state ? byId.get(ctx.state.issueId) : undefined
  const isCollapsed = (id: string) => collapsed.includes(id)
  const toggleCollapsed = (id: string) => setCollapsed(isCollapsed(id) ? collapsed.filter((x) => x !== id) : [...collapsed, id])

  const rowMenu = (i: Issue, cid: string): MenuItem[] => menu.items(i, { containerIds: visibleIn(cid).map((x) => x.id), sprintMoves: true, selection })

  const renderRows = (cid: string) => {
    const list = visibleIn(cid)
    return (
      <SortableContext id={cid} items={list.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        {list.map((i) => (
          <SortableRow
            key={i.id}
            issue={i}
            project={project}
            epic={i.epicId ? byId.get(i.epicId) : undefined}
            assignee={i.assigneeId ? userById.get(i.assigneeId) : undefined}
            selected={selection.includes(i.id) || selectedKey === i.key}
            dimmed={!!activeId && selection.includes(i.id) && activeId !== i.id}
            done={doneIds.has(i.statusId)}
            onClick={(e) => onRowClick(e, i, cid)}
            onContextMenu={(e) => {
              if (!selection.includes(i.id)) setSelection([i.id])
              ctx.openAt(e, i.id)
            }}
            menuItems={() => rowMenu(i, cid)}
          />
        ))}
      </SortableContext>
    )
  }

  const filtered = hasActiveFilters(filters)
  const backlogRaw = raw.get(BACKLOG) ?? []
  const backlogVisible = visibleIn(BACKLOG)

  return (
    <div className="flex h-full min-h-0 flex-col">
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
        <h1 className="display text-[28px]">Backlog</h1>
      </div>
      <div className="px-8 pb-4">
        <FilterBar
          project={project}
          issues={filterIssues}
          filters={filters}
          onChange={setFilters}
          right={
            <Button variant="default" active={epicPanel} icon={<Layers className="size-4" />} onClick={() => setEpicPanel(!epicPanel)} aria-pressed={epicPanel}>
              Epic
            </Button>
          }
        />
      </div>

      <div className="flex min-h-0 flex-1 gap-4 px-8 pb-8">
        {epicPanel && (
          <EpicPanel
            project={project}
            selected={filters.epics}
            onToggle={(id) => setFilters({ ...filters, epics: filters.epics.includes(id) ? filters.epics.filter((x) => x !== id) : [...filters.epics, id] })}
            onClose={() => setEpicPanel(false)}
          />
        )}

        <DndContext sensors={sensors} collisionDetection={multiContainerCollision} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={onDragCancel}>
          <div className="min-w-0 flex-1 space-y-3 overflow-y-auto pr-1">
            {sprints.map((sprint) => {
              const all = raw.get(sprint.id) ?? []
              const list = visibleIn(sprint.id)
              const canStart = sprint.state === 'future' && !hasActive && sprint.id === firstFuture?.id
              return (
                <Container
                  key={sprint.id}
                  id={sprint.id}
                  highlight={!!activeId && overContainer === sprint.id}
                  collapsed={isCollapsed(sprint.id)}
                  onToggle={() => toggleCollapsed(sprint.id)}
                  title={
                    <>
                      <span className="font-semibold">{sprint.name}</span>
                      {sprint.state === 'active' && <span className="rounded bg-progress px-1.5 text-[10px] font-bold tracking-wide text-progress-fg uppercase">Active</span>}
                      {sprint.startDate && sprint.endDate ? (
                        <span className="text-muted">
                          {fmtDate(sprint.startDate, 'd MMM')} – {fmtDate(sprint.endDate, 'd MMM')}
                        </span>
                      ) : (
                        <button onClick={(e) => { e.stopPropagation(); setEditFor(sprint) }} className="inline-flex items-center gap-1 text-muted hover:text-fg hover:underline">
                          <Pencil className="size-3" /> Add dates
                        </button>
                      )}
                      <span className="text-subtle">
                        ({filtered && list.length !== all.length ? `${list.length} of ${all.length}` : all.length} {all.length === 1 ? 'issue' : 'issues'})
                      </span>
                    </>
                  }
                  goal={sprint.goal}
                  actions={
                    <>
                      <Totals project={project} issues={all} />
                      {sprint.state === 'active' ? (
                        <Button variant="default" onClick={() => setCompleteFor(sprint)}>
                          Complete sprint
                        </Button>
                      ) : (
                        <Tooltip label={canStart ? `Start ${sprint.name}` : hasActive ? 'Complete the active sprint first' : 'Start the sprint at the top of the backlog first'}>
                          <Button variant={canStart ? 'primary' : 'default'} disabled={!canStart} onClick={() => setStartFor(sprint)}>
                            Start sprint
                          </Button>
                        </Tooltip>
                      )}
                      <Menu
                        trigger={<Button variant="ghost" aria-label={`${sprint.name} actions`} icon={<MoreHorizontal className="size-4" />} />}
                        items={[
                          { label: 'Edit sprint', icon: <Pencil className="size-4" />, onClick: () => setEditFor(sprint) },
                          ...(sprint.state === 'future' ? [{ label: 'Delete sprint', icon: <Trash2 className="size-4" />, danger: true, onClick: () => setDeleteFor(sprint) }] : []),
                        ]}
                      />
                    </>
                  }
                >
                  {list.length ? (
                    renderRows(sprint.id)
                  ) : (
                    <SortableContext id={sprint.id} items={[]}>
                      <div
                        className={cn(
                          'grid h-20 place-items-center rounded-lg border-2 border-dashed text-[13px] transition',
                          activeId && overContainer === sprint.id ? 'border-accent text-accent' : 'border-line text-subtle',
                        )}
                      >
                        {all.length ? 'No issues match your filters' : 'Plan a sprint by dragging issues here, or create them below.'}
                      </div>
                    </SortableContext>
                  )}
                  <div className="pt-1">
                    <QuickCreate projectId={project.id} defaults={{ sprintId: sprint.id }} />
                  </div>
                </Container>
              )
            })}

            <Container
              id={BACKLOG}
              highlight={!!activeId && overContainer === BACKLOG}
              collapsed={isCollapsed(BACKLOG)}
              onToggle={() => toggleCollapsed(BACKLOG)}
              title={
                <>
                  <span className="font-semibold">Backlog</span>
                  <span className="text-subtle">
                    ({filtered && backlogVisible.length !== backlogRaw.length ? `${backlogVisible.length} of ${backlogRaw.length}` : backlogRaw.length}{' '}
                    {backlogRaw.length === 1 ? 'issue' : 'issues'})
                  </span>
                </>
              }
              actions={
                <>
                  <Totals project={project} issues={backlogRaw} />
                  <Button
                    variant="default"
                    onClick={() => {
                      const s = createSprint(project.id)
                      toast({ title: `${s.name} created`, tone: 'success' })
                    }}
                  >
                    Create sprint
                  </Button>
                </>
              }
            >
              {backlogVisible.length ? (
                renderRows(BACKLOG)
              ) : (
                <SortableContext id={BACKLOG} items={[]}>
                  <div
                    className={cn(
                      'grid h-20 place-items-center rounded-lg border-2 border-dashed text-[13px] transition',
                      activeId && overContainer === BACKLOG ? 'border-accent text-accent' : 'border-line text-subtle',
                    )}
                  >
                    {backlogRaw.length ? 'No issues match your filters' : 'Your backlog is empty. Nothing left to plan — nice.'}
                  </div>
                </SortableContext>
              )}
              <div className="pt-1">
                <QuickCreate projectId={project.id} defaults={{ sprintId: null }} />
              </div>
            </Container>

            {selection.length > 1 && (
              <div className="sticky bottom-0 z-10 flex items-center justify-between rounded-xl border border-line bg-surface-2 px-4 py-2.5 text-[13px] shadow-pop">
                <span>
                  <strong>{selection.length}</strong> issues selected · drag to move them together, or right-click for bulk actions
                </span>
                <Button variant="ghost" size="xs" onClick={() => setSelection([])}>
                  Clear
                </Button>
              </div>
            )}
          </div>

          <DragOverlay dropAnimation={{ duration: 160, easing: 'cubic-bezier(.2,.8,.2,1)' }}>
            {activeIssue ? (
              <div className="relative">
                <Row
                  issue={activeIssue}
                  project={project}
                  epic={activeIssue.epicId ? byId.get(activeIssue.epicId) : undefined}
                  assignee={activeIssue.assigneeId ? userById.get(activeIssue.assigneeId) : undefined}
                  done={doneIds.has(activeIssue.statusId)}
                  overlay
                />
                {dragCount > 1 && (
                  <span className="absolute -top-2 -right-2 grid size-6 place-items-center rounded-full bg-accent text-[11px] font-bold text-ink shadow-pop">{dragCount}</span>
                )}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      <ContextMenu at={ctx.state?.at ?? null} onClose={ctx.close} items={contextIssue ? rowMenu(contextIssue, containerOfIssue(contextIssue.id) ?? BACKLOG) : []} />
      {menu.dialog}
      <StartSprintModal sprint={startFor} open={!!startFor} onClose={() => setStartFor(null)} />
      <CompleteSprintModal sprint={completeFor} open={!!completeFor} onClose={() => setCompleteFor(null)} />
      <EditSprintModal sprint={editFor} open={!!editFor} onClose={() => setEditFor(null)} />
      <ConfirmDialog
        open={!!deleteFor}
        onClose={() => setDeleteFor(null)}
        onConfirm={() => {
          if (!deleteFor) return
          deleteSprint(deleteFor.id)
          toast({ title: `${deleteFor.name} deleted`, description: 'Its issues were moved to the backlog.' })
        }}
        title={`Delete ${deleteFor?.name ?? 'sprint'}?`}
      >
        The sprint will be removed and its {raw.get(deleteFor?.id ?? '')?.length ?? 0} issues will be moved to the backlog.
      </ConfirmDialog>
    </div>
  )
}

// ───────────────────────────── pieces ─────────────────────────────

function Totals({ project, issues }: { project: Project; issues: Issue[] }) {
  const cat = (c: string) => issues.filter((i) => project.statuses.find((s) => s.id === i.statusId)?.category === c)
  const pts = project.estimation === 'points'
  const val = (list: Issue[]) => (pts ? sumPoints(list) : list.length)
  const unit = pts ? 'story points' : 'issues'
  const items = [
    { label: 'To Do', v: val(cat('todo')), cls: 'bg-todo text-todo-fg' },
    { label: 'In Progress', v: val(cat('inprogress')), cls: 'bg-progress text-progress-fg' },
    { label: 'Done', v: val(cat('done')), cls: 'bg-done text-done-fg' },
  ]
  return (
    <span className="mr-1 hidden items-center gap-1 sm:flex">
      {items.map((t) => (
        <Tooltip key={t.label} label={`${t.label}: ${t.v} ${unit}`}>
          <span className={cn('grid h-5 min-w-6 place-items-center rounded-full px-1.5 text-[11px] font-bold', t.cls)}>{t.v}</span>
        </Tooltip>
      ))}
    </span>
  )
}

function Container({
  id,
  title,
  goal,
  actions,
  collapsed,
  onToggle,
  highlight,
  children,
}: {
  id: string
  title: ReactNode
  goal?: string
  actions?: ReactNode
  collapsed: boolean
  onToggle: () => void
  highlight: boolean
  children: ReactNode
}) {
  const { setNodeRef } = useDroppable({ id })
  return (
    <section
      ref={setNodeRef}
      className={cn('rounded-xl border bg-surface p-2 transition-colors', highlight ? 'border-accent/70 bg-[color-mix(in_srgb,var(--accent)_5%,var(--surface))]' : 'border-line')}
    >
      <header className="flex flex-wrap items-center gap-2 px-1 py-1">
        {/* div, not button: the title can contain its own buttons (e.g. "Add dates") */}
        <div
          role="button"
          tabIndex={0}
          onClick={onToggle}
          onKeyDown={(e) => {
            if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault()
              onToggle()
            }
          }}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md py-1 text-left text-[13.5px]"
          aria-expanded={!collapsed}
        >
          {collapsed ? <ChevronRight className="size-4 shrink-0 text-muted" /> : <ChevronDown className="size-4 shrink-0 text-muted" />}
          <span className="flex min-w-0 flex-wrap items-center gap-2">{title}</span>
        </div>
        <div className="flex items-center gap-1.5">{actions}</div>
      </header>
      {goal && !collapsed && <p className="px-8 pb-2 text-[13px] text-muted">{goal}</p>}
      {!collapsed && <div className="space-y-px">{children}</div>}
    </section>
  )
}

interface RowProps {
  issue: Issue
  project: Project
  epic?: Issue
  assignee?: ReturnType<typeof useMe>
  selected?: boolean
  dimmed?: boolean
  done: boolean
  overlay?: boolean
  onClick?: (e: ReactMouseEvent) => void
  onContextMenu?: (e: ReactMouseEvent) => void
  menuItems?: () => MenuItem[]
}

function Row({ issue, project, epic, assignee, selected, dimmed, done, overlay, onClick, onContextMenu, menuItems, ...rest }: RowProps & Record<string, unknown>) {
  const status = project.statuses.find((s) => s.id === issue.statusId)
  return (
    <div
      {...rest}
      onClick={onClick}
      onContextMenu={onContextMenu}
      data-issue-row={issue.id}
      className={cn(
        'group/row flex h-10 cursor-pointer items-center gap-2.5 rounded-lg border px-3 text-[13px] transition-colors select-none',
        selected ? 'border-accent/50 bg-accent-soft' : 'border-transparent bg-surface-2 hover:bg-surface-3',
        dimmed && 'opacity-40',
        overlay && 'w-[min(900px,70vw)] cursor-grabbing border-accent/60 bg-surface-3 shadow-pop',
      )}
    >
      <IssueTypeIcon type={issue.type} />
      <span className={cn('shrink-0 font-medium whitespace-nowrap text-muted', done && 'line-through')}>{issue.key}</span>
      <span className={cn('min-w-0 flex-1 truncate', done && 'text-muted')}>{issue.summary}</span>
      {issue.flagged && <FlagIcon />}
      <span className="hidden max-w-[40%] shrink items-center gap-1 overflow-hidden lg:flex">
        {issue.labels.slice(0, 2).map((l) => (
          <LabelTag key={l} label={l} />
        ))}
      </span>
      {epic && <EpicTag epic={epic} className="hidden md:inline-flex" />}
      <StatusLozenge status={status} className="w-[96px] shrink-0 justify-center" />
      <span className="grid w-7 shrink-0 place-items-center">
        {issue.storyPoints != null ? (
          <Tooltip label="Story points">
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-surface-3 px-1.5 text-[11px] font-semibold text-muted">{issue.storyPoints}</span>
          </Tooltip>
        ) : (
          <span className="text-[11px] text-subtle">–</span>
        )}
      </span>
      <PriorityIcon priority={issue.priority} />
      <Avatar user={assignee} size="sm" />
      {menuItems ? (
        <Menu
          trigger={
            <button
              onPointerDown={(e) => e.stopPropagation()}
              className="grid size-6 place-items-center rounded-md text-muted opacity-0 transition group-hover/row:opacity-100 hover:bg-active hover:text-fg focus:opacity-100"
              aria-label={`Actions for ${issue.key}`}
            >
              <MoreHorizontal className="size-4" />
            </button>
          }
          items={menuItems()}
        />
      ) : (
        <span className="w-6" />
      )}
    </div>
  )
}

function SortableRow(props: RowProps) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: props.issue.id })
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={cn(isDragging && 'opacity-30')}>
      <Row {...props} {...attributes} {...listeners} />
    </div>
  )
}

// ───────────────────────────── Epic panel ─────────────────────────────

function EpicPanel({ project, selected, onToggle, onClose }: { project: Project; selected: string[]; onToggle: (id: string) => void; onClose: () => void }) {
  const issues = useStore((s) => s.issues)
  const { open } = useIssueModal()
  const [expanded, setExpanded] = useState<string | null>(null)
  const doneIds = new Set(project.statuses.filter((s) => s.category === 'done').map((s) => s.id))
  const epics = issues.filter((i) => i.projectId === project.id && i.type === 'epic').sort(byRank)
  return (
    <aside className="flex w-72 shrink-0 flex-col overflow-hidden rounded-xl border border-line bg-surface">
      <header className="flex items-center justify-between px-4 pt-3 pb-2">
        <h2 className="text-[13px] font-semibold tracking-wide text-muted uppercase">Epic</h2>
        <button onClick={onClose} className="grid size-7 place-items-center rounded-md text-muted hover:bg-hover hover:text-fg" aria-label="Close epic panel">
          <X className="size-4" />
        </button>
      </header>
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-2 pb-2">
        <button
          onClick={() => onToggle('__none')}
          className={cn('w-full rounded-lg border px-3 py-2 text-left text-[13px] transition', selected.includes('__none') ? 'border-accent/60 bg-accent-soft' : 'border-line hover:bg-hover')}
        >
          Issues without epic
        </button>
        {epics.map((e) => {
          const kids = issues.filter((i) => i.epicId === e.id && i.type !== 'subtask')
          const done = kids.filter((k) => doneIds.has(k.statusId))
          const inProg = kids.filter((k) => project.statuses.find((s) => s.id === k.statusId)?.category === 'inprogress')
          const on = selected.includes(e.id)
          const isOpen = expanded === e.id
          return (
            <div
              key={e.id}
              className={cn('overflow-hidden rounded-lg border transition', on ? 'border-accent/60 bg-accent-soft' : 'border-line hover:bg-hover')}
              style={{ borderLeft: `4px solid ${e.color ?? '#b48cff'}` }}
            >
              <div className="flex items-start gap-1 px-2.5 py-2">
                <button
                  onClick={() => setExpanded(isOpen ? null : e.id)}
                  className="mt-0.5 grid size-5 shrink-0 place-items-center rounded text-muted hover:bg-active"
                  aria-label={isOpen ? 'Collapse epic details' : 'Expand epic details'}
                >
                  {isOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                </button>
                <button onClick={() => onToggle(e.id)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-[13px] font-semibold">{e.summary}</span>
                  <ProgressBar
                    className="mt-1.5 h-1.5"
                    segments={[
                      { value: done.length, color: 'var(--success)', label: 'Done' },
                      { value: inProg.length, color: 'var(--info)', label: 'In progress' },
                      { value: kids.length - done.length - inProg.length, color: 'var(--surface-3)', label: 'To do' },
                    ]}
                  />
                </button>
              </div>
              {isOpen && (
                <dl className="space-y-1 border-t border-line px-3 py-2 text-[12px]">
                  <div className="flex justify-between">
                    <dt className="text-subtle">Issues</dt>
                    <dd>{kids.length}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-subtle">Completed</dt>
                    <dd>{done.length}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-subtle">Points</dt>
                    <dd>
                      {sumPoints(done)} / {sumPoints(kids)}
                    </dd>
                  </div>
                  {e.startDate && (
                    <div className="flex justify-between">
                      <dt className="text-subtle">Start</dt>
                      <dd>{fmtDate(e.startDate)}</dd>
                    </div>
                  )}
                  {e.dueDate && (
                    <div className="flex justify-between">
                      <dt className="text-subtle">Due</dt>
                      <dd>{fmtDate(e.dueDate)}</dd>
                    </div>
                  )}
                  <button onClick={() => open(e.key)} className="pt-1 font-semibold text-accent hover:underline">
                    View epic details
                  </button>
                </dl>
              )}
            </div>
          )
        })}
        <div className="pt-1">
          <QuickCreate projectId={project.id} label="Create epic" defaultType="epic" allowEpic variant="card" defaults={{ sprintId: null }} />
        </div>
      </div>
    </aside>
  )
}
