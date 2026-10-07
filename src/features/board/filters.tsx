import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { ChevronDown, Search, X } from 'lucide-react'
import type { Issue, IssueType, Project } from '@/types'
import { useStore } from '@/store/store'
import { cn, ISSUE_TYPES } from '@/lib/utils'
import { Avatar, IssueTypeIcon } from '@/components/jira'
import { Popover, SelectList, Tooltip } from '@/components/ui/overlay'

export interface IssueFilters {
  search: string
  assignees: string[]
  onlyMine: boolean
  recent: boolean
  flagged: boolean
  epics: string[]
  types: IssueType[]
}

export const EMPTY_FILTERS: IssueFilters = { search: '', assignees: [], onlyMine: false, recent: false, flagged: false, epics: [], types: [] }

export const hasActiveFilters = (f: IssueFilters) =>
  !!f.search || f.assignees.length > 0 || f.onlyMine || f.recent || f.flagged || f.epics.length > 0 || f.types.length > 0

/** Small localStorage-backed state; tolerant of blocked storage. */
export function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw ? (JSON.parse(raw) as T) : initial
    } catch {
      return initial
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      /* storage unavailable */
    }
  }, [key, value])
  return [value, setValue] as const
}

export function applyFilters(issues: Issue[], f: IssueFilters, me: string, allIssues?: Issue[]) {
  const q = f.search.trim().toLowerCase()
  const dayAgo = Date.now() - 864e5
  const byId = allIssues ? new Map(allIssues.map((i) => [i.id, i])) : null
  return issues.filter((i) => {
    if (q && !i.summary.toLowerCase().includes(q) && !i.key.toLowerCase().includes(q) && !i.labels.some((l) => l.toLowerCase().includes(q))) return false
    if (f.assignees.length && !f.assignees.includes(i.assigneeId ?? '__none')) return false
    if (f.onlyMine && i.assigneeId !== me) return false
    if (f.recent && Date.parse(i.updatedAt) < dayAgo) return false
    if (f.flagged && !i.flagged) return false
    if (f.epics.length) {
      // sub-tasks inherit their parent's epic
      const epicId = i.epicId ?? (i.parentId ? byId?.get(i.parentId)?.epicId : null) ?? '__none'
      if (!f.epics.includes(epicId)) return false
    }
    if (f.types.length && !f.types.includes(i.type)) return false
    return true
  })
}

function QuickFilter({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'h-8 rounded-lg px-2.5 text-[13px] font-medium whitespace-nowrap transition',
        active ? 'bg-accent-soft text-accent ring-1 ring-accent/40' : 'text-muted hover:bg-hover hover:text-fg',
      )}
    >
      {children}
    </button>
  )
}

function DropFilter({ label, count, children }: { label: string; count: number; children: ReactNode }) {
  return (
    <Popover
      width={280}
      trigger={
        <button
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] font-medium transition',
            count ? 'border-accent/50 bg-accent-soft text-accent' : 'border-line text-fg hover:bg-hover',
          )}
        >
          {label}
          {count > 0 && <span className="grid size-[18px] place-items-center rounded-full bg-accent text-[10px] font-bold text-ink">{count}</span>}
          <ChevronDown className="size-3.5 opacity-70" />
        </button>
      }
    >
      {children}
    </Popover>
  )
}

const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])

export function FilterBar({
  project,
  issues,
  filters,
  onChange,
  searchRef,
  right,
  showEpicFilter = true,
}: {
  project: Project
  issues: Issue[]
  filters: IssueFilters
  onChange: (f: IssueFilters) => void
  searchRef?: RefObject<HTMLInputElement | null>
  right?: ReactNode
  showEpicFilter?: boolean
}) {
  const users = useStore((s) => s.users)
  const allIssues = useStore((s) => s.issues)
  const localRef = useRef<HTMLInputElement>(null)
  const ref = searchRef ?? localRef

  // Assignees that actually have work here first, then remaining members.
  const people = useMemo(() => {
    const ids = new Set(issues.map((i) => i.assigneeId).filter(Boolean) as string[])
    return users.filter((u) => ids.has(u.id)).sort((a, b) => a.name.localeCompare(b.name))
  }, [issues, users])
  const hasUnassigned = issues.some((i) => !i.assigneeId)
  const epics = allIssues.filter((i) => i.projectId === project.id && i.type === 'epic')
  const set = (patch: Partial<IssueFilters>) => onChange({ ...filters, ...patch })

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-subtle" />
        <input
          ref={ref}
          value={filters.search}
          onChange={(e) => set({ search: e.target.value })}
          onKeyDown={(e) => e.key === 'Escape' && (e.currentTarget.blur(), set({ search: '' }))}
          placeholder="Search this board"
          aria-label="Search issues"
          className="h-8 w-48 rounded-lg border border-line bg-surface-2 pr-2 pl-8 text-[13px] outline-none transition placeholder:text-subtle focus:w-60 focus:border-accent"
        />
      </div>

      <div className="flex items-center -space-x-1.5 pl-1">
        {people.slice(0, 7).map((u) => {
          const on = filters.assignees.includes(u.id)
          return (
            <button
              key={u.id}
              onClick={() => set({ assignees: toggle(filters.assignees, u.id) })}
              aria-pressed={on}
              aria-label={`Filter by ${u.name}`}
              className={cn('rounded-full transition hover:z-10 hover:-translate-y-0.5', on && 'z-10 -translate-y-0.5 ring-2 ring-accent ring-offset-2 ring-offset-canvas')}
            >
              <Avatar user={u} size="md" />
            </button>
          )
        })}
        {people.length > 7 && (
          <Popover
            width={240}
            trigger={<button className="grid size-8 place-items-center rounded-full bg-surface-3 text-xs font-semibold text-muted ring-2 ring-surface">+{people.length - 7}</button>}
          >
            <SelectList
              multi
              value={filters.assignees}
              options={people.slice(7).map((u) => ({ value: u.id, label: u.name, icon: <Avatar user={u} size="xs" showTooltip={false} /> }))}
              onSelect={(v) => set({ assignees: toggle(filters.assignees, v) })}
            />
          </Popover>
        )}
        {hasUnassigned && (
          <button
            onClick={() => set({ assignees: toggle(filters.assignees, '__none') })}
            aria-pressed={filters.assignees.includes('__none')}
            className={cn('rounded-full transition hover:z-10 hover:-translate-y-0.5', filters.assignees.includes('__none') && 'z-10 ring-2 ring-accent ring-offset-2 ring-offset-canvas')}
          >
            <Avatar size="md" />
          </button>
        )}
      </div>

      {showEpicFilter && (
        <DropFilter label="Epic" count={filters.epics.length}>
          <SelectList
            multi
            value={filters.epics}
            options={[
              ...epics.map((e) => ({ value: e.id, label: e.summary, icon: <span className="size-3 rounded-sm" style={{ background: e.color ?? '#b48cff' }} /> })),
              { value: '__none', label: 'Issues without epic' },
            ]}
            onSelect={(v) => set({ epics: toggle(filters.epics, v) })}
          />
        </DropFilter>
      )}
      <DropFilter label="Type" count={filters.types.length}>
        <SelectList
          multi
          searchable={false}
          value={filters.types}
          options={ISSUE_TYPES.filter((t) => t.id !== 'epic').map((t) => ({ value: t.id, label: t.label, icon: <IssueTypeIcon type={t.id} /> }))}
          onSelect={(v) => set({ types: toggle(filters.types, v) })}
        />
      </DropFilter>

      <div className="mx-1 h-5 w-px bg-line" />
      <QuickFilter active={filters.onlyMine} onClick={() => set({ onlyMine: !filters.onlyMine })}>
        Only my issues
      </QuickFilter>
      <QuickFilter active={filters.recent} onClick={() => set({ recent: !filters.recent })}>
        Recently updated
      </QuickFilter>
      <QuickFilter active={filters.flagged} onClick={() => set({ flagged: !filters.flagged })}>
        Flagged
      </QuickFilter>

      {hasActiveFilters(filters) && (
        <Tooltip label="Clear all filters">
          <button onClick={() => onChange(EMPTY_FILTERS)} className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[13px] font-medium text-accent hover:bg-accent-soft">
            <X className="size-3.5" /> Clear filters
          </button>
        </Tooltip>
      )}

      {right && <div className="ml-auto flex items-center gap-2">{right}</div>}
    </div>
  )
}
