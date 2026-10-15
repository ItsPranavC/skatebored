import { useMemo, useRef, useState } from 'react'
import { matchPath, useLocation, useNavigate } from 'react-router-dom'
import type { Issue, IssueType, Priority, WorkStyle, WorkTrack } from '@/types'
import { useStore } from '@/store/store'
import { useUI, toast } from '@/store/ui'
import { Avatar, IssueTypeIcon, issueTypeOptions, LabelTag, priorityOptions, StatusLozenge, useUserOptions } from '@/components/jira'
import { Modal, Select } from '@/components/ui/overlay'
import { Button, Checkbox, Field, Input, Kbd } from '@/components/ui/primitives'
import { ProjectAvatar } from '@/layout/TopNav'
import { LabelEditor, MentionTextarea, fromDateInput, toDateInput } from './editors'
import { TrackToggle, WorkStyleChooser } from '@/features/work/WorkUI'
import { OPERATIONS_FIRST_PROMPT, isWorkView, styleInfo, viewDefaults } from '@/lib/work'

export function CreateIssueModal() {
  const open = useUI((s) => s.createOpen)
  const close = useUI((s) => s.closeCreate)
  const defaults = useUI((s) => s.createDefaults)
  if (!open) return null
  return <CreateIssueForm defaults={defaults} onClose={close} />
}

function CreateIssueForm({ defaults, onClose }: { defaults: Partial<Issue>; onClose: () => void }) {
  const projects = useStore((s) => s.projects)
  const recent = useStore((s) => s.recent)
  const sprints = useStore((s) => s.sprints)
  const issues = useStore((s) => s.issues)
  const users = useStore((s) => s.users)
  const me = useStore((s) => s.currentUserId)
  const createIssue = useStore((s) => s.createIssue)
  const location = useLocation()
  const navigate = useNavigate()

  const parent = defaults.parentId ? issues.find((i) => i.id === defaults.parentId) : undefined
  const initialProjectId = useMemo(() => {
    if (parent) return parent.projectId
    if (defaults.projectId) return defaults.projectId
    const m = matchPath('/projects/:projectKey/*', location.pathname)
    const fromRoute = m && projects.find((p) => p.key.toLowerCase() === m.params.projectKey?.toLowerCase())
    if (fromRoute) return fromRoute.id
    const r = recent.find((x) => x.kind === 'project' && projects.some((p) => p.id === x.id))
    return r?.id ?? projects[0]?.id ?? ''
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const [projectId, setProjectId] = useState(initialProjectId)
  const project = projects.find((p) => p.id === projectId)
  const [type, setType] = useState<IssueType>(parent ? 'subtask' : (defaults.type ?? 'task'))
  const [statusId, setStatusId] = useState<string | null>(defaults.statusId ?? null)
  const [summary, setSummary] = useState(defaults.summary ?? '')
  const [description, setDescription] = useState(defaults.description ?? '')
  const [assigneeId, setAssigneeId] = useState<string | null>(defaults.assigneeId ?? null)
  const [reporterId, setReporterId] = useState<string>(defaults.reporterId ?? me)
  const [priority, setPriority] = useState<Priority>(defaults.priority ?? 'medium')
  const [labels, setLabels] = useState<string[]>(defaults.labels ?? [])
  const [labelsEditing, setLabelsEditing] = useState(false)
  const [sprintId, setSprintId] = useState<string | null>(defaults.sprintId !== undefined ? defaults.sprintId : null)
  const [storyPoints, setStoryPoints] = useState(defaults.storyPoints?.toString() ?? '')
  const [epicId, setEpicId] = useState<string | null>(defaults.epicId ?? parent?.epicId ?? null)
  const [dueDate, setDueDate] = useState<string | null>(defaults.dueDate ?? null)
  const modules = useStore((s) => s.modules)
  // Creating from the Operations / Technical view of a board or backlog starts in that view.
  const fromView = useMemo(() => {
    const v = new URLSearchParams(location.search).get('work')
    return projectId === initialProjectId && isWorkView(v) ? viewDefaults(v) : {}
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const [moduleId, setModuleId] = useState<string | null>(defaults.moduleId ?? parent?.moduleId ?? null)
  const module = modules.find((m) => m.id === moduleId)
  const [track, setTrack] = useState<WorkTrack | null>(
    defaults.track !== undefined ? defaults.track : (parent?.track ?? (module ? 'technical' : (fromView.track ?? project?.defaultTrack ?? null))),
  )
  // null = not chosen yet; the default is pre-selected but stays visible as a choice
  const [workStyle, setWorkStyle] = useState<WorkStyle | null>(
    defaults.workStyle !== undefined ? defaults.workStyle : (parent?.workStyle ?? module?.defaultWorkStyle ?? fromView.workStyle ?? project?.defaultWorkStyle ?? null),
  )
  const [firstAnswer, setFirstAnswer] = useState('')
  const style = track === 'technical' ? styleInfo(workStyle) : undefined
  const firstField = track === 'operations' ? 'outcome' : style?.firstField
  const firstPrompt = track === 'operations' ? OPERATIONS_FIRST_PROMPT : style?.firstPrompt
  const [another, setAnother] = useState(false)
  const [tried, setTried] = useState(false)
  const summaryRef = useRef<HTMLInputElement>(null)

  const userOptions = useUserOptions(projectId, true)
  const reporterOptions = useUserOptions(undefined, false)
  const statuses = project?.statuses ?? []
  const effectiveStatus = statuses.find((s) => s.id === statusId) ?? statuses.find((s) => s.category === 'todo') ?? statuses[0]
  const projectSprints = sprints.filter((s) => s.projectId === projectId && s.state !== 'closed').sort((a, b) => a.order - b.order)
  const epics = issues.filter((i) => i.projectId === projectId && i.type === 'epic')
  const pointsInvalid = storyPoints !== '' && !(Number(storyPoints) >= 0 && Number(storyPoints) <= 999)
  const summaryError = tried && !summary.trim() ? 'Summary is required' : summary.length > 255 ? 'Summary must be under 255 characters' : undefined

  const changeProject = (id: string) => {
    setProjectId(id)
    setStatusId(null)
    setSprintId(null)
    setEpicId(null)
    setModuleId(null)
    const p = projects.find((x) => x.id === id)
    if (p && defaults.track === undefined) {
      setTrack(p.defaultTrack ?? null)
      setWorkStyle(p.defaultWorkStyle ?? null)
    }
    if (assigneeId && p && !p.memberIds.includes(assigneeId)) setAssigneeId(null)
  }

  const submit = () => {
    setTried(true)
    if (!project || !summary.trim() || summary.length > 255 || pointsInvalid) {
      summaryRef.current?.focus()
      return
    }
    const issue = createIssue({
      projectId,
      type,
      summary: summary.trim(),
      description: description.trim(),
      statusId: effectiveStatus?.id,
      assigneeId,
      reporterId,
      priority,
      labels,
      sprintId: type === 'epic' ? null : parent ? parent.sprintId : sprintId,
      storyPoints: storyPoints === '' || type === 'subtask' ? null : Number(storyPoints),
      epicId: type === 'epic' ? null : epicId,
      parentId: parent?.id ?? null,
      dueDate,
      track,
      workStyle: track === 'technical' ? workStyle : null,
      moduleId: track === 'technical' ? moduleId : null,
      brief: firstField && firstAnswer.trim() ? { [firstField]: firstAnswer.trim() } : {},
    })
    toast({
      title: `${issue.key} has been created`,
      description: issue.summary,
      tone: 'success',
      action: {
        label: 'View issue',
        onClick: () => {
          const params = new URLSearchParams(window.location.search)
          params.set('selectedIssue', issue.key)
          navigate(`${window.location.pathname}?${params}`)
        },
      },
    })
    if (another) {
      setSummary('')
      setDescription('')
      setFirstAnswer('')
      setTried(false)
      summaryRef.current?.focus()
    } else onClose()
  }

  const fieldBox = 'w-full'

  return (
    <Modal
      open
      onClose={onClose}
      title={parent ? `Create sub-task in ${parent.key}` : 'Create issue'}
      width={760}
      footer={
        <>
          <Checkbox checked={another} onChange={setAnother} label={<span className="text-[13px] text-muted">Create another</span>} className="mr-auto" />
          <span className="mr-2 hidden text-[11px] text-subtle sm:inline">
            <Kbd>⌘</Kbd> <Kbd>Enter</Kbd>
          </span>
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit}>
            Create
          </Button>
        </>
      }
    >
      <div
        className="space-y-4"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            submit()
          }
        }}
      >
        <p className="text-[12px] text-subtle">
          Required fields are marked with an asterisk <span className="text-accent">*</span>
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Project" required>
            <Select
              value={projectId}
              onChange={changeProject}
              disabled={!!parent}
              className={fieldBox}
              options={projects.map((p) => ({ value: p.id, label: `${p.name} (${p.key})`, icon: <ProjectAvatar project={p} size={18} /> }))}
            />
          </Field>
          <Field label="Issue type" required>
            <Select<IssueType>
              value={type}
              onChange={setType}
              disabled={!!parent}
              className={fieldBox}
              options={parent ? issueTypeOptions(false, true).filter((o) => o.value === 'subtask') : issueTypeOptions(true, false)}
            />
          </Field>
        </div>

        <div className="h-px bg-line" />

        <Field label="Status" hint="This is the issue’s initial status upon creation">
          <Select
            value={effectiveStatus?.id ?? null}
            onChange={setStatusId}
            className="w-56"
            options={statuses.map((s) => ({ value: s.id, label: s.name }))}
            renderValue={() => <StatusLozenge status={effectiveStatus} className="flex-none" />}
          />
        </Field>

        <Field label="Summary" required error={summaryError}>
          <Input ref={summaryRef} autoFocus value={summary} onChange={(e) => setSummary(e.target.value)} invalid={!!summaryError} placeholder="What needs to be done?" />
        </Field>

        {type !== 'epic' && (
          <div className="space-y-3 rounded-xl border border-line px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-muted">Work type</span>
              <TrackToggle value={track} onChange={setTrack} />
            </div>
            {track === 'technical' && (
              <div>
                <div className="mb-1.5 text-[13px] font-semibold">How much investigation does this work need?</div>
                <WorkStyleChooser value={workStyle} onChange={setWorkStyle} compact />
              </div>
            )}
            {track === 'technical' && modules.some((m) => m.projectId === projectId) && (
              <Field label="Module" hint="Optional — opens a shared brief with related tasks">
                <Select
                  value={moduleId ?? '__none'}
                  onChange={(v) => {
                    const id = v === '__none' ? null : v
                    setModuleId(id)
                    const m = modules.find((x) => x.id === id)
                    if (m?.defaultWorkStyle && !workStyle) setWorkStyle(m.defaultWorkStyle)
                  }}
                  className={fieldBox}
                  options={[{ value: '__none', label: 'None' }, ...modules.filter((m) => m.projectId === projectId).map((m) => ({ value: m.id, label: m.name }))]}
                />
              </Field>
            )}
            {firstPrompt && (
              <Field label={firstPrompt} hint="Optional now — owner, dates and references can be added as the work becomes clearer.">
                <MentionTextarea value={firstAnswer} onChange={setFirstAnswer} rows={2} placeholder="A rough answer is fine" />
              </Field>
            )}
          </div>
        )}

        <Field label="Description">
          <MentionTextarea value={description} onChange={setDescription} rows={5} placeholder="Add more detail. Supports **bold**, `code`, - lists and @mentions." />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Field label="Assignee">
              <Select
                value={assigneeId ?? '__none'}
                onChange={(v) => setAssigneeId(v === '__none' ? null : v)}
                options={userOptions}
                searchable
                className={fieldBox}
              />
            </Field>
            {assigneeId !== me && (
              <button onClick={() => setAssigneeId(me)} className="mt-1 text-[12px] font-medium text-accent hover:underline">
                Assign to me
              </button>
            )}
          </div>
          <Field label="Reporter" required>
            <Select value={reporterId} onChange={setReporterId} options={reporterOptions} searchable className={fieldBox} />
          </Field>
          <Field label="Priority">
            <Select<Priority> value={priority} onChange={setPriority} options={priorityOptions} className={fieldBox} />
          </Field>
          {type !== 'subtask' && (
            <Field label="Story point estimate" error={pointsInvalid ? 'Enter a number between 0 and 999' : undefined}>
              <Input type="number" min={0} value={storyPoints} onChange={(e) => setStoryPoints(e.target.value)} invalid={pointsInvalid} placeholder="e.g. 3" />
            </Field>
          )}
          {project?.type === 'scrum' && type !== 'epic' && !parent && (
            <Field label="Sprint">
              <Select
                value={sprintId ?? '__none'}
                onChange={(v) => setSprintId(v === '__none' ? null : v)}
                className={fieldBox}
                options={[{ value: '__none', label: 'Backlog (no sprint)' }, ...projectSprints.map((s) => ({ value: s.id, label: s.name, hint: s.state === 'active' ? 'Active' : undefined }))]}
              />
            </Field>
          )}
          {type !== 'epic' && !parent && (
            <Field label="Epic link">
              <Select
                value={epicId ?? '__none'}
                onChange={(v) => setEpicId(v === '__none' ? null : v)}
                className={fieldBox}
                searchable
                options={[
                  { value: '__none', label: 'None' },
                  ...epics.map((e) => ({ value: e.id, label: e.summary, hint: e.key, icon: <span className="size-3 rounded-sm" style={{ background: e.color ?? '#b48cff' }} /> })),
                ]}
              />
            </Field>
          )}
          <Field label="Due date">
            <Input type="date" value={toDateInput(dueDate)} onChange={(e) => setDueDate(fromDateInput(e.target.value))} />
          </Field>
        </div>

        <div>
          <span className="mb-1 block text-xs font-semibold text-muted">Labels</span>
          {labelsEditing ? (
            <div
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setLabelsEditing(false)
              }}
            >
              <LabelEditor autoFocus value={labels} onChange={setLabels} onDone={() => setLabelsEditing(false)} />
            </div>
          ) : (
            <button
              onClick={() => setLabelsEditing(true)}
              className="flex min-h-9 w-full flex-wrap items-center gap-1 rounded-lg border border-line bg-surface-2 px-3 py-1 text-left text-sm hover:bg-surface-3"
            >
              {labels.length ? labels.map((l) => <LabelTag key={l} label={l} />) : <span className="text-subtle">Select or create labels</span>}
            </button>
          )}
        </div>

        {parent && (
          <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-[13px]">
            <span className="text-muted">Parent</span>
            <IssueTypeIcon type={parent.type} />
            <span className="font-medium">{parent.key}</span>
            <span className="truncate text-muted">{parent.summary}</span>
            <span className="ml-auto">
              <Avatar user={users.find((u) => u.id === parent.assigneeId)} size="xs" />
            </span>
          </div>
        )}
      </div>
    </Modal>
  )
}
