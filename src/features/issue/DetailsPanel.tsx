import { useState, type ReactNode } from 'react'
import { Check, ChevronDown, Flag } from 'lucide-react'
import type { Issue, Project } from '@/types'
import { useStore } from '@/store/store'
import { Avatar, EpicTag, IssueTypeIcon, LabelTag, priorityOptions, useUserOptions } from '@/components/jira'
import { Popover, Select, SelectList, type Option } from '@/components/ui/overlay'
import { Toggle } from '@/components/ui/primitives'
import { cn, EPIC_COLORS, fmtDate, fmtDuration, parseDuration, timeAgo } from '@/lib/utils'
import { LabelEditor, fromDateInput, toDateInput } from './editors'
import { TimeTrackingBar } from './LogWorkModal'

function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[124px_1fr] items-start gap-3 py-1.5">
      <div className="pt-1.5 text-[13px] font-medium text-muted">{label}</div>
      <div className="min-w-0 text-[13px]">{children}</div>
    </div>
  )
}

const valueBtn = '-mx-2 flex min-h-8 w-[calc(100%+16px)] items-center gap-2 rounded-md px-2 py-1 text-left transition hover:bg-hover'
const None = ({ children = 'None' }: { children?: ReactNode }) => <span className="text-subtle">{children}</span>

/** Multi-select popover for components & fix versions. */
function MultiField({ value, options, onChange, empty }: { value: string[]; options: Option[]; onChange: (v: string[]) => void; empty: string }) {
  const labels = value.map((v) => options.find((o) => o.value === v)?.label).filter(Boolean)
  return (
    <Popover
      width={260}
      trigger={
        <button className={valueBtn}>
          {labels.length ? (
            <span className="flex flex-wrap gap-1">
              {labels.map((l) => (
                <span key={l} className="rounded border border-line bg-surface-3 px-1.5 text-[12px]">
                  {l}
                </span>
              ))}
            </span>
          ) : (
            <None />
          )}
        </button>
      }
    >
      <SelectList
        multi
        options={options}
        value={value}
        emptyText={empty}
        onSelect={(v) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])}
      />
    </Popover>
  )
}

function InlineText({ value, display, onSave, placeholder, validate, inputType = 'text' }: { value: string; display: ReactNode; onSave: (v: string) => void; placeholder?: string; validate?: (v: string) => string | null; inputType?: string }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const err = validate ? validate(draft) : null
  if (!editing)
    return (
      <button
        className={valueBtn}
        onClick={() => {
          setDraft(value)
          setEditing(true)
        }}
      >
        {display}
      </button>
    )
  const commit = () => {
    if (err) return
    if (draft !== value) onSave(draft)
    setEditing(false)
  }
  return (
    <div>
      <input
        autoFocus
        type={inputType}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') {
            e.preventDefault()
            setEditing(false)
          }
        }}
        className={cn('h-8 w-full rounded-md border bg-surface px-2 text-[13px] outline-none ring-2', err ? 'border-accent ring-accent-soft' : 'border-accent ring-accent-soft')}
      />
      {err && <div className="mt-1 text-[11px] text-accent">{err}</div>}
    </div>
  )
}

function DateField({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const overdue = value && toDateInput(value) < toDateInput(new Date().toISOString())
  return (
    <div className="-mx-2 flex items-center gap-1">
      <input
        type="date"
        value={toDateInput(value)}
        onChange={(e) => onChange(fromDateInput(e.target.value))}
        className={cn('h-8 flex-1 rounded-md border border-transparent bg-transparent px-2 text-[13px] outline-none hover:bg-hover focus:border-accent focus:bg-surface', !value && 'text-subtle', overdue && 'text-accent')}
      />
    </div>
  )
}

export interface DetailsControls {
  assigneeOpen: boolean
  setAssigneeOpen: (v: boolean) => void
  labelsEditing: boolean
  setLabelsEditing: (v: boolean) => void
  onLogWork: () => void
}

export function DetailsPanel({ issue, project, controls }: { issue: Issue; project: Project; controls: DetailsControls }) {
  const update = useStore((s) => s.updateIssue)
  const users = useStore((s) => s.users)
  const me = useStore((s) => s.currentUserId)
  const sprints = useStore((s) => s.sprints)
  const issues = useStore((s) => s.issues)
  const [open, setOpen] = useState(true)
  const [moreOpen, setMoreOpen] = useState(true)
  const set = (patch: Partial<Issue>) => update(issue.id, patch)
  const userOptions = useUserOptions(project.id, true)
  const reporterOptions = useUserOptions(undefined, false)
  const assignee = users.find((u) => u.id === issue.assigneeId)
  const reporter = users.find((u) => u.id === issue.reporterId)
  const epics = issues.filter((i) => i.projectId === project.id && i.type === 'epic' && i.id !== issue.id)
  const epic = issues.find((i) => i.id === issue.epicId)
  const parent = issues.find((i) => i.id === issue.parentId)
  const sprintOptions: Option[] = [
    { value: '__none', label: 'None (backlog)' },
    ...sprints
      .filter((s) => s.projectId === project.id && (s.state !== 'closed' || s.id === issue.sprintId))
      .sort((a, b) => a.order - b.order)
      .map((s) => ({ value: s.id, label: s.name, hint: s.state === 'active' ? 'Active' : s.state === 'closed' ? 'Closed' : undefined })),
  ]
  const sprint = sprints.find((s) => s.id === issue.sprintId)
  const isEpic = issue.type === 'epic'
  const isSub = issue.type === 'subtask'

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-line">
        <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between rounded-t-xl px-4 py-3 text-left hover:bg-hover">
          <span className="text-[14px] font-semibold">Details</span>
          <ChevronDown className={cn('size-4 text-muted transition', !open && '-rotate-90')} />
        </button>
        {open && (
          <div className="border-t border-line px-4 py-2">
            <Row label="Assignee">
              <Popover
                width={260}
                open={controls.assigneeOpen}
                onOpenChange={controls.setAssigneeOpen}
                trigger={
                  <button className={valueBtn}>
                    <Avatar user={assignee} size="sm" showTooltip={false} />
                    <span className={cn(!assignee && 'text-muted')}>{assignee?.name ?? 'Unassigned'}</span>
                  </button>
                }
              >
                <SelectList
                  options={userOptions}
                  value={issue.assigneeId ?? '__none'}
                  placeholder="Search people…"
                  onSelect={(v) => {
                    set({ assigneeId: v === '__none' ? null : v })
                    controls.setAssigneeOpen(false)
                  }}
                />
              </Popover>
              {issue.assigneeId !== me && (
                <button onClick={() => set({ assigneeId: me })} className="mt-0.5 text-[12px] font-medium text-accent hover:underline">
                  Assign to me
                </button>
              )}
            </Row>
            <Row label="Labels">
              {controls.labelsEditing ? (
                <div
                  onBlur={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) controls.setLabelsEditing(false)
                  }}
                >
                  <LabelEditor autoFocus value={issue.labels} onChange={(labels) => set({ labels })} onDone={() => controls.setLabelsEditing(false)} />
                </div>
              ) : (
                <button className={valueBtn} onClick={() => controls.setLabelsEditing(true)}>
                  {issue.labels.length ? (
                    <span className="flex flex-wrap gap-1">
                      {issue.labels.map((l) => (
                        <LabelTag key={l} label={l} />
                      ))}
                    </span>
                  ) : (
                    <None />
                  )}
                </button>
              )}
            </Row>
            {isEpic ? null : isSub ? (
              <Row label="Parent">
                <Select
                  value={issue.parentId}
                  onChange={(v) => set({ parentId: v })}
                  options={issues
                    .filter((i) => i.projectId === project.id && i.type !== 'epic' && i.type !== 'subtask')
                    .map((i) => ({ value: i.id, label: `${i.key} ${i.summary}`, icon: <IssueTypeIcon type={i.type} /> }))}
                  searchable
                  width={340}
                  className="-mx-2 h-8 w-[calc(100%+16px)] border-transparent bg-transparent px-2 hover:bg-hover"
                  renderValue={() => (parent ? <span className="truncate">{parent.key} {parent.summary}</span> : <None />)}
                />
              </Row>
            ) : (
              <Row label="Epic">
                <Select
                  value={issue.epicId ?? '__none'}
                  onChange={(v) => set({ epicId: v === '__none' ? null : v })}
                  options={[{ value: '__none', label: 'None' }, ...epics.map((e) => ({ value: e.id, label: e.summary, icon: <span className="size-3 rounded-sm" style={{ background: e.color ?? '#b48cff' }} />, hint: e.key }))]}
                  searchable
                  width={320}
                  className="-mx-2 h-8 w-[calc(100%+16px)] border-transparent bg-transparent px-2 hover:bg-hover"
                  renderValue={() => (epic ? <EpicTag epic={epic} /> : <None />)}
                />
              </Row>
            )}
            {project.type === 'scrum' && !isEpic && (
              <Row label="Sprint">
                <Select
                  value={issue.sprintId ?? '__none'}
                  onChange={(v) => set({ sprintId: v === '__none' ? null : v })}
                  options={sprintOptions}
                  disabled={isSub}
                  className="-mx-2 h-8 w-[calc(100%+16px)] border-transparent bg-transparent px-2 hover:bg-hover"
                  renderValue={() =>
                    sprint ? (
                      <span className="flex items-center gap-1.5 truncate">
                        {sprint.name}
                        {sprint.state === 'active' && <span className="rounded bg-progress px-1 text-[10px] font-bold text-progress-fg uppercase">Active</span>}
                      </span>
                    ) : (
                      <None />
                    )
                  }
                />
                {isSub && <div className="text-[11px] text-subtle">Sub-tasks follow their parent’s sprint</div>}
              </Row>
            )}
            {!isSub && (
              <Row label="Story points">
                <InlineText
                  value={issue.storyPoints?.toString() ?? ''}
                  inputType="number"
                  placeholder="e.g. 3"
                  display={issue.storyPoints != null ? <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[12px] font-semibold">{issue.storyPoints}</span> : <None />}
                  validate={(v) => (v === '' || (Number(v) >= 0 && Number(v) <= 999) ? null : 'Enter a number between 0 and 999')}
                  onSave={(v) => set({ storyPoints: v === '' ? null : Number(v) })}
                />
              </Row>
            )}
            <Row label="Reporter">
              <Popover
                width={260}
                trigger={
                  <button className={valueBtn}>
                    <Avatar user={reporter} size="sm" showTooltip={false} />
                    {reporter?.name}
                  </button>
                }
              >
                {(close) => (
                  <SelectList
                    options={reporterOptions}
                    value={issue.reporterId}
                    placeholder="Search people…"
                    onSelect={(v) => {
                      set({ reporterId: v })
                      close()
                    }}
                  />
                )}
              </Popover>
            </Row>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-line">
        <button onClick={() => setMoreOpen((v) => !v)} className="flex w-full items-center justify-between rounded-t-xl px-4 py-3 text-left hover:bg-hover">
          <span className="text-[14px] font-semibold">More fields</span>
          <span className="flex items-center gap-2 text-[12px] text-subtle">
            Priority, Components, Fix versions, Dates, Time tracking
            <ChevronDown className={cn('size-4 text-muted transition', !moreOpen && '-rotate-90')} />
          </span>
        </button>
        {moreOpen && (
          <div className="border-t border-line px-4 py-2">
            <Row label="Priority">
              <Select
                value={issue.priority}
                onChange={(v) => set({ priority: v })}
                options={priorityOptions}
                className="-mx-2 h-8 w-[calc(100%+16px)] border-transparent bg-transparent px-2 hover:bg-hover"
              />
            </Row>
            <Row label="Components">
              <MultiField
                value={issue.componentIds}
                onChange={(componentIds) => set({ componentIds })}
                empty="This project has no components"
                options={project.components.map((c) => ({ value: c.id, label: c.name }))}
              />
            </Row>
            <Row label="Fix versions">
              <MultiField
                value={issue.fixVersionIds}
                onChange={(fixVersionIds) => set({ fixVersionIds })}
                empty="This project has no versions"
                options={project.versions.filter((v) => !v.archived).map((v) => ({ value: v.id, label: v.name, hint: v.released ? 'Released' : undefined }))}
              />
            </Row>
            {isEpic && (
              <Row label="Start date">
                <DateField value={issue.startDate} onChange={(startDate) => set({ startDate })} />
              </Row>
            )}
            <Row label="Due date">
              <DateField value={issue.dueDate} onChange={(dueDate) => set({ dueDate })} />
            </Row>
            {isEpic && (
              <Row label="Epic colour">
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {EPIC_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => set({ color: c })}
                      aria-label={`Colour ${c}`}
                      className={cn('grid size-6 place-items-center rounded-md transition hover:scale-110', issue.color === c && 'ring-2 ring-fg ring-offset-2 ring-offset-surface')}
                      style={{ background: c }}
                    >
                      {issue.color === c && <Check className="size-3.5 text-[#160707]" strokeWidth={3} />}
                    </button>
                  ))}
                </div>
              </Row>
            )}
            <Row label="Original estimate">
              <InlineText
                value={issue.originalEstimate ? fmtDuration(issue.originalEstimate) : ''}
                placeholder="e.g. 1d 4h"
                display={issue.originalEstimate ? fmtDuration(issue.originalEstimate) : <None>0m</None>}
                validate={(v) => (v.trim() === '' || parseDuration(v) != null ? null : 'Use a format like 2w 4d 6h 45m')}
                onSave={(v) => set({ originalEstimate: v.trim() ? parseDuration(v) : null })}
              />
            </Row>
            <Row label="Time tracking">
              <button className="-mx-2 w-[calc(100%+16px)] rounded-md px-2 py-1.5 text-left hover:bg-hover" onClick={controls.onLogWork}>
                <TimeTrackingBar spent={issue.timeSpent} estimate={issue.originalEstimate} />
              </button>
            </Row>
            <Row label="Flagged">
              <div className="flex items-center gap-2 pt-1">
                <Toggle checked={issue.flagged} onChange={(flagged) => set({ flagged })} />
                {issue.flagged && (
                  <span className="flex items-center gap-1 text-[12px] font-medium text-accent">
                    <Flag className="size-3.5 fill-accent" /> Impediment
                  </span>
                )}
              </div>
            </Row>
          </div>
        )}
      </div>

      <div className="space-y-0.5 px-1 text-[12px] text-subtle">
        <div title={fmtDate(issue.createdAt, 'PPpp')}>Created {timeAgo(issue.createdAt)}</div>
        <div title={fmtDate(issue.updatedAt, 'PPpp')}>Updated {timeAgo(issue.updatedAt)}</div>
        {issue.resolvedAt && <div title={fmtDate(issue.resolvedAt, 'PPpp')}>Resolved {fmtDate(issue.resolvedAt, 'd MMM yyyy, HH:mm')}</div>}
      </div>
    </div>
  )
}
