import type { ReactNode } from 'react'
import { Maximize2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useStore } from '@/store/store'
import { Avatar, EpicTag, IssueTypeIcon, LabelTag, PriorityIcon, StatusPicker, StoryPoints, useIssueModal } from '@/components/jira'
import { Button } from '@/components/ui/primitives'
import { fmtDate, fmtDuration, priorityLabel, timeAgo } from '@/lib/utils'
import type { Issue } from '@/types'

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] items-center gap-3 py-1.5 text-[13px]">
      <span className="text-muted">{label}</span>
      <span className="min-w-0">{children}</span>
    </div>
  )
}

/** Compact read-mostly issue summary for the navigator's detail view. */
export function IssueDetailCard({ issue }: { issue: Issue }) {
  const project = useStore((s) => s.projects.find((p) => p.id === issue.projectId))
  const users = useStore((s) => s.users)
  const epic = useStore((s) => (issue.epicId ? s.issues.find((i) => i.id === issue.epicId) : undefined))
  const sprint = useStore((s) => (issue.sprintId ? s.sprints.find((x) => x.id === issue.sprintId) : undefined))
  const commentCount = useStore((s) => s.comments.reduce((n, c) => n + (c.issueId === issue.id ? 1 : 0), 0))
  const { open } = useIssueModal()
  const assignee = users.find((u) => u.id === issue.assigneeId)
  const reporter = users.find((u) => u.id === issue.reporterId)
  if (!project) return null
  return (
    <div className="animate-slide p-6">
      <div className="mb-2 flex items-center gap-2 text-[13px] text-muted">
        <IssueTypeIcon type={issue.type} />
        <Link to={`/projects/${project.key}/board`} className="hover:underline">
          {project.name}
        </Link>
        <span>/</span>
        <Link to={`/browse/${issue.key}`} className="font-medium hover:text-accent hover:underline">
          {issue.key}
        </Link>
        <div className="flex-1" />
        <Button size="sm" icon={<Maximize2 className="size-3.5" />} onClick={() => open(issue.key)}>
          Open
        </Button>
      </div>
      <h2 className="display mb-4 text-[24px]">{issue.summary}</h2>
      <div className="mb-5">
        <StatusPicker issue={issue} project={project} />
      </div>
      <div className="rounded-xl border border-line px-4 py-2">
        <Row label="Assignee">
          <span className="flex items-center gap-2">
            <Avatar user={assignee} size="xs" showTooltip={false} />
            {assignee?.name ?? <span className="text-muted">Unassigned</span>}
          </span>
        </Row>
        <Row label="Reporter">
          <span className="flex items-center gap-2">
            <Avatar user={reporter} size="xs" showTooltip={false} />
            {reporter?.name}
          </span>
        </Row>
        <Row label="Priority">
          <span className="flex items-center gap-1.5">
            <PriorityIcon priority={issue.priority} /> {priorityLabel(issue.priority)}
          </span>
        </Row>
        {issue.storyPoints != null && (
          <Row label="Story points">
            <StoryPoints value={issue.storyPoints} />
          </Row>
        )}
        {epic && (
          <Row label="Epic">
            <EpicTag epic={epic} />
          </Row>
        )}
        {sprint && <Row label="Sprint">{sprint.name}</Row>}
        {issue.labels.length > 0 && (
          <Row label="Labels">
            <span className="flex flex-wrap gap-1">
              {issue.labels.map((l) => (
                <LabelTag key={l} label={l} />
              ))}
            </span>
          </Row>
        )}
        {issue.dueDate && <Row label="Due">{fmtDate(issue.dueDate)}</Row>}
        {issue.originalEstimate != null && (
          <Row label="Time tracking">
            {fmtDuration(issue.timeSpent) || '0m'} logged of {fmtDuration(issue.originalEstimate)}
          </Row>
        )}
      </div>
      <h3 className="mt-6 mb-2 text-xs font-semibold tracking-wide text-subtle uppercase">Description</h3>
      {issue.description ? (
        <div className="prose-sb line-clamp-[12] text-[14px] text-fg">{issue.description}</div>
      ) : (
        <p className="text-[13px] text-subtle italic">No description</p>
      )}
      <div className="mt-6 flex gap-4 border-t border-line pt-3 text-[12px] text-subtle">
        <span>Created {timeAgo(issue.createdAt)}</span>
        <span>Updated {timeAgo(issue.updatedAt)}</span>
        <span>
          {commentCount} comment{commentCount === 1 ? '' : 's'}
        </span>
      </div>
    </div>
  )
}
