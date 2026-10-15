import { Link } from 'react-router-dom'
import type { Project, WorkStyle } from '@/types'
import { useStore } from '@/store/store'
import { toast } from '@/store/ui'
import { CATEGORY_LABEL, WORK_COLOR, WORK_STYLES, WORK_VIEWS, inWorkView, styleLabel, trackLabel, type WorkView } from '@/lib/work'
import { Avatar, IssueTypeIcon, useIssueModal } from '@/components/jira'
import { Select } from '@/components/ui/overlay'
import { Button } from '@/components/ui/primitives'
import { TrackToggle, WorkStyleChooser } from '@/features/work/WorkUI'

const VIEW_COLOR: Partial<Record<WorkView, string>> = { operations: WORK_COLOR.operations, research: WORK_COLOR.research, implementation: WORK_COLOR.implementation }

export function WorkTypesTab({ project }: { project: Project }) {
  const updateProject = useStore((s) => s.updateProject)
  const updateIssue = useStore((s) => s.updateIssue)
  const allIssues = useStore((s) => s.issues)
  const users = useStore((s) => s.users)
  const { open: openIssue } = useIssueModal()
  const doneIds = new Set(project.statuses.filter((s) => s.category === 'done').map((s) => s.id))
  const open = allIssues.filter((i) => i.projectId === project.id && i.type !== 'epic' && !doneIds.has(i.statusId))
  const undecided = open.filter((i) => !i.track || (i.track === 'technical' && !i.workStyle)).sort((a, b) => a.rank - b.rank)

  const save = (patch: Partial<Project>, what: string) => {
    updateProject(project.id, patch)
    toast({ title: what, description: 'Applies to issues created from now on. Existing issues keep their own work type.', tone: 'success' })
  }

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h2 className="display text-2xl">Work types</h2>
        <p className="mt-1 text-sm text-muted">
          Operations work has an outcome, owner and deadline. Technical work also says how much investigation it needs — Implementation heavy (direct implementation or a focused
          investigation) or Research heavy (research-led). Unclassified work stays visible on every board.
        </p>
      </div>

      <section className="space-y-3">
        <h3 className="text-[15px] font-semibold">Open work</h3>
        <div className="grid gap-2 sm:grid-cols-5">
          {(['operations', 'research', 'implementation', 'technical', 'unclassified'] as WorkView[]).map((v) => {
            const n = open.filter((i) => (v === 'technical' ? i.track === 'technical' && !i.workStyle : inWorkView(i, v))).length
            return (
              <Link
                key={v}
                to={`/projects/${project.key}/backlog?work=${v}`}
                className="rounded-xl border border-line bg-surface-2 px-3 py-2.5 transition hover:border-line-strong"
              >
                <div className="flex items-center gap-1.5 text-[11.5px] text-muted">
                  {VIEW_COLOR[v] && <span className="size-2 rounded-full" style={{ background: VIEW_COLOR[v] }} />}
                  {v === 'technical' ? 'Technical, style not chosen' : WORK_VIEWS.find((x) => x.id === v)!.label}
                </div>
                <div className="display mt-0.5 text-2xl">{n}</div>
              </Link>
            )
          })}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-[15px] font-semibold">Defaults for new issues</h3>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[13px] text-muted">New issues start as</span>
          <TrackToggle value={project.defaultTrack ?? null} onChange={(defaultTrack) => save({ defaultTrack }, `New issues start as ${trackLabel(defaultTrack)}`)} />
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[13px] text-muted">Default technical work style</span>
            {project.defaultWorkStyle && (
              <Button size="xs" variant="subtle" onClick={() => save({ defaultWorkStyle: null }, 'No default work style')}>
                No default
              </Button>
            )}
          </div>
          <WorkStyleChooser value={project.defaultWorkStyle ?? null} onChange={(s) => save({ defaultWorkStyle: s }, `Default work style: ${styleLabel(s)}`)} />
          <p className="mt-2 text-[12px] text-subtle">A module can set its own default, and any task can use another option. Changing a default never changes in-progress tasks.</p>
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-[15px] font-semibold">Needs a work type</h3>
          <p className="mt-0.5 text-[12.5px] text-muted">
            Open issues without a work type or work style. Nothing is classified automatically — similar titles are only hints. Teammates can keep working on them meanwhile.
          </p>
        </div>
        {undecided.length === 0 ? (
          <p className="text-[13px] text-subtle">Every open issue has a work type.</p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {undecided.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                <IssueTypeIcon type={i.type} />
                <button onClick={() => openIssue(i.key)} className="min-w-0 flex-1 truncate text-left text-[13px] hover:underline">
                  <span className="mr-2 font-medium text-muted">{i.key}</span>
                  {i.summary}
                </button>
                <Avatar user={users.find((u) => u.id === i.assigneeId)} size="xs" />
                <TrackToggle value={i.track ?? null} onChange={(track) => updateIssue(i.id, { track })} />
                {i.track === 'technical' && (
                  <Select<string>
                    value={i.workStyle ?? null}
                    placeholder="Work style…"
                    width={300}
                    onChange={(v) => updateIssue(i.id, { workStyle: v as WorkStyle })}
                    options={WORK_STYLES.map((s) => ({ value: s.id, label: s.label, hint: CATEGORY_LABEL[s.category] }))}
                    className="h-8 w-44 text-[13px]"
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
