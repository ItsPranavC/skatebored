import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight, Clock, Copy, Eye, EyeOff, Flag, Link2, Maximize2, MoreHorizontal, Paperclip, Share2, Trash2, X, ListPlus, CopyPlus, Undo2, ArrowUpRight } from 'lucide-react'
import type { Issue, IssueType } from '@/types'
import { useStore } from '@/store/store'
import { toast } from '@/store/ui'
import { Avatar, FlagIcon, IssueTypeIcon, StatusPicker, useIssueModal, issueTypeOptions } from '@/components/jira'
import { ConfirmDialog, Popover, SelectList, Tooltip } from '@/components/ui/overlay'
import { Button } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import { ProjectAvatar } from '@/layout/TopNav'
import { DetailsPanel } from './DetailsPanel'
import { AgentIcon, DevelopmentPanel } from '@/features/agents/OpenInAgent'
import { useAgentLaunch, useAgentPrefs } from '@/features/agents/prefs'
import { agentById } from '@/features/agents/agents'
import { Activity, type ActivityHandle } from './Activity'
import { Attachments, ChildIssues, Description, LinkedIssues, readFilesAsAttachments } from './Sections'
import { LogWorkModal } from './LogWorkModal'
import { TaskBrief } from '@/features/work/TaskBrief'

const isTyping = (el: EventTarget | null) => {
  const t = el as HTMLElement | null
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
}

function SummaryEditor({ issue, onDone }: { issue: Issue; onDone: () => void }) {
  const update = useStore((s) => s.updateIssue)
  const [draft, setDraft] = useState(issue.summary)
  const save = () => {
    const v = draft.trim()
    if (v && v !== issue.summary) update(issue.id, { summary: v.slice(0, 255) })
    onDone()
  }
  return (
    <div>
      <textarea
        autoFocus
        rows={2}
        value={draft}
        maxLength={255}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setDraft(e.target.value.replace(/\n/g, ''))}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            save()
          }
          if (e.key === 'Escape') {
            e.preventDefault()
            onDone()
          }
        }}
        className="display w-full resize-none rounded-lg border border-accent bg-surface px-2 py-1 text-[24px] ring-2 ring-accent-soft outline-none"
      />
      {!draft.trim() && <div className="text-xs text-accent">Summary is required</div>}
    </div>
  )
}

function Summary({ issue, editing, setEditing }: { issue: Issue; editing: boolean; setEditing: (v: boolean) => void }) {
  if (editing) return <SummaryEditor issue={issue} onDone={() => setEditing(false)} />
  return (
    <h1
      role="button"
      tabIndex={0}
      onClick={() => setEditing(true)}
      onKeyDown={(e) => e.key === 'Enter' && setEditing(true)}
      className="display -mx-2 cursor-text rounded-lg px-2 py-1 text-[24px] break-words transition hover:bg-hover"
    >
      {issue.summary}
    </h1>
  )
}

function Watchers({ issue }: { issue: Issue }) {
  const users = useStore((s) => s.users)
  const me = useStore((s) => s.currentUserId)
  const toggleWatch = useStore((s) => s.toggleWatch)
  const watching = issue.watcherIds.includes(me)
  return (
    <Popover
      placement="bottom-end"
      width={280}
      trigger={
        <button className={cn('flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium transition hover:bg-hover', watching ? 'text-accent' : 'text-muted')} aria-label="Watchers">
          {watching ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
          {issue.watcherIds.length}
        </button>
      }
    >
      <div className="py-1">
        <button onClick={() => toggleWatch(issue.id)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] hover:bg-hover">
          {watching ? <EyeOff className="size-4 text-muted" /> : <Eye className="size-4 text-muted" />}
          {watching ? 'Stop watching' : 'Start watching'}
        </button>
        <div className="my-1 h-px bg-line" />
        <div className="px-3 pt-1 pb-1 text-[11px] font-semibold tracking-wide text-subtle uppercase">Watching this issue</div>
        {issue.watcherIds.length === 0 && <div className="px-3 py-1.5 text-[13px] text-subtle">No watchers</div>}
        {issue.watcherIds.map((id) => {
          const u = users.find((x) => x.id === id)
          return (
            <div key={id} className="group flex items-center gap-2 px-3 py-1.5 text-[13px]">
              <Avatar user={u} size="xs" showTooltip={false} />
              <span className="flex-1">{u?.name ?? 'Unknown'}</span>
              <button onClick={() => toggleWatch(issue.id, id)} className="text-subtle opacity-0 group-hover:opacity-100 hover:text-accent" aria-label="Remove watcher">
                <X className="size-3.5" />
              </button>
            </div>
          )
        })}
        <div className="mt-1 border-t border-line">
          <SelectList
            options={users.filter((u) => u.active && !issue.watcherIds.includes(u.id)).map((u) => ({ value: u.id, label: u.name, icon: <Avatar user={u} size="xs" showTooltip={false} /> }))}
            value={null}
            placeholder="Add watchers…"
            emptyText="Everyone is watching"
            onSelect={(v) => toggleWatch(issue.id, v)}
          />
        </div>
      </div>
    </Popover>
  )
}

export function IssueView({ issue, variant, onClose }: { issue: Issue; variant: 'modal' | 'page'; onClose?: () => void }) {
  const project = useStore((s) => s.projects.find((p) => p.id === issue.projectId))!
  const issues = useStore((s) => s.issues)
  const me = useStore((s) => s.currentUserId)
  const update = useStore((s) => s.updateIssue)
  const cloneIssue = useStore((s) => s.cloneIssue)
  const deleteIssue = useStore((s) => s.deleteIssue)
  const navigate = useNavigate()
  const { open: openIssue } = useIssueModal()

  const [editingSummary, setEditingSummary] = useState(false)
  const [assigneeOpen, setAssigneeOpen] = useState(false)
  const [labelsEditing, setLabelsEditing] = useState(false)
  const [opsOpen, setOpsOpen] = useState(false)
  const [creatingChild, setCreatingChild] = useState(false)
  const [linking, setLinking] = useState(false)
  const [logWork, setLogWork] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const activityRef = useRef<ActivityHandle>(null)

  const epic = issues.find((i) => i.id === issue.epicId)
  const parent = issues.find((i) => i.id === issue.parentId)
  const browseUrl = `${window.location.origin}/browse/${issue.key}`

  // Jira issue shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return
      const dialogs = document.querySelectorAll('[role="dialog"]').length
      if (variant === 'page' ? dialogs > 0 : dialogs > 1) return
      const k = e.key
      const map: Record<string, () => void> = {
        e: () => setEditingSummary(true),
        a: () => setAssigneeOpen(true),
        i: () => {
          update(issue.id, { assigneeId: me })
          toast({ title: `${issue.key} assigned to you` })
        },
        m: () => activityRef.current?.openComment(),
        l: () => setLabelsEditing(true),
        '.': () => setOpsOpen(true),
      }
      if (map[k]) {
        e.preventDefault()
        e.stopPropagation()
        map[k]!()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [issue.id, issue.key, me, update, variant])

  const copy = (text: string, title: string) => {
    navigator.clipboard?.writeText(text).then(
      () => toast({ title, tone: 'success' }),
      () => toast({ title: 'Couldn’t access the clipboard', tone: 'error' }),
    )
  }

  const typeOptions = issue.type === 'subtask' ? issueTypeOptions(false, true).filter((o) => o.value === 'subtask') : issueTypeOptions(true, false)

  const ops: { label: string; icon: ReactNode; onClick: () => void; danger?: boolean; hidden?: boolean }[] = [
    { label: `Open in ${agentById(useAgentPrefs.getState().lastAgentId).name}…`, icon: <AgentIcon id={agentById(useAgentPrefs.getState().lastAgentId).id} />, onClick: () => useAgentLaunch.getState().open(issue.id) },
    { label: 'Log work', icon: <Clock className="size-4" />, onClick: () => setLogWork(true) },
    { label: issue.flagged ? 'Remove flag' : 'Add flag', icon: <Flag className="size-4" />, onClick: () => update(issue.id, { flagged: !issue.flagged }) },
    {
      label: 'Clone',
      icon: <CopyPlus className="size-4" />,
      onClick: () => {
        const c = cloneIssue(issue.id)
        if (c) {
          toast({ title: `Cloned to ${c.key}`, tone: 'success', action: { label: 'View clone', onClick: () => openIssue(c.key) } })
        }
      },
    },
    { label: 'Add child issue', icon: <ListPlus className="size-4" />, onClick: () => setCreatingChild(true), hidden: issue.type === 'subtask' },
    { label: 'Link issue', icon: <Link2 className="size-4" />, onClick: () => setLinking(true) },
    {
      label: 'Convert to issue',
      icon: <Undo2 className="size-4" />,
      hidden: issue.type !== 'subtask',
      onClick: () => update(issue.id, { type: 'task', parentId: null }),
    },
    { label: 'Copy issue key', icon: <Copy className="size-4" />, onClick: () => copy(issue.key, `Copied ${issue.key}`) },
    { label: 'Open in full page', icon: <ArrowUpRight className="size-4" />, onClick: () => navigate(`/browse/${issue.key}`), hidden: variant === 'page' },
    { label: 'Delete', icon: <Trash2 className="size-4" />, onClick: () => setConfirmDelete(true), danger: true },
  ]

  return (
    <div className={cn('flex min-h-0 flex-col', variant === 'modal' ? 'h-full' : 'min-h-full')}>
      {/* header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-6 py-3">
        <nav className="flex min-w-0 flex-1 items-center gap-1 text-[13px] text-muted" aria-label="Breadcrumbs">
          {variant === 'page' && (
            <>
              <Link to="/projects" className="hover:text-fg hover:underline">
                Projects
              </Link>
              <ChevronRight className="size-3.5 shrink-0 text-subtle" />
              <Link to={`/projects/${project.key}/board`} className="flex items-center gap-1.5 hover:text-fg hover:underline">
                <ProjectAvatar project={project} size={18} />
                {project.name}
              </Link>
              <ChevronRight className="size-3.5 shrink-0 text-subtle" />
            </>
          )}
          {(parent ?? epic) && (
            <>
              <button onClick={() => openIssue((parent ?? epic)!.key)} className="flex min-w-0 items-center gap-1.5 hover:text-fg hover:underline">
                <IssueTypeIcon type={(parent ?? epic)!.type} />
                <span className="shrink-0">{(parent ?? epic)!.key}</span>
                <span className="hidden max-w-[200px] truncate xl:inline">{(parent ?? epic)!.summary}</span>
              </button>
              <ChevronRight className="size-3.5 shrink-0 text-subtle" />
            </>
          )}
          <Popover
            width={200}
            trigger={
              <button className="flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-hover" aria-label="Change issue type">
                <IssueTypeIcon type={issue.type} />
              </button>
            }
          >
            {(close) => (
              <>
                <div className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-subtle uppercase">Change issue type</div>
                <SelectList<IssueType>
                  searchable={false}
                  options={typeOptions}
                  value={issue.type}
                  onSelect={(t) => {
                    close()
                    if (t === issue.type) return
                    update(issue.id, { type: t, ...(t === 'epic' ? { epicId: null, color: issue.color ?? '#b48cff', sprintId: null } : {}) })
                  }}
                />
              </>
            )}
          </Popover>
          <button onClick={() => copy(browseUrl, 'Link copied to clipboard')} className="font-medium text-fg hover:underline">
            {issue.key}
          </button>
          {issue.flagged && <span className="ml-1"><FlagIcon /></span>}
        </nav>

        <div className="flex shrink-0 items-center gap-0.5">
          <Watchers issue={issue} />
          <Tooltip label="Copy link">
            <Button variant="ghost" icon={<Share2 className="size-4" />} onClick={() => copy(browseUrl, 'Link copied to clipboard')} aria-label="Share" />
          </Tooltip>
          <Popover
            placement="bottom-end"
            width={220}
            open={opsOpen}
            onOpenChange={setOpsOpen}
            trigger={<Button variant="ghost" icon={<MoreHorizontal className="size-4" />} aria-label="More actions" />}
          >
            <div className="py-1.5" role="menu">
              {ops
                .filter((o) => !o.hidden)
                .map((o) => (
                  <button
                    key={o.label}
                    role="menuitem"
                    onClick={() => {
                      setOpsOpen(false)
                      o.onClick()
                    }}
                    className={cn('flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] hover:bg-hover', o.danger ? 'text-accent' : 'text-fg')}
                  >
                    <span className="text-muted">{o.icon}</span>
                    {o.label}
                  </button>
                ))}
            </div>
          </Popover>
          {variant === 'modal' && (
            <>
              <Tooltip label="Open in full page">
                <Button variant="ghost" icon={<Maximize2 className="size-4" />} onClick={() => navigate(`/browse/${issue.key}`)} aria-label="Open in full page" />
              </Tooltip>
              <Button variant="ghost" icon={<X className="size-[18px]" />} onClick={onClose} aria-label="Close" />
            </>
          )}
        </div>
      </div>

      {/* body */}
      <div className={cn('flex min-h-0 flex-1', variant === 'page' ? 'flex-col lg:flex-row' : 'flex-col md:flex-row')}>
        <div className={cn('min-w-0 flex-1 space-y-7 px-6 py-5', variant === 'modal' && 'overflow-y-auto')}>
          <div>
            <Summary issue={issue} editing={editingSummary} setEditing={setEditingSummary} />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button icon={<Paperclip className="size-4" />} onClick={() => fileRef.current?.click()}>
                Attach
              </Button>
              {issue.type !== 'subtask' && (
                <Button icon={<ListPlus className="size-4" />} onClick={() => setCreatingChild(true)}>
                  {issue.type === 'epic' ? 'Add child issue' : 'Create subtask'}
                </Button>
              )}
              <Button icon={<Link2 className="size-4" />} onClick={() => setLinking(true)}>
                Link issue
              </Button>
              <input
                ref={fileRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  readFilesAsAttachments(issue, e.target.files)
                  e.target.value = ''
                }}
              />
            </div>
          </div>
          <Description issue={issue} />
          {issue.type !== 'epic' && <TaskBrief key={issue.id} issue={issue} project={project} />}
          <Attachments issue={issue} onAttach={() => fileRef.current?.click()} />
          <ChildIssues issue={issue} project={project} creating={creatingChild} setCreating={setCreatingChild} />
          <LinkedIssues issue={issue} adding={linking} setAdding={setLinking} />
          <Activity ref={activityRef} issue={issue} project={project} />
        </div>

        <aside className={cn('shrink-0 space-y-4 border-line px-6 py-5', variant === 'modal' ? 'overflow-y-auto md:w-[380px] md:border-l' : 'lg:w-[400px] lg:border-l')}>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPicker issue={issue} project={project} />
            {project.statuses.find((s) => s.id === issue.statusId)?.category === 'done' && <span className="text-[12px] font-medium text-done-fg">✓ Done</span>}
          </div>
          <DevelopmentPanel issue={issue} />
          <DetailsPanel issue={issue} project={project} controls={{ assigneeOpen, setAssigneeOpen, labelsEditing, setLabelsEditing, onLogWork: () => setLogWork(true) }} />
        </aside>
      </div>

      <LogWorkModal issue={issue} open={logWork} onClose={() => setLogWork(false)} />
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          const key = issue.key
          const childCount = issues.filter((i) => i.parentId === issue.id).length
          if (variant === 'modal') onClose?.()
          else navigate(`/projects/${project.key}/${project.type === 'scrum' ? 'backlog' : 'board'}`)
          deleteIssue(issue.id)
          toast({ title: `${key} deleted`, description: childCount ? `${childCount} sub-task${childCount > 1 ? 's were' : ' was'} deleted too.` : undefined })
        }}
        title={`Delete ${issue.key}?`}
      >
        You’re about to permanently delete this issue, its comments, attachments and all of its data.
        {issues.some((i) => i.parentId === issue.id) && ' Its sub-tasks will be deleted too.'} If you’re not sure, you can resolve or close it instead.
      </ConfirmDialog>
    </div>
  )
}
