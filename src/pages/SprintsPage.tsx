import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { addWeeks } from 'date-fns'
import { ChevronDown, ChevronRight, Columns3, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import type { Issue, Project, Sprint, User } from '@/types'
import { useProjectByKey, useStore } from '@/store/store'
import { toast } from '@/store/ui'
import { cn, fmtDate } from '@/lib/utils'
import { Avatar, StatusLozenge, useIssueModal } from '@/components/jira'
import { ConfirmDialog, Menu } from '@/components/ui/overlay'
import { Button, EmptyState } from '@/components/ui/primitives'
import { QuickCreate } from '@/features/board/QuickCreate'
import { CompleteSprintModal, EditSprintModal, NewSprintModal } from '@/features/backlog/SprintModals'
import { KindBadge, SprintPlan } from '@/features/backlog/SprintPlan'

/** A project is just its sprints: running ones first, then planned, then finished. */
export default function SprintsPage() {
  const { projectKey } = useParams()
  const project = useProjectByKey(projectKey)!
  const allSprints = useStore((s) => s.sprints)
  const startSprint = useStore((s) => s.startSprint)
  const deleteSprint = useStore((s) => s.deleteSprint)
  const updateProject = useStore((s) => s.updateProject)
  const [newOpen, setNewOpen] = useState(false)
  const [editFor, setEditFor] = useState<Sprint | null>(null)
  const [finishFor, setFinishFor] = useState<Sprint | null>(null)
  const [deleteFor, setDeleteFor] = useState<Sprint | null>(null)
  const [showFinished, setShowFinished] = useState(false)
  const navigate = useNavigate()

  const sprints = useMemo(() => allSprints.filter((s) => s.projectId === project.id), [allSprints, project.id])
  const running = sprints.filter((s) => s.state === 'active').sort((a, b) => a.order - b.order)
  const planned = sprints.filter((s) => s.state === 'future').sort((a, b) => a.order - b.order)
  const finished = sprints.filter((s) => s.state === 'closed').sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))

  const start = (s: Sprint) => {
    const now = new Date()
    const startDate = s.startDate && Date.parse(s.startDate) <= now.getTime() + 86_400_000 ? s.startDate : now.toISOString()
    const endDate = s.endDate && Date.parse(s.endDate) > Date.parse(startDate) ? s.endDate : addWeeks(now, 2).toISOString()
    startSprint(s.id, { name: s.name, goal: s.goal, startDate, endDate })
    toast({ title: `${s.name} started`, tone: 'success' })
  }

  const card = (s: Sprint) => (
    <SprintCard
      key={s.id}
      project={project}
      sprint={s}
      actions={
        <>
          {s.state === 'future' && (
            <Button variant="primary" onClick={() => start(s)}>
              Start
            </Button>
          )}
          {s.state === 'active' && (
            <>
              <Button variant="default" icon={<Columns3 className="size-4" />} onClick={() => navigate(`/projects/${project.key}/board?sprint=${s.id}`)}>
                Board
              </Button>
              <Button variant="default" onClick={() => setFinishFor(s)}>
                Finish
              </Button>
            </>
          )}
          <Menu
            trigger={<Button variant="ghost" aria-label={`${s.name} actions`} icon={<MoreHorizontal className="size-4" />} />}
            items={[
              { label: 'Edit sprint', icon: <Pencil className="size-4" />, onClick: () => setEditFor(s) },
              ...(s.state === 'future' ? [{ label: 'Delete sprint', icon: <Trash2 className="size-4" />, danger: true, onClick: () => setDeleteFor(s) }] : []),
            ]}
          />
        </>
      }
      onEdit={() => setEditFor(s)}
    />
  )

  return (
    <div className="mx-auto max-w-[1100px] px-8 pt-6 pb-16">
      <div className="mb-2 flex items-center gap-1.5 text-[13px] text-muted">
        <Link to="/projects" className="hover:text-fg hover:underline">
          Projects
        </Link>
        <span>/</span>
        <span>{project.name}</span>
      </div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="display text-[28px]">Sprints</h1>
          <TeamSwitch project={project} onChange={(engineering) => updateProject(project.id, { engineering })} />
        </div>
        <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setNewOpen(true)}>
          New sprint
        </Button>
      </div>

      {!running.length && !planned.length ? (
        <EmptyState icon="🛹" title="No sprints yet" action={<Button variant="primary" onClick={() => setNewOpen(true)}>New sprint</Button>}>
          {project.engineering ? 'Create a Research or Implementation sprint, then add its tasks.' : 'Create a sprint, then add its tasks.'}
        </EmptyState>
      ) : (
        <div className="space-y-6">
          {running.length > 0 && <Group title="Running">{running.map(card)}</Group>}
          {planned.length > 0 && <Group title="Planned">{planned.map(card)}</Group>}
        </div>
      )}

      <Unplanned project={project} sprints={[...running, ...planned]} />

      {finished.length > 0 && (
        <div className="mt-8">
          <button onClick={() => setShowFinished((v) => !v)} className="inline-flex items-center gap-1 text-[13px] font-semibold text-muted hover:text-fg">
            {showFinished ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            Finished ({finished.length})
          </button>
          {showFinished && <div className="mt-3 space-y-3">{finished.map(card)}</div>}
        </div>
      )}

      <NewSprintModal project={project} open={newOpen} onClose={() => setNewOpen(false)} />
      <EditSprintModal sprint={editFor} open={!!editFor} onClose={() => setEditFor(null)} />
      <CompleteSprintModal sprint={finishFor} open={!!finishFor} onClose={() => setFinishFor(null)} />
      <ConfirmDialog
        open={!!deleteFor}
        onClose={() => setDeleteFor(null)}
        onConfirm={() => {
          if (deleteFor) deleteSprint(deleteFor.id)
          setDeleteFor(null)
        }}
        title={`Delete ${deleteFor?.name ?? 'sprint'}?`}
        confirmLabel="Delete"
        danger
      >
        The sprint is removed. Its tasks are kept but won’t be in a sprint.
      </ConfirmDialog>
    </div>
  )
}

/** Engineering projects categorise sprints as Research or Implementation. */
function TeamSwitch({ project, onChange }: { project: Project; onChange: (engineering: boolean) => void }) {
  return (
    <div role="radiogroup" aria-label="Team" className="flex items-center gap-0.5 rounded-xl border border-line bg-surface-2 p-0.5 text-[12.5px]">
      {[
        { value: true, label: 'Engineering' },
        { value: false, label: 'Other team' },
      ].map((o) => (
        <button
          key={o.label}
          role="radio"
          aria-checked={!!project.engineering === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-7 rounded-lg px-2.5 font-medium transition',
            !!project.engineering === o.value ? 'bg-surface-3 text-fg shadow-[inset_0_0_0_1px_var(--line-strong)]' : 'text-muted hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-[11px] font-semibold tracking-wide text-subtle uppercase">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

function SprintCard({ project, sprint, actions, onEdit }: { project: Project; sprint: Sprint; actions: ReactNode; onEdit: () => void }) {
  const allIssues = useStore((s) => s.issues)
  const users = useStore((s) => s.users)
  const { open: openIssue } = useIssueModal()
  const [open, setOpen] = useState(sprint.state !== 'closed')
  const tasks = useMemo(
    () => allIssues.filter((i) => i.sprintId === sprint.id && i.type !== 'subtask' && i.type !== 'epic').sort((a, b) => a.rank - b.rank),
    [allIssues, sprint.id],
  )
  const doneIds = new Set(project.statuses.filter((s) => s.category === 'done').map((s) => s.id))
  const done = tasks.filter((t) => doneIds.has(t.statusId)).length

  return (
    <article className={cn('rounded-xl border bg-surface p-3', sprint.state === 'active' ? 'border-line-strong' : 'border-line')}>
      <header className="flex flex-wrap items-center gap-2">
        <button onClick={() => setOpen((v) => !v)} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={open}>
          {open ? <ChevronDown className="size-4 shrink-0 text-muted" /> : <ChevronRight className="size-4 shrink-0 text-muted" />}
          <span className="truncate text-[15px] font-semibold">{sprint.name}</span>
          {project.engineering && sprint.kind && <KindBadge kind={sprint.kind} />}
          <span className="text-[12.5px] whitespace-nowrap text-muted">
            {sprint.startDate && sprint.endDate ? `${fmtDate(sprint.startDate, 'd MMM')} – ${fmtDate(sprint.endDate, 'd MMM')}` : 'No dates'}
            {' · '}
            {done}/{tasks.length} tasks done
          </span>
        </button>
        <div className="flex items-center gap-1.5">{actions}</div>
      </header>
      {open && (
        <div className="mt-2 space-y-2 pl-6">
          {sprint.goal && <p className="text-[13px] text-muted">{sprint.goal}</p>}
          <SprintPlan project={project} sprint={sprint} onEdit={onEdit} />
          <div className="space-y-px">
            {tasks.map((t) => (
              <TaskRow key={t.id} task={t} project={project} assignee={users.find((u) => u.id === t.assigneeId)} done={doneIds.has(t.statusId)} onOpen={() => openIssue(t.key)} />
            ))}
          </div>
          {sprint.state !== 'closed' && <QuickCreate projectId={project.id} label="Add task" defaults={{ sprintId: sprint.id }} />}
        </div>
      )}
    </article>
  )
}

function TaskRow({ task, project, assignee, done, onOpen }: { task: Issue; project: Project; assignee?: User; done: boolean; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-[13.5px] hover:bg-hover">
      <span className={cn('shrink-0 text-[12px] font-medium text-muted', done && 'line-through')}>{task.key}</span>
      <span className={cn('min-w-0 flex-1 truncate', done && 'text-muted')}>{task.summary}</span>
      <StatusLozenge status={project.statuses.find((s) => s.id === task.statusId)} />
      <Avatar user={assignee} size="xs" />
    </button>
  )
}

/** Tasks left over from the old backlog. Hidden when there are none. */
function Unplanned({ project, sprints }: { project: Project; sprints: Sprint[] }) {
  const allIssues = useStore((s) => s.issues)
  const moveToSprint = useStore((s) => s.moveToSprint)
  const { open: openIssue } = useIssueModal()
  const [open, setOpen] = useState(false)
  const doneIds = useMemo(() => new Set(project.statuses.filter((s) => s.category === 'done').map((s) => s.id)), [project.statuses])
  const tasks = useMemo(
    () => allIssues.filter((i) => i.projectId === project.id && !i.sprintId && i.type !== 'subtask' && i.type !== 'epic' && !doneIds.has(i.statusId)).sort((a, b) => a.rank - b.rank),
    [allIssues, project.id, doneIds],
  )
  if (!tasks.length) return null
  return (
    <div className="mt-8">
      <button onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1 text-[13px] font-semibold text-muted hover:text-fg">
        {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        Not in a sprint ({tasks.length})
      </button>
      {open && (
        <div className="mt-2 space-y-px rounded-xl border border-line bg-surface p-2">
          {tasks.map((t) => (
            <div key={t.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-[13.5px] hover:bg-hover">
              <button onClick={() => openIssue(t.key)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <span className="shrink-0 text-[12px] font-medium text-muted">{t.key}</span>
                <span className="min-w-0 flex-1 truncate">{t.summary}</span>
              </button>
              {sprints.length > 0 && (
                <Menu
                  trigger={<Button variant="subtle" size="sm">Move to sprint</Button>}
                  items={sprints.map((sp) => ({ label: sp.name, onClick: () => moveToSprint([t.id], sp.id) }))}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
