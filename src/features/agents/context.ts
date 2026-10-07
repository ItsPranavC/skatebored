import { differenceInCalendarDays } from 'date-fns'
import type { Issue, Project } from '@/types'
import type { State } from '@/store/store'
import { fmtDate, fmtDuration, issueTypeLabel, priorityLabel, timeAgo } from '@/lib/utils'
import { measure, type AgentDef, type LaunchTarget } from './agents'

export interface ContextOptions {
  comments: boolean
  related: boolean
  epic: boolean
  conventions: boolean
  instructions: string
}

export const DEFAULT_CONTEXT: ContextOptions = { comments: true, related: true, epic: true, conventions: true, instructions: '' }

export function branchName(issue: Issue) {
  const slug = issue.summary
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 6)
    .join('-')
  return `${issue.key}-${slug}`.slice(0, 60).replace(/-+$/, '')
}

type Ctx = Pick<State, 'issues' | 'users' | 'sprints' | 'comments' | 'projects'>

/** Detail levels, richest first. fitPrompt walks down until the prompt fits the tool's limit. */
interface Level {
  comments: number
  epicDescription: boolean
  related: boolean
  descriptionChars: number
}
const LEVELS: Level[] = [
  { comments: 8, epicDescription: true, related: true, descriptionChars: Infinity },
  { comments: 3, epicDescription: true, related: true, descriptionChars: Infinity },
  { comments: 3, epicDescription: false, related: true, descriptionChars: Infinity },
  { comments: 0, epicDescription: false, related: true, descriptionChars: 2500 },
  { comments: 0, epicDescription: false, related: false, descriptionChars: 1200 },
  { comments: 0, epicDescription: false, related: false, descriptionChars: 500 },
]

function render(issue: Issue, project: Project, s: Ctx, o: ContextOptions, lvl: Level, url: string): string {
  const user = (id: string | null) => s.users.find((u) => u.id === id)?.name ?? 'Unassigned'
  const status = (i: Issue) => s.projects.find((p) => p.id === i.projectId)?.statuses.find((x) => x.id === i.statusId)?.name ?? '—'
  const sprint = s.sprints.find((x) => x.id === issue.sprintId)
  const epic = s.issues.find((x) => x.id === issue.epicId)
  const parent = s.issues.find((x) => x.id === issue.parentId)
  const subtasks = s.issues.filter((x) => x.parentId === issue.id)
  const children = issue.type === 'epic' ? s.issues.filter((x) => x.epicId === issue.id && x.type !== 'subtask') : []
  const out: string[] = []

  out.push(`# ${issue.key}: ${issue.summary}`)
  out.push('')
  out.push(`Work on ${project.key} ticket ${issue.key} from the ${project.name} scrum board. Read the context below, explore the codebase, then implement it. Ask me before making large or risky changes.`)
  out.push('')
  out.push('## Ticket')
  const facts = [
    `Type: ${issueTypeLabel(issue.type)}`,
    `Status: ${status(issue)}`,
    `Priority: ${priorityLabel(issue.priority)}`,
    issue.storyPoints != null ? `Story points: ${issue.storyPoints}` : null,
    issue.originalEstimate ? `Estimate: ${fmtDuration(issue.originalEstimate)}` : null,
  ].filter(Boolean)
  out.push(`- ${facts.join(' · ')}`)
  out.push(`- Assignee: ${user(issue.assigneeId)} · Reporter: ${user(issue.reporterId)}`)
  if (sprint) {
    const left = sprint.endDate ? differenceInCalendarDays(new Date(sprint.endDate), new Date()) : null
    out.push(`- Sprint: ${sprint.name}${left != null && sprint.state === 'active' ? ` (${left >= 0 ? `${left} days left` : 'overdue'})` : ''}${sprint.goal ? ` — goal: ${sprint.goal}` : ''}`)
  }
  if (parent) out.push(`- Parent: ${parent.key} ${parent.summary}`)
  if (epic) out.push(`- Epic: ${epic.key} ${epic.summary}`)
  if (issue.labels.length) out.push(`- Labels: ${issue.labels.join(', ')}`)
  const comps = issue.componentIds.map((id) => project.components.find((c) => c.id === id)?.name).filter(Boolean)
  if (comps.length) out.push(`- Components: ${comps.join(', ')}`)
  const versions = issue.fixVersionIds.map((id) => project.versions.find((v) => v.id === id)?.name).filter(Boolean)
  if (versions.length) out.push(`- Fix version: ${versions.join(', ')}`)
  if (issue.dueDate) out.push(`- Due: ${fmtDate(issue.dueDate)}`)
  if (issue.flagged) out.push('- ⚑ Flagged as an impediment')
  out.push(`- Link: ${url}`)

  out.push('')
  out.push('## Description')
  const desc = issue.description.trim() || '_No description provided._'
  out.push(desc.length > lvl.descriptionChars ? `${desc.slice(0, lvl.descriptionChars).trimEnd()}… _(truncated — see ${url})_` : desc)

  if (o.epic && epic && lvl.epicDescription && epic.description.trim()) {
    out.push('')
    out.push(`## Epic context — ${epic.key} ${epic.summary}`)
    out.push(epic.description.trim().slice(0, 1200))
  }

  if (o.related && lvl.related) {
    if (subtasks.length) {
      out.push('')
      out.push('## Sub-tasks')
      for (const t of subtasks) out.push(`- [${status(t) === 'Done' ? 'x' : ' '}] ${t.key} ${t.summary} (${status(t)}, ${user(t.assigneeId)})`)
    }
    if (children.length) {
      out.push('')
      out.push('## Issues in this epic')
      for (const t of children.slice(0, 25)) out.push(`- ${t.key} ${t.summary} (${status(t)})`)
    }
    if (issue.links.length) {
      out.push('')
      out.push('## Linked issues')
      for (const l of issue.links) {
        const t = s.issues.find((x) => x.id === l.issueId)
        if (t) out.push(`- ${l.type} ${t.key}: ${t.summary} (${status(t)})`)
      }
    }
    if (issue.attachments.length) {
      out.push('')
      out.push('## Attachments')
      for (const a of issue.attachments) out.push(`- ${a.name} (${a.mime || 'file'}) — available on the ticket`)
    }
  }

  if (o.comments && lvl.comments > 0) {
    const cs = s.comments
      .filter((c) => c.issueId === issue.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(-lvl.comments)
    if (cs.length) {
      out.push('')
      out.push('## Discussion (most recent comments)')
      for (const c of cs) out.push(`- ${user(c.authorId)}, ${timeAgo(c.createdAt)}: ${c.body.replace(/\s*\n\s*/g, ' ').slice(0, 400)}`)
    }
  }

  if (o.conventions || o.instructions.trim()) {
    out.push('')
    out.push('## How to work')
    if (o.conventions) {
      out.push(`- Create a branch: \`git checkout -b ${branchName(issue)}\``)
      out.push(`- Prefix commit messages and the PR title with \`${issue.key}\` so the board links them.`)
      out.push('- Add or update tests for the change, and run the existing test suite before finishing.')
      out.push(`- When done, summarise what changed, how you verified it, and anything left open for ${issue.key}.`)
    }
    for (const line of o.instructions.split('\n').map((l) => l.trim()).filter(Boolean)) out.push(`- ${line.replace(/^-\s*/, '')}`)
  }
  return out.join('\n')
}

export interface FittedPrompt {
  prompt: string
  /** The richest version, for clipboard / download when the launch channel had to trim. */
  full: string
  trimmed: boolean
  hardCut: boolean
}

export function buildIssueContext(issue: Issue, s: Ctx, o: ContextOptions, origin = window.location.origin): string {
  const project = s.projects.find((p) => p.id === issue.projectId)!
  return render(issue, project, s, o, LEVELS[0]!, `${origin}/browse/${issue.key}`)
}

/** Builds the richest prompt that fits the agent's launch limit. */
export function fitPrompt(issue: Issue, s: Ctx, o: ContextOptions, agent: AgentDef, target: LaunchTarget, origin = window.location.origin): FittedPrompt {
  const project = s.projects.find((p) => p.id === issue.projectId)!
  const url = `${origin}/browse/${issue.key}`
  const full = render(issue, project, s, o, LEVELS[0]!, url)
  const budget = agent.limit
  for (const [k, lvl] of LEVELS.entries()) {
    const p = k === 0 ? full : render(issue, project, s, o, lvl, url)
    if (measure(agent, p, target) <= budget) return { prompt: p, full, trimmed: k > 0, hardCut: false }
  }
  // Last resort: hard cut the smallest rendering (rare — giant summaries/instructions).
  let p = render(issue, project, s, o, LEVELS[LEVELS.length - 1]!, url)
  const note = `\n\n…(trimmed to fit ${agent.name}. Full ticket: ${url})`
  while (p.length > 0 && measure(agent, p + note, target) > budget) p = p.slice(0, Math.floor(p.length * 0.9))
  return { prompt: p + note, full, trimmed: true, hardCut: true }
}
