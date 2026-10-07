import { ChevronDown, Search } from 'lucide-react'
import { useStore } from '@/store/store'
import { Popover, SelectList, type Option } from '@/components/ui/overlay'
import { Input } from '@/components/ui/primitives'
import { IssueTypeIcon, priorityOptions, useUserOptions } from '@/components/jira'
import { cn, ISSUE_TYPES } from '@/lib/utils'

export interface BasicState {
  projects: string[]
  types: string[]
  statuses: string[]
  assignees: string[]
  priorities: string[]
  labels: string[]
  sprint: string | null
  text: string
}

export const emptyBasic = (projectKey?: string): BasicState => ({
  projects: projectKey ? [projectKey] : [],
  types: [],
  statuses: [],
  assignees: [],
  priorities: [],
  labels: [],
  sprint: null,
  text: '',
})

function Chip({ label, options, value, onChange, locked }: { label: string; options: Option[]; value: string[]; onChange: (v: string[]) => void; locked?: boolean }) {
  const names = value.map((v) => options.find((o) => o.value === v)?.label ?? v)
  return (
    <Popover
      width={280}
      trigger={
        <button
          disabled={locked}
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] font-medium transition disabled:cursor-default',
            value.length ? 'border-accent/50 bg-accent-soft text-fg' : 'border-line bg-surface-2 text-fg hover:bg-surface-3',
          )}
        >
          <span>{label}</span>
          {value.length > 0 && <span className="max-w-[140px] truncate text-muted">: {names.length > 2 ? `${names[0]} +${names.length - 1}` : names.join(', ')}</span>}
          {!locked && <ChevronDown className="size-3.5 text-subtle" />}
        </button>
      }
    >
      <SelectList
        multi
        options={options}
        value={value}
        onSelect={(v) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])}
        footer={
          value.length ? (
            <button className="w-full rounded px-2 py-1.5 text-left text-[13px] text-accent hover:bg-hover" onClick={() => onChange([])}>
              Clear selection
            </button>
          ) : undefined
        }
      />
    </Popover>
  )
}

export function BasicFilters({ state, onChange, lockedProject }: { state: BasicState; onChange: (s: BasicState) => void; lockedProject?: boolean }) {
  const projects = useStore((s) => s.projects)
  const issues = useStore((s) => s.issues)
  const me = useStore((s) => s.currentUserId)
  const scoped = projects.filter((p) => !state.projects.length || state.projects.includes(p.key))
  const userOpts = useUserOptions(undefined, true)
  const assigneeOpts: Option[] = [
    { value: me, label: 'Current user', icon: userOpts.find((o) => o.value === me)?.icon },
    ...userOpts.filter((o) => o.value !== me),
  ]
  const statusOpts: Option[] = [...new Set(scoped.flatMap((p) => p.statuses.map((s) => s.name)))].map((n) => ({ value: n, label: n }))
  const labelOpts: Option[] = [...new Set(issues.filter((i) => scoped.some((p) => p.id === i.projectId)).flatMap((i) => i.labels))]
    .sort()
    .map((l) => ({ value: l, label: l }))
  const set = (patch: Partial<BasicState>) => onChange({ ...state, ...patch })

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-56">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-subtle" />
        <Input value={state.text} onChange={(e) => set({ text: e.target.value })} placeholder="Search issues" className="h-8 pl-8 text-[13px]" />
      </div>
      <Chip
        label="Project"
        locked={lockedProject}
        options={projects.map((p) => ({ value: p.key, label: `${p.name} (${p.key})`, icon: <span>{p.icon}</span> }))}
        value={state.projects}
        onChange={(projects) => set({ projects })}
      />
      <Chip label="Type" options={ISSUE_TYPES.map((t) => ({ value: t.id === 'subtask' ? 'Sub-task' : t.label, label: t.label, icon: <IssueTypeIcon type={t.id} /> }))} value={state.types} onChange={(types) => set({ types })} />
      <Chip label="Status" options={statusOpts} value={state.statuses} onChange={(statuses) => set({ statuses })} />
      <Chip label="Assignee" options={assigneeOpts} value={state.assignees} onChange={(assignees) => set({ assignees })} />
      <Chip label="Priority" options={priorityOptions} value={state.priorities} onChange={(priorities) => set({ priorities })} />
      <Chip label="Labels" options={labelOpts} value={state.labels} onChange={(labels) => set({ labels })} />
      <Chip
        label="Sprint"
        options={[
          { value: 'openSprints()', label: 'Open sprints' },
          { value: 'futureSprints()', label: 'Future sprints' },
          { value: 'closedSprints()', label: 'Closed sprints' },
        ]}
        value={state.sprint ? [state.sprint] : []}
        onChange={(v) => set({ sprint: v[v.length - 1] ?? null })}
      />
    </div>
  )
}
