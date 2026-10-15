import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, BookOpenText, Check, ChevronDown, CircleHelp, Layers, Plus, Telescope } from 'lucide-react'
import type { Issue, Project, WorkModule, WorkStyle } from '@/types'
import { useStore } from '@/store/store'
import { toast } from '@/store/ui'
import { cn } from '@/lib/utils'
import { ALL_TASK_FIELDS, OPERATIONS_FIRST_PROMPT, WORK_COLOR, completionChecks, styleInfo, taskGroups, workColor, workDescription } from '@/lib/work'
import { Button, Input } from '@/components/ui/primitives'
import { Modal, Popover, Select } from '@/components/ui/overlay'
import { StatusLozenge, useIssueModal } from '@/components/jira'
import { SectionTitle } from '@/features/issue/Sections'
import { BriefTextField, ReadField, ReferenceList } from './BriefFields'
import { WorkIcon, WorkStyleChooser } from './WorkUI'
import { moduleUrl } from './hooks'

/** Focused investigations raised from this issue: its sub-tasks plus linked issues. */
function useQuestions(issue: Issue) {
  const issues = useStore((s) => s.issues)
  return useMemo(() => {
    const linked = new Set(issue.links.map((l) => l.issueId))
    return issues.filter((i) => i.workStyle === 'focused' && i.id !== issue.id && (i.parentId === issue.id || linked.has(i.id)))
  }, [issues, issue.id, issue.links])
}

/** Where "Continue implementation" goes: the parent, or the first linked non-question issue. */
function useContinueTarget(issue: Issue) {
  const issues = useStore((s) => s.issues)
  return useMemo(() => {
    if (issue.parentId) return issues.find((i) => i.id === issue.parentId)
    const linked = new Set(issue.links.map((l) => l.issueId))
    return issues.find((i) => linked.has(i.id) && i.workStyle !== 'focused')
  }, [issues, issue.parentId, issue.links])
}

function AddQuestion({ issue }: { issue: Issue }) {
  const createIssue = useStore((s) => s.createIssue)
  const addLink = useStore((s) => s.addLink)
  const { open: openIssue } = useIssueModal()
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const add = () => {
    const q = text.trim()
    if (!q) return
    // Sub-task of this issue (or of its parent, for sub-tasks); a task in the epic, for epics.
    const isSub = issue.type === 'subtask'
    const created = createIssue({
      projectId: issue.projectId,
      type: issue.type === 'epic' ? 'task' : 'subtask',
      parentId: issue.type === 'epic' ? null : isSub ? issue.parentId : issue.id,
      epicId: issue.type === 'epic' ? issue.id : issue.epicId,
      sprintId: issue.type === 'epic' ? null : issue.sprintId,
      summary: `Question: ${q}`.slice(0, 255),
      track: 'technical',
      workStyle: 'focused',
      moduleId: issue.moduleId ?? null,
      assigneeId: issue.assigneeId,
      brief: { question: q },
    })
    if (created.parentId !== issue.id) addLink(created.id, 'relates to', issue.id)
    setText('')
    setOpen(false)
    toast({
      title: `${created.key} — question added`,
      description: 'Answer it there, then continue implementation here.',
      tone: 'success',
      action: { label: 'Open', onClick: () => openIssue(created.key) },
    })
  }
  if (!open)
    return (
      <Button size="xs" variant="subtle" icon={<CircleHelp className="size-3.5" />} onClick={() => setOpen(true)}>
        Add a question
      </Button>
    )
  return (
    <div className="flex gap-2">
      <Input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') add()
          if (e.key === 'Escape') setOpen(false)
        }}
        placeholder="What do we need to find out before continuing?"
        className="h-8 text-[13px]"
      />
      <Button size="sm" variant="primary" onClick={add} disabled={!text.trim()}>
        Add
      </Button>
      <Button size="sm" variant="subtle" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </div>
  )
}

function Questions({ issue, project }: { issue: Issue; project: Project }) {
  const questions = useQuestions(issue)
  const { open: openIssue } = useIssueModal()
  return (
    <div className="space-y-2">
      <div className="text-[12.5px] font-semibold">Questions</div>
      {questions.length > 0 && (
        <ul className="space-y-1.5">
          {questions.map((q) => (
            <li key={q.id} className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-[13px]">
              <div className="flex items-center gap-2">
                <button onClick={() => openIssue(q.key)} className="font-medium text-muted hover:text-fg hover:underline">
                  {q.key}
                </button>
                <span className="min-w-0 flex-1 truncate">{q.brief?.question || q.summary}</span>
                <StatusLozenge status={project.statuses.find((s) => s.id === q.statusId)} />
              </div>
              {q.brief?.answer?.trim() ? (
                <div className="mt-1 border-l-2 border-[#6ea0ff]/60 pl-2 text-[12.5px] text-muted">
                  <span className="font-semibold text-fg">Answer: </span>
                  {q.brief.answer}
                  {q.brief.implication?.trim() && (
                    <div>
                      <span className="font-semibold text-fg">Effect on this work: </span>
                      {q.brief.implication}
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-0.5 text-[12px] text-subtle">Not answered yet</div>
              )}
            </li>
          ))}
        </ul>
      )}
      <AddQuestion issue={issue} />
    </div>
  )
}

function ModuleRow({ issue, project, module }: { issue: Issue; project: Project; module?: WorkModule }) {
  const modules = useStore((s) => s.modules)
  const update = useStore((s) => s.updateIssue)
  const createModule = useStore((s) => s.createModule)
  const navigate = useNavigate()
  const projectModules = modules.filter((m) => m.projectId === project.id)
  if (module)
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2.5">
        <Layers className="size-4 text-muted" />
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold tracking-wide text-subtle uppercase">Shared module brief</div>
          <div className="truncate text-[13.5px] font-semibold">{module.name}</div>
        </div>
        <Button size="sm" variant="default" iconRight={<ArrowRight className="size-3.5" />} onClick={() => navigate(moduleUrl(project, module, issue.key))}>
          Open module brief
        </Button>
      </div>
    )
  return (
    <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
      <Layers className="size-3.5" />
      <span>No module linked — optional.</span>
      <div className="w-56">
        <Select<string>
          value={null}
          placeholder="Link a module…"
          onChange={(v) => {
            if (v === '__new') {
              const m = createModule({ projectId: project.id, name: issue.summary.replace(/^Question:\s*/i, '').slice(0, 80), defaultWorkStyle: issue.workStyle ?? null })
              update(issue.id, { moduleId: m.id })
              navigate(moduleUrl(project, m, issue.key))
            } else update(issue.id, { moduleId: v })
          }}
          options={[...projectModules.map((m) => ({ value: m.id, label: m.name })), { value: '__new', label: 'New module from this task…', icon: <Plus className="size-3.5" /> }]}
          className="h-7 text-[12.5px]"
          width={260}
        />
      </div>
    </div>
  )
}

function FocusedActions({ issue, project, module }: { issue: Issue; project: Project; module?: WorkModule }) {
  const target = useContinueTarget(issue)
  const { open: openIssue } = useIssueModal()
  const navigate = useNavigate()
  const createModule = useStore((s) => s.createModule)
  const update = useStore((s) => s.updateIssue)
  const setModuleBrief = useStore((s) => s.setModuleBrief)
  const expand = () => {
    const q = issue.brief?.question?.trim() ?? ''
    // Keep this task focused; broaden the investigation in the module, carrying the question across.
    if (module) {
      const existing = module.brief.questions ?? ''
      if (q && !existing.includes(q)) setModuleBrief(module.id, 'questions', existing.trim() ? `${existing.trim()}\n${q}` : q)
      navigate(`${moduleUrl(project, module, issue.key)}#questions`)
      return
    }
    const m = createModule({
      projectId: project.id,
      name: issue.summary.replace(/^Question:\s*/i, '').slice(0, 80),
      defaultWorkStyle: 'research',
      brief: { questions: q, problem: issue.brief?.why ?? '' },
    })
    update(issue.id, { moduleId: m.id })
    navigate(`${moduleUrl(project, m, issue.key)}#questions`)
  }
  return (
    <div className="flex flex-wrap gap-2">
      {target && (
        <Button size="sm" variant="default" iconRight={<ArrowRight className="size-3.5" />} onClick={() => openIssue(target.key)}>
          Continue implementation · {target.key}
        </Button>
      )}
      <Button size="sm" variant="subtle" icon={<Telescope className="size-4" />} onClick={expand}>
        Expand research
      </Button>
    </div>
  )
}

function Checklist({ issue, module }: { issue: Issue; module?: WorkModule }) {
  const checks = completionChecks(issue, module)
  if (!checks.length) return null
  const done = checks.filter((c) => c.done).length
  return (
    <div className="rounded-xl border border-line px-3 py-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[12.5px] font-semibold">Before review</span>
        <span className="text-[11.5px] text-subtle">
          {done}/{checks.length}
        </span>
      </div>
      <ul className="mt-1.5 space-y-1">
        {checks.map((c) => (
          <li key={c.label} className={cn('flex items-center gap-2 text-[12.5px]', c.done ? 'text-fg' : 'text-muted')}>
            <span className={cn('grid size-4 place-items-center rounded-full border', c.done ? 'border-done-fg bg-done text-done-fg' : 'border-line-strong')}>
              {c.done && <Check className="size-3" />}
            </span>
            {c.label}
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-[11px] text-subtle">Send it to In Review when ready and name your reviewer in a comment. Nothing here blocks a status change.</p>
    </div>
  )
}

const READ_ORDER: { title: string; fields: string[] }[] = [
  { title: 'Problem and context', fields: ['outcome', 'problem', 'question', 'why', 'questions'] },
  { title: 'Findings or agreed approach', fields: ['approach', 'answer', 'basis', 'synthesis'] },
  { title: 'Recommendation or delivered change', fields: ['recommendation', 'changed', 'implication', 'result'] },
  { title: 'Verification, limitations and next action', fields: ['acceptance', 'verification', 'limitations', 'uncertainty'] },
]

export function TaskReadBrief({ issue, project, module, open, onClose }: { issue: Issue; project: Project; module?: WorkModule; open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const b = issue.brief ?? {}
  const sections = READ_ORDER.map((s) => ({ ...s, fields: s.fields.filter((f) => b[f]?.trim()) })).filter((s) => s.fields.length)
  const refs = issue.references ?? []
  return (
    <Modal open={open} onClose={onClose} title={`${issue.key} · ${issue.summary}`} width={720}>
      <div className="space-y-6">
        <div className="text-[12.5px] text-muted">{workDescription(issue)}</div>
        {sections.length === 0 && <p className="text-[13px] text-subtle">Nothing written yet.</p>}
        {sections.map((s) => (
          <section key={s.title} className="space-y-3">
            <h3 className="text-[15px] font-semibold">{s.title}</h3>
            {s.fields.map((f) => (
              <ReadField key={f} label={ALL_TASK_FIELDS.get(f)?.label ?? f} value={b[f]} />
            ))}
          </section>
        ))}
        {refs.length > 0 && (
          <section className="space-y-1.5">
            <h3 className="text-[15px] font-semibold">Sources</h3>
            <ul className="list-disc space-y-0.5 pl-5 text-[13px]">
              {refs.map((r) => (
                <li key={r.id}>
                  {/^[a-z][a-z0-9+.-]*:/i.test(r.location) ? (
                    <a href={r.location} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                      {r.title}
                    </a>
                  ) : (
                    <span>
                      {r.title} <span className="font-mono text-[11.5px] text-muted">({r.location})</span>
                    </span>
                  )}
                  {r.accessIssue && <span className="text-warn"> — can’t access: {r.accessIssue}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}
        {module && (
          <Button variant="default" iconRight={<ArrowRight className="size-3.5" />} onClick={() => navigate(`${moduleUrl(project, module, issue.key)}&read=1`)}>
            Read the {module.name} module brief
          </Button>
        )}
        <p className="text-[11.5px] text-subtle">Questions? Ask in the issue’s comments.</p>
      </div>
    </Modal>
  )
}

/** The task brief: outcome, the right prompts for the work style, references and what's checked before review. */
export function TaskBrief({ issue, project }: { issue: Issue; project: Project }) {
  const update = useStore((s) => s.updateIssue)
  const setIssueBrief = useStore((s) => s.setIssueBrief)
  const module = useStore((s) => (issue.moduleId ? s.modules.find((m) => m.id === issue.moduleId) : undefined))
  const [reading, setReading] = useState(false)
  const [earlierOpen, setEarlierOpen] = useState(false)

  const groups = taskGroups(issue)
  const shown = new Set(groups.flatMap((g) => g.fields.map((f) => f.id)))
  const earlier = Object.entries(issue.brief ?? {}).filter(([k, v]) => !shown.has(k) && v.trim())
  const style = styleInfo(issue.workStyle)
  const suggestedStyle = module?.defaultWorkStyle ?? project.defaultWorkStyle ?? null
  const color = workColor(issue)

  const clearSuggestion = (field: string) => {
    const latest = useStore.getState().issues.find((i) => i.id === issue.id)
    if (!latest?.suggestions?.[field]) return
    const next = { ...latest.suggestions }
    delete next[field]
    update(issue.id, { suggestions: next })
  }

  const setStyle = (workStyle: WorkStyle) => {
    if (workStyle === issue.workStyle) return
    update(issue.id, { workStyle })
    if (issue.workStyle) toast({ title: `Now ${styleInfo(workStyle)!.label}`, description: 'Everything already written is kept; only the prompts changed.' })
  }

  // Unclassified: a gentle, optional prompt.
  if (!issue.track)
    return (
      <section>
        <SectionTitle>Work brief</SectionTitle>
        <div className="rounded-xl border border-dashed border-line-strong px-4 py-3">
          <div className="text-[13.5px] font-semibold">Is this Operations or Technical work?</div>
          <p className="mt-0.5 text-[12.5px] text-muted">Classifying it adds the right prompts. Unclassified work stays visible on every board, so there’s no rush.</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Button size="sm" variant="default" onClick={() => update(issue.id, { track: 'operations' })}>
              <span className="size-2 rounded-full" style={{ background: WORK_COLOR.operations }} /> Operations
            </Button>
            <Button size="sm" variant="default" onClick={() => update(issue.id, { track: 'technical', workStyle: issue.workStyle ?? null })}>
              <span className="size-2 rounded-full" style={{ background: WORK_COLOR.technical }} /> Technical
            </Button>
          </div>
        </div>
      </section>
    )

  return (
    <section className="space-y-4">
      <SectionTitle
        actions={
          <Button size="xs" variant="subtle" icon={<BookOpenText className="size-3.5" />} onClick={() => setReading(true)}>
            Read brief
          </Button>
        }
      >
        Work brief
      </SectionTitle>

      <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
        <span className="inline-flex items-center gap-1.5 font-semibold" style={color ? { color: `color-mix(in srgb, ${color} 75%, var(--fg))` } : undefined}>
          <WorkIcon issue={issue} /> {workDescription(issue)}
        </span>
        {issue.track === 'technical' && style && (
          <Popover width={720} trigger={<button className="text-[12px] font-medium text-accent hover:underline">Change</button>}>
            {(close) => (
              <div className="p-3">
                <div className="mb-2 text-[13px] font-semibold">How much investigation does this work need?</div>
                <WorkStyleChooser
                  value={issue.workStyle ?? null}
                  suggested={suggestedStyle}
                  onChange={(v) => {
                    setStyle(v)
                    close()
                  }}
                />
                <p className="mt-2 text-[11.5px] text-subtle">Changing the option changes the prompts and expected outputs. Notes, references, sprint and status are kept.</p>
              </div>
            )}
          </Popover>
        )}
      </div>

      {issue.track === 'technical' && !style && (
        <div className="rounded-xl border border-line px-4 py-3">
          <div className="mb-2 text-[13.5px] font-semibold">How much investigation does this work need?</div>
          <WorkStyleChooser value={null} suggested={suggestedStyle} onChange={setStyle} />
        </div>
      )}

      {style && (
        <ol className="flex flex-wrap items-center gap-1 text-[11.5px] text-muted" aria-label="Flow">
          {style.flow.map((step, k) => (
            <li key={step} className="flex items-center gap-1">
              {k > 0 && <ChevronDown className="size-3 -rotate-90 text-subtle" />}
              <span className="rounded-full border border-line px-2 py-0.5">{step}</span>
            </li>
          ))}
        </ol>
      )}

      {issue.track === 'technical' && <ModuleRow issue={issue} project={project} module={module} />}

      {groups.map((g) => (
        <div key={g.title} className="space-y-3">
          <div className="text-[11px] font-semibold tracking-wide text-subtle uppercase">{g.title}</div>
          {g.fields.map((f) => (
            <BriefTextField
              key={`${issue.id}:${f.id}`}
              field={f}
              value={issue.brief?.[f.id] ?? ''}
              placeholder={issue.track === 'operations' && f.id === 'outcome' ? OPERATIONS_FIRST_PROMPT : style && f.id === style.firstField ? style.firstPrompt : undefined}
              onSave={(v) => setIssueBrief(issue.id, f.id, v)}
              suggestion={issue.suggestions?.[f.id]}
              onClearSuggestion={() => clearSuggestion(f.id)}
            />
          ))}
          {issue.workStyle === 'direct' && issue.track === 'technical' && g.title === 'Build' && <Questions issue={issue} project={project} />}
        </div>
      ))}

      {issue.track === 'technical' && issue.workStyle === 'focused' && <FocusedActions issue={issue} project={project} module={module} />}

      {(issue.track === 'technical' || (issue.references?.length ?? 0) > 0) && (
        <div className="space-y-2">
          <div className="text-[11px] font-semibold tracking-wide text-subtle uppercase">References</div>
          <ReferenceList
            refs={issue.references ?? []}
            onChange={(references) => update(issue.id, { references })}
            emptyText={
              issue.workStyle === 'research'
                ? 'Add papers, documents, Obsidian notes or results. Title and location are enough.'
                : 'Optional — link a design, doc, code pattern or prior decision instead of rewriting it.'
            }
          />
        </div>
      )}

      {earlier.length > 0 && (
        <div className="rounded-xl border border-line">
          <button onClick={() => setEarlierOpen((v) => !v)} className="flex w-full items-center justify-between px-3 py-2 text-left text-[12.5px] font-semibold hover:bg-hover">
            Notes from an earlier work type ({earlier.length})
            <ChevronDown className={cn('size-4 text-muted transition', !earlierOpen && '-rotate-90')} />
          </button>
          {earlierOpen && (
            <div className="space-y-3 border-t border-line px-3 py-3">
              {earlier.map(([k, v]) => (
                <ReadField key={k} label={ALL_TASK_FIELDS.get(k)?.label ?? k} value={v} />
              ))}
            </div>
          )}
        </div>
      )}

      <Checklist issue={issue} module={module} />
      <TaskReadBrief issue={issue} project={project} module={module} open={reading} onClose={() => setReading(false)} />
    </section>
  )
}
