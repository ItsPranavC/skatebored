import { forwardRef, type HTMLAttributes } from 'react'
import { MoreHorizontal, ListTree } from 'lucide-react'
import type { Issue, Project, User } from '@/types'
import { cn, isDone } from '@/lib/utils'
import { Avatar, EpicTag, FlagIcon, IssueTypeIcon, LabelTag, PriorityIcon, StoryPoints } from '@/components/jira'
import { Menu, Tooltip, type MenuItem } from '@/components/ui/overlay'

export interface IssueCardProps extends HTMLAttributes<HTMLDivElement> {
  issue: Issue
  project: Project
  epic?: Issue | null
  parent?: Issue | null
  assignee?: User
  subtasks?: { done: number; total: number }
  daysInColumn?: number
  selected?: boolean
  dragging?: boolean
  overlay?: boolean
  showLabels?: boolean
  menuItems?: () => MenuItem[]
}

/** A board card. Presentational; drag behaviour is attached by the caller. */
export const IssueCard = forwardRef<HTMLDivElement, IssueCardProps>(function IssueCard(
  { issue, project, epic, parent, assignee, subtasks, daysInColumn, selected, dragging, overlay, showLabels = true, menuItems, className, ...rest },
  ref,
) {
  const done = isDone(project, issue)
  const dots = Math.min(4, Math.floor((daysInColumn ?? 0) / 2))
  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      aria-label={`${issue.key} ${issue.summary}`}
      data-issue-card={issue.id}
      className={cn(
        'group/card relative cursor-grab rounded-lg border p-3 text-left transition-[box-shadow,border-color,background-color] select-none active:cursor-grabbing',
        issue.flagged ? 'border-accent/40 bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface-2))]' : 'border-line bg-surface-2 hover:bg-surface-3',
        'shadow-[0_1px_0_rgb(0_0_0/.25)] hover:border-line-strong',
        selected && 'ring-2 ring-accent',
        dragging && 'opacity-40',
        overlay && 'rotate-[1.5deg] cursor-grabbing border-accent/60 shadow-pop',
        className,
      )}
      {...rest}
    >
      {issue.flagged && <span className="absolute top-0 bottom-0 left-0 w-[3px] rounded-l-lg bg-accent" aria-hidden />}
      {parent && (
        <div className="mb-1 flex items-center gap-1 text-[11px] text-subtle">
          <ListTree className="size-3" />
          <span className="truncate">
            {parent.key} · {parent.summary}
          </span>
        </div>
      )}
      <div className="flex items-start gap-2">
        <p className={cn('line-clamp-3 flex-1 text-[13.5px] leading-snug break-words', done && 'text-muted')}>{issue.summary}</p>
        {menuItems && (
          <Menu
            trigger={
              <button
                onPointerDown={(e) => e.stopPropagation()}
                className="-mt-1 -mr-1.5 grid size-6 shrink-0 place-items-center rounded-md text-muted opacity-0 transition group-hover/card:opacity-100 hover:bg-active hover:text-fg focus:opacity-100"
                aria-label={`Actions for ${issue.key}`}
              >
                <MoreHorizontal className="size-4" />
              </button>
            }
            items={menuItems()}
          />
        )}
      </div>

      {(epic || (showLabels && issue.labels.length > 0)) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {epic && <EpicTag epic={epic} />}
          {showLabels && issue.labels.slice(0, 2).map((l) => <LabelTag key={l} label={l} />)}
          {showLabels && issue.labels.length > 2 && <span className="text-[11px] text-subtle">+{issue.labels.length - 2}</span>}
        </div>
      )}

      <div className="mt-2.5 flex items-center gap-1.5">
        <IssueTypeIcon type={issue.type} />
        <span className={cn('text-[12px] font-medium whitespace-nowrap text-muted', done && 'line-through')}>{issue.key}</span>
        {issue.flagged && <FlagIcon />}
        {subtasks && subtasks.total > 0 && (
          <Tooltip label={`${subtasks.done} of ${subtasks.total} sub-tasks done`}>
            <span className="inline-flex items-center gap-1 rounded bg-surface-3 px-1 text-[11px] text-muted">
              <ListTree className="size-3" />
              {subtasks.done}/{subtasks.total}
            </span>
          </Tooltip>
        )}
        <span className="flex-1" />
        {dots > 0 && !done && (
          <Tooltip label={`${daysInColumn} days in this column`}>
            <span className="flex gap-0.5" aria-label={`${daysInColumn} days in this column`}>
              {Array.from({ length: dots }).map((_, i) => (
                <span key={i} className={cn('size-1 rounded-full', dots >= 3 ? 'bg-accent' : 'bg-subtle')} />
              ))}
            </span>
          </Tooltip>
        )}
        <StoryPoints value={issue.storyPoints} />
        <PriorityIcon priority={issue.priority} />
        <Avatar user={assignee} size="sm" />
      </div>
    </div>
  )
})
