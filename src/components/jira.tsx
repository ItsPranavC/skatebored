import { useCallback, type ReactElement, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronDown, ChevronsDown, ChevronsUp, ChevronUp, Equal, Flag, UserRound } from 'lucide-react'
import type { Issue, IssueType, Priority, Project, Status, User } from '@/types'
import { cn, initials, labelColor, PRIORITIES, priorityLabel, issueTypeLabel, ISSUE_TYPES } from '@/lib/utils'
import { useStore } from '@/store/store'
import { Popover, SelectList, Tooltip, type Option } from '@/components/ui/overlay'

// ───────────────────────────── Brand ─────────────────────────────

export function Logo({ compact }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg viewBox="0 0 32 32" className="size-7 shrink-0" aria-hidden>
        <rect width="32" height="32" rx="8" fill="var(--accent)" />
        <rect x="6" y="12.5" width="20" height="6" rx="3" fill="var(--ink)" />
        <circle cx="10" cy="22" r="2.2" fill="var(--ink)" />
        <circle cx="22" cy="22" r="2.2" fill="var(--ink)" />
      </svg>
      {!compact && <span className="display text-[19px] leading-none">skatebored</span>}
    </span>
  )
}

// ───────────────────────────── Avatar ─────────────────────────────

const SIZE = { xs: 'size-5 text-[9px]', sm: 'size-6 text-[10px]', md: 'size-8 text-xs', lg: 'size-10 text-sm', xl: 'size-16 text-xl' }

export function Avatar({ user, size = 'sm', className, showTooltip = true }: { user?: User | null; size?: keyof typeof SIZE; className?: string; showTooltip?: boolean }) {
  const el = user ? (
    <span
      className={cn('inline-grid shrink-0 place-items-center rounded-full font-bold text-[#160707] ring-2 ring-surface select-none', SIZE[size], className)}
      style={{ background: user.color }}
      aria-label={user.name}
    >
      {initials(user.name)}
    </span>
  ) : (
    <span className={cn('inline-grid shrink-0 place-items-center rounded-full bg-surface-3 text-subtle ring-2 ring-surface', SIZE[size], className)} aria-label="Unassigned">
      <UserRound className="size-[60%]" />
    </span>
  )
  return showTooltip ? <Tooltip label={user?.name ?? 'Unassigned'}>{el}</Tooltip> : el
}

export function AvatarGroup({ users, max = 5, size = 'md', selected = [], onToggle }: { users: User[]; max?: number; size?: keyof typeof SIZE; selected?: string[]; onToggle?: (id: string) => void }) {
  const shown = users.slice(0, max)
  const rest = users.length - shown.length
  return (
    <div className="flex items-center -space-x-1.5">
      {shown.map((u) => (
        <button
          key={u.id}
          type="button"
          onClick={() => onToggle?.(u.id)}
          className={cn('rounded-full transition hover:z-10 hover:-translate-y-0.5', selected.includes(u.id) && 'z-10 ring-2 ring-accent')}
          aria-pressed={selected.includes(u.id)}
        >
          <Avatar user={u} size={size} />
        </button>
      ))}
      {rest > 0 && (
        <span className={cn('inline-grid place-items-center rounded-full bg-surface-3 font-semibold text-muted ring-2 ring-surface', SIZE[size])}>+{rest}</span>
      )}
    </div>
  )
}

// ───────────────────────────── Issue type ─────────────────────────────

const TYPE_STYLE: Record<IssueType, { bg: string; path: ReactNode }> = {
  story: { bg: '#5cc47e', path: <path d="M5 3.5h6v9L8 10.5 5 12.5z" fill="#fff" /> },
  task: { bg: '#4c9aff', path: <path d="M4.8 8.2l2.1 2 4.3-4.4" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /> },
  bug: { bg: '#f04c4c', path: <circle cx="8" cy="8" r="3" fill="#fff" /> },
  epic: { bg: '#b48cff', path: <path d="M9 3L5 9h3l-1 4 4-6H8z" fill="#fff" /> },
  subtask: { bg: '#6ea0ff', path: <><rect x="4" y="4" width="5" height="5" rx="1" stroke="#fff" strokeWidth="1.4" fill="none" /><rect x="7" y="7" width="5" height="5" rx="1" fill="#fff" /></> },
}

export function IssueTypeIcon({ type, className }: { type: IssueType; className?: string }) {
  const t = TYPE_STYLE[type]
  return (
    <Tooltip label={issueTypeLabel(type)}>
      <svg viewBox="0 0 16 16" className={cn('size-4 shrink-0', className)} aria-label={issueTypeLabel(type)}>
        <rect width="16" height="16" rx="3" fill={t.bg} />
        {t.path}
      </svg>
    </Tooltip>
  )
}

export const issueTypeOptions = (allowEpic = true, allowSub = false): Option<IssueType>[] =>
  ISSUE_TYPES.filter((t) => (allowEpic || t.id !== 'epic') && (allowSub || t.id !== 'subtask')).map((t) => ({
    value: t.id,
    label: t.label,
    icon: <IssueTypeIcon type={t.id} />,
  }))

// ───────────────────────────── Priority ─────────────────────────────

export function PriorityIcon({ priority, className }: { priority: Priority; className?: string }) {
  const p = PRIORITIES.find((x) => x.id === priority)!
  const Icon = { highest: ChevronsUp, high: ChevronUp, medium: Equal, low: ChevronDown, lowest: ChevronsDown }[priority]
  return (
    <Tooltip label={`${p.label} priority`}>
      <Icon className={cn('size-4 shrink-0', className)} style={{ color: p.color }} strokeWidth={2.6} aria-label={`${p.label} priority`} />
    </Tooltip>
  )
}

export const priorityOptions: Option<Priority>[] = PRIORITIES.map((p) => ({ value: p.id, label: p.label, icon: <PriorityIcon priority={p.id} /> }))

// ───────────────────────────── Status ─────────────────────────────

export function StatusLozenge({ status, className, chevron }: { status?: Status; className?: string; chevron?: boolean }) {
  if (!status) return null
  return (
    <span
      className={cn(
        'inline-flex h-5 max-w-full items-center gap-1 truncate rounded px-1.5 text-[11px] font-bold tracking-wide uppercase',
        status.category === 'todo' && 'bg-todo text-todo-fg',
        status.category === 'inprogress' && 'bg-progress text-progress-fg',
        status.category === 'done' && 'bg-done text-done-fg',
        className,
      )}
    >
      <span className="truncate">{status.name}</span>
      {chevron && <ChevronDown className="size-3 shrink-0" strokeWidth={3} />}
    </span>
  )
}

/** Status dropdown with workflow transitions — Jira's big status button. */
export function StatusPicker({ issue, project, size = 'md', onChange }: { issue: Issue; project: Project; size?: 'sm' | 'md'; onChange?: (statusId: string) => void }) {
  const updateIssue = useStore((s) => s.updateIssue)
  const status = project.statuses.find((s) => s.id === issue.statusId)
  return (
    <Popover
      width={240}
      trigger={
        <button
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg font-semibold transition',
            size === 'md' ? 'h-8 px-3 text-[13px]' : 'h-6 px-2 text-[11px] uppercase',
            status?.category === 'done' ? 'bg-done text-done-fg hover:brightness-125' : status?.category === 'inprogress' ? 'bg-progress text-progress-fg hover:brightness-125' : 'bg-surface-3 text-fg hover:bg-active',
          )}
        >
          {status?.name}
          <ChevronDown className="size-3.5" strokeWidth={2.5} />
        </button>
      }
    >
      {(close) => (
        <div className="py-1">
          <div className="px-3 pt-1.5 pb-1 text-[11px] font-semibold tracking-wide text-subtle uppercase">Transition to</div>
          {project.statuses
            .filter((s) => s.id !== issue.statusId)
            .map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  close()
                  if (onChange) onChange(s.id)
                  else updateIssue(issue.id, { statusId: s.id })
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-hover"
              >
                <span className="flex-1">{s.name}</span>
                <StatusLozenge status={s} />
              </button>
            ))}
        </div>
      )}
    </Popover>
  )
}

// ───────────────────────────── People ─────────────────────────────

export function useUserOptions(projectId?: string, includeUnassigned = true): Option[] {
  const users = useStore((s) => s.users)
  const projects = useStore((s) => s.projects)
  const me = useStore((s) => s.currentUserId)
  const members = projectId ? projects.find((p) => p.id === projectId)?.memberIds : undefined
  const list = users.filter((u) => u.active && (!members || members.includes(u.id)))
  const opts: Option[] = list
    .sort((a, b) => (a.id === me ? -1 : b.id === me ? 1 : a.name.localeCompare(b.name)))
    .map((u) => ({ value: u.id, label: u.name, icon: <Avatar user={u} size="xs" showTooltip={false} />, hint: u.id === me ? 'You' : undefined }))
  return includeUnassigned ? [{ value: '__none', label: 'Unassigned', icon: <Avatar size="xs" showTooltip={false} /> }, ...opts] : opts
}

export function UserPicker({
  value,
  onChange,
  projectId,
  trigger,
  allowUnassigned = true,
}: {
  value: string | null
  onChange: (id: string | null) => void
  projectId?: string
  trigger?: ReactElement
  allowUnassigned?: boolean
}) {
  const options = useUserOptions(projectId, allowUnassigned)
  const user = useStore((s) => s.users.find((u) => u.id === value))
  const me = useStore((s) => s.currentUserId)
  return (
    <Popover
      width={260}
      trigger={
        trigger ?? (
          <button className="-mx-2 flex items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-hover">
            <Avatar user={user} size="sm" showTooltip={false} />
            <span className={cn(!user && 'text-muted')}>{user?.name ?? 'Unassigned'}</span>
          </button>
        )
      }
    >
      {(close) => (
        <SelectList
          options={options}
          value={value ?? '__none'}
          placeholder="Search people…"
          onSelect={(v) => {
            onChange(v === '__none' ? null : v)
            close()
          }}
          footer={
            value !== me ? (
              <button
                className="w-full rounded px-2 py-1.5 text-left text-[13px] text-accent hover:bg-hover"
                onClick={() => {
                  onChange(me)
                  close()
                }}
              >
                Assign to me
              </button>
            ) : undefined
          }
        />
      )}
    </Popover>
  )
}

// ───────────────────────────── Tags ─────────────────────────────

export function EpicTag({ epic, className }: { epic?: Issue | null; className?: string }) {
  if (!epic) return null
  return (
    <span
      className={cn('inline-flex h-5 max-w-[180px] items-center truncate rounded px-1.5 text-[11px] font-semibold uppercase', className)}
      style={{ background: `color-mix(in srgb, ${epic.color ?? '#b48cff'} 22%, transparent)`, color: `color-mix(in srgb, ${epic.color ?? '#b48cff'} 70%, var(--fg))` }}
      title={epic.summary}
    >
      <span className="truncate">{epic.summary}</span>
    </span>
  )
}

export function LabelTag({ label, onRemove }: { label: string; onRemove?: () => void }) {
  return (
    <span className="inline-flex h-5 items-center gap-1 rounded border border-line bg-surface-3 px-1.5 text-[11px] text-fg">
      <span className="size-1.5 rounded-full" style={{ background: labelColor(label) }} />
      {label}
      {onRemove && (
        <button onClick={onRemove} className="text-subtle hover:text-fg" aria-label={`Remove ${label}`}>
          ×
        </button>
      )}
    </span>
  )
}

export function StoryPoints({ value, className }: { value: number | null | undefined; className?: string }) {
  if (value == null) return null
  return (
    <Tooltip label="Story points">
      <span className={cn('inline-grid h-5 min-w-5 place-items-center rounded-full bg-surface-3 px-1.5 text-[11px] font-semibold text-muted', className)}>{value}</span>
    </Tooltip>
  )
}

export function FlagIcon() {
  return (
    <Tooltip label="Flagged — impediment">
      <Flag className="size-3.5 fill-accent text-accent" />
    </Tooltip>
  )
}

export { priorityLabel }

// ───────────────────────────── Issue modal routing ─────────────────────────────

/** Opens the issue detail as a modal on the current page (Jira's ?selectedIssue=KEY). */
export function useIssueModal() {
  const [params, setParams] = useSearchParams()
  const open = useCallback(
    (key: string) => {
      const next = new URLSearchParams(params)
      next.set('selectedIssue', key)
      setParams(next)
      const issue = useStore.getState().issues.find((i) => i.key === key)
      if (issue) useStore.getState().pushRecent({ kind: 'issue', id: issue.id })
    },
    [params, setParams],
  )
  const close = useCallback(() => {
    const next = new URLSearchParams(params)
    next.delete('selectedIssue')
    setParams(next)
  }, [params, setParams])
  return { selectedKey: params.get('selectedIssue'), open, close }
}

export function IssueKey({ issue, className, strike }: { issue: Issue; className?: string; strike?: boolean }) {
  const { open } = useIssueModal()
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        open(issue.key)
      }}
      className={cn('shrink-0 text-[12px] font-medium whitespace-nowrap text-muted hover:text-accent hover:underline', strike && 'line-through', className)}
    >
      {issue.key}
    </button>
  )
}
