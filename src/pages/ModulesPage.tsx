import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, BookOpenText, Layers, PencilLine, Plus, Trash2, X } from 'lucide-react'
import type { CandidateStatus, ComparisonCandidate, ComparisonCriterion, ModuleTest, Project, WorkModule, WorkStyle } from '@/types'
import { useProjectByKey, useStore } from '@/store/store'
import { toast } from '@/store/ui'
import { cn, nowISO, timeAgo, uid } from '@/lib/utils'
import { CANDIDATE_STATUSES, MODULE_FIELDS, MODULE_SECTIONS, WORK_COLOR, WORK_STYLES, styleLabel } from '@/lib/work'
import { Avatar, IssueTypeIcon, StatusLozenge, UserPicker, useIssueModal } from '@/components/jira'
import { ConfirmDialog, Popover, Select } from '@/components/ui/overlay'
import { Button, Checkbox, Input, Textarea } from '@/components/ui/primitives'
import { QuickCreate } from '@/features/board/QuickCreate'
import { BriefTextField, ReadField, ReferenceList } from '@/features/work/BriefFields'
import { AuthoringTag, WorkBadge } from '@/features/work/WorkUI'

export default function ModulesPage() {
  const { projectKey, moduleId } = useParams()
  const project = useProjectByKey(projectKey)!
  const module = useStore((s) => (moduleId ? s.modules.find((m) => m.id === moduleId) : undefined))
  if (moduleId && !module)
    return (
      <div className="px-8 py-10 text-center text-muted">
        This module doesn’t exist or was deleted.{' '}
        <Link to={`/projects/${project.key}/modules`} className="text-accent hover:underline">
          All modules
        </Link>
      </div>
    )
  return module ? <ModuleDetail key={module.id} project={project} module={module} /> : <ModuleList project={project} />
}

function Crumbs({ project, children }: { project: Project; children?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center gap-1.5 text-[13px] text-muted">
      <Link to="/projects" className="hover:text-fg hover:underline">
        Projects
      </Link>
      <span>/</span>
      <Link to={`/projects/${project.key}/board`} className="hover:text-fg hover:underline">
        {project.name}
      </Link>
      <span>/</span>
      <Link to={`/projects/${project.key}/modules`} className="hover:text-fg hover:underline">
        Modules
      </Link>
      {children}
    </div>
  )
}

// ───────────────────────────── list ─────────────────────────────

function ModuleList({ project }: { project: Project }) {
  const all = useStore((s) => s.modules)
  const issues = useStore((s) => s.issues)
  const users = useStore((s) => s.users)
  const createModule = useStore((s) => s.createModule)
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [adding, setAdding] = useState(false)
  const modules = useMemo(() => all.filter((m) => m.projectId === project.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [all, project.id])
  const done = new Set(project.statuses.filter((s) => s.category === 'done').map((s) => s.id))
  const create = () => {
    if (!name.trim()) return
    const m = createModule({ projectId: project.id, name: name.trim().slice(0, 80) })
    navigate(`/projects/${project.key}/modules/${m.id}`)
  }
  return (
    <div className="px-8 py-6">
      <Crumbs project={project} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="display text-[28px]">Modules</h1>
          <p className="mt-1 max-w-2xl text-[13.5px] text-muted">
            Optional shared context for related tasks — the problem, research, alternatives and solution. Several issues can open the same brief while keeping their own status and
            sprint.
          </p>
        </div>
        {!adding && (
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>
            New module
          </Button>
        )}
      </div>
      {adding && (
        <div className="mt-4 flex max-w-xl gap-2">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => (e.key === 'Enter' ? create() : e.key === 'Escape' && setAdding(false))}
            placeholder="Module name, e.g. Embedder"
          />
          <Button variant="primary" size="md" onClick={create} disabled={!name.trim()}>
            Create
          </Button>
          <Button variant="subtle" size="md" onClick={() => setAdding(false)}>
            Cancel
          </Button>
        </div>
      )}
      {modules.length === 0 && !adding && (
        <div className="mt-10 rounded-2xl border border-dashed border-line-strong px-6 py-10 text-center">
          <Layers className="mx-auto size-8 text-subtle" />
          <p className="mt-2 text-[14px] font-semibold">No modules yet</p>
          <p className="mt-1 text-[13px] text-muted">A small task can keep everything on its ticket. Create a module when several tasks share the same reasoning.</p>
        </div>
      )}
      <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {modules.map((m) => {
          const linked = issues.filter((i) => i.moduleId === m.id)
          const owner = users.find((u) => u.id === m.ownerId)
          return (
            <Link
              key={m.id}
              to={`/projects/${project.key}/modules/${m.id}`}
              className="group rounded-2xl border border-line bg-surface-2 p-4 transition hover:border-line-strong hover:bg-surface-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="text-[15px] font-semibold tracking-[-0.01em] group-hover:text-accent">{m.name}</div>
                <Avatar user={owner} size="sm" />
              </div>
              <p className="mt-1 line-clamp-2 min-h-[2.5em] text-[12.5px] text-muted">{m.summary || m.brief.problem || 'No summary yet'}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11.5px] text-subtle">
                {m.defaultWorkStyle && <WorkBadge issue={{ track: 'technical', workStyle: m.defaultWorkStyle }} />}
                <span>
                  {linked.length} task{linked.length === 1 ? '' : 's'} · {linked.filter((i) => done.has(i.statusId)).length} done
                </span>
                <span className="ml-auto">Updated {timeAgo(m.updatedAt)}</span>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

// ───────────────────────────── detail ─────────────────────────────

/** Text input that saves on blur / Enter (for table cells and short fields). */
function LazyInput({
  value,
  onCommit,
  className,
  ...rest
}: {
  value: string
  onCommit: (v: string) => void
  className?: string
  placeholder?: string
  autoFocus?: boolean
  'aria-label'?: string
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <Input
      {...rest}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onCommit(draft)}
      onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
      className={cn('h-8 text-[13px]', className)}
    />
  )
}

function LazyTextarea({ value, onCommit, placeholder, rows = 2 }: { value: string; onCommit: (v: string) => void; placeholder?: string; rows?: number }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <Textarea
      value={draft}
      rows={rows}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onCommit(draft)}
      className="resize-y text-[13px]"
    />
  )
}

function Section({ id, title, hint, children, aside }: { id: string; title: string; hint?: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 rounded-2xl border border-line bg-surface px-5 py-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-semibold tracking-[-0.01em]">{title}</h2>
          {hint && <p className="mt-0.5 text-[12.5px] text-muted">{hint}</p>}
        </div>
        {aside}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

function ModuleDetail({ project, module }: { project: Project; module: WorkModule }) {
  const updateModule = useStore((s) => s.updateModule)
  const setModuleBrief = useStore((s) => s.setModuleBrief)
  const deleteModule = useStore((s) => s.deleteModule)
  const me = useStore((s) => s.currentUserId)
  const users = useStore((s) => s.users)
  const navigate = useNavigate()
  const { open: openIssue } = useIssueModal()
  const [params, setParams] = useSearchParams()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const from = params.get('from')
  const reading = params.get('read') === '1'
  const owner = users.find((u) => u.id === module.ownerId)
  const set = (patch: Partial<WorkModule>) => updateModule(module.id, patch)

  useEffect(() => {
    const id = window.location.hash.slice(1)
    if (id) requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }, [])

  const setReading = (v: boolean) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p)
        if (v) n.set('read', '1')
        else n.delete('read')
        return n
      },
      { replace: true },
    )

  const back = () => {
    // Prefer real history (keeps the board, filters and open issue); otherwise open the ticket here.
    if (((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0) navigate(-1)
    else if (from) openIssue(from)
  }

  const clearSuggestion = (field: string) => {
    const latest = useStore.getState().modules.find((m) => m.id === module.id)
    if (!latest?.suggestions?.[field]) return
    const next = { ...latest.suggestions }
    delete next[field]
    set({ suggestions: next })
  }

  const fields = (sectionId: string) =>
    MODULE_SECTIONS.find((s) => s.id === sectionId)!.fields.map((f) => (
      <BriefTextField
        key={f.id}
        field={f}
        value={module.brief[f.id] ?? ''}
        onSave={(v) => setModuleBrief(module.id, f.id, v)}
        suggestion={module.suggestions?.[f.id]}
        onClearSuggestion={() => clearSuggestion(f.id)}
      />
    ))
  const sec = (id: string) => MODULE_SECTIONS.find((s) => s.id === id)!

  return (
    <div className="px-8 py-6">
      <Crumbs project={project}>
        <span>/</span>
        <span className="text-fg">{module.name}</span>
      </Crumbs>

      {from && (
        <button
          onClick={back}
          className="mb-3 inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1 text-[12.5px] font-medium text-muted hover:bg-hover hover:text-fg"
        >
          <ArrowLeft className="size-3.5" /> Back to {from}
        </button>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {reading ? (
            <h1 className="display text-[28px]">{module.name}</h1>
          ) : (
            <input
              value={module.name}
              onChange={(e) => set({ name: e.target.value.slice(0, 80) })}
              aria-label="Module name"
              className="display -mx-2 w-full rounded-lg bg-transparent px-2 py-0.5 text-[28px] outline-none hover:bg-hover focus:bg-surface-2"
            />
          )}
          {reading ? (
            module.summary && <p className="mt-1 text-[14px] text-muted">{module.summary}</p>
          ) : (
            <LazyInput
              value={module.summary}
              onCommit={(summary) => set({ summary })}
              placeholder="One-line summary"
              className="mt-1 h-8 max-w-2xl border-transparent bg-transparent px-0 hover:bg-transparent focus:px-2"
            />
          )}
        </div>
        <div className="flex items-center gap-2">
          <div role="tablist" className="flex items-center gap-0.5 rounded-xl border border-line bg-surface-2 p-0.5">
            <button
              role="tab"
              aria-selected={!reading}
              onClick={() => setReading(false)}
              className={cn('inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium', !reading ? 'bg-surface-3 text-fg' : 'text-muted hover:text-fg')}
            >
              <PencilLine className="size-3.5" /> Edit
            </button>
            <button
              role="tab"
              aria-selected={reading}
              onClick={() => setReading(true)}
              className={cn('inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium', reading ? 'bg-surface-3 text-fg' : 'text-muted hover:text-fg')}
            >
              <BookOpenText className="size-3.5" /> Read brief
            </button>
          </div>
          {!reading && <Button variant="ghost" icon={<Trash2 className="size-4" />} aria-label="Delete module" onClick={() => setConfirmDelete(true)} />}
        </div>
      </div>

      <div className="mt-4 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          {reading ? (
            <ModuleReadBrief module={module} />
          ) : (
            <>
              <Section id="problem" title={sec('problem').title} hint={sec('problem').hint}>
                {fields('problem')}
              </Section>
              <Section id="questions" title={sec('questions').title} hint={sec('questions').hint}>
                {fields('questions')}
              </Section>
              <Section
                id="sources"
                title="Sources and notes"
                hint="Papers, documents, Obsidian notes, websites and local results. Title and location are enough; open a paper to add short notes."
              >
                <ReferenceList
                  refs={module.references}
                  onChange={(references) => set({ references })}
                  paperNotes
                  emptyText="No sources yet. Existing Drive documents (General Research, Individual Paper, Alternatives, Solution) can be linked here as they are."
                />
              </Section>
              <Section id="synthesis" title={sec('synthesis').title} hint={sec('synthesis').hint}>
                {fields('synthesis')}
              </Section>
              <Comparison module={module} />
              <Tests module={module} />
              <Section id="recommendation" title={sec('recommendation').title} hint={sec('recommendation').hint}>
                {fields('recommendation')}
              </Section>
              <Section
                id="decision"
                title={sec('decision').title}
                hint={sec('decision').hint}
                aside={owner && <span className="text-[12px] text-subtle">Owner: {owner.name}</span>}
              >
                {module.ownerId && module.ownerId !== me && <p className="-mt-1 text-[12px] text-warn">{owner?.name ?? 'The module owner'} records this decision.</p>}
                {fields('decision')}
              </Section>
              <Section id="delivery" title={sec('delivery').title} hint={sec('delivery').hint}>
                {fields('delivery')}
              </Section>
            </>
          )}
        </div>

        <aside className="space-y-4">
          {reading ? (
            <div className="space-y-1 rounded-2xl border border-line bg-surface px-4 py-3 text-[13px]">
              <div>
                <span className="text-muted">Owner: </span>
                {owner?.name ?? 'None'}
              </div>
              {module.updatesLiveIn && (
                <div>
                  <span className="text-muted">Updates live in: </span>
                  {module.updatesLiveIn}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-line bg-surface px-4 py-3">
              <div className="grid grid-cols-[110px_1fr] items-center gap-y-2 text-[13px]">
                <span className="text-muted">Owner</span>
                <UserPicker value={module.ownerId} onChange={(ownerId) => set({ ownerId })} projectId={project.id} />
                <span className="text-muted">Default work style</span>
                <Select<string>
                  value={module.defaultWorkStyle ?? '__none'}
                  onChange={(v) => set({ defaultWorkStyle: v === '__none' ? null : (v as WorkStyle) })}
                  options={[
                    { value: '__none', label: 'None' },
                    ...WORK_STYLES.map((s) => ({ value: s.id, label: s.label, icon: <span className="size-2 rounded-full" style={{ background: WORK_COLOR[s.category] }} /> })),
                  ]}
                  renderValue={() => (
                    <span className={cn(!module.defaultWorkStyle && 'text-subtle')}>{module.defaultWorkStyle ? styleLabel(module.defaultWorkStyle) : 'None'}</span>
                  )}
                  className="h-8 text-[13px]"
                />
              </div>
              <p className="mt-1.5 text-[11px] text-subtle">New tasks in this module start with it. Existing tasks keep their own work style.</p>
              <div className="mt-3 text-[13px] text-muted">Where to make updates</div>
              <LazyInput
                value={module.updatesLiveIn}
                onCommit={(updatesLiveIn) => set({ updatesLiveIn })}
                placeholder="This brief — or the linked doc to keep editing"
                className="mt-1"
              />
            </div>
          )}
          <LinkedTasks project={project} module={module} readOnly={reading} />
        </aside>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          deleteModule(module.id)
          navigate(`/projects/${project.key}/modules`)
          toast({ title: `${module.name} deleted`, description: 'Linked tasks keep their own briefs.' })
        }}
        title={`Delete ${module.name}?`}
      >
        The module brief, its sources and comparison are removed. Linked tasks stay as they are, with their own briefs.
      </ConfirmDialog>
    </div>
  )
}

function LinkedTasks({ project, module, readOnly }: { project: Project; module: WorkModule; readOnly?: boolean }) {
  const issues = useStore((s) => s.issues)
  const sprints = useStore((s) => s.sprints)
  const users = useStore((s) => s.users)
  const update = useStore((s) => s.updateIssue)
  const { open: openIssue } = useIssueModal()
  const linked = issues.filter((i) => i.moduleId === module.id).sort((a, b) => a.rank - b.rank)
  const candidates = issues.filter((i) => i.projectId === project.id && i.moduleId !== module.id && i.type !== 'epic')
  return (
    <div className="rounded-2xl border border-line bg-surface px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[14px] font-semibold">Tasks</span>
        <span className="text-[12px] text-subtle">{linked.length}</span>
      </div>
      <ul className="space-y-1">
        {linked.map((i) => (
          <li key={i.id} className="group flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-hover">
            <IssueTypeIcon type={i.type} />
            <button onClick={() => openIssue(i.key)} className="min-w-0 flex-1 text-left">
              <div className="truncate text-[13px]">{i.summary}</div>
              <div className="flex items-center gap-1.5 text-[11px] text-subtle">
                {i.key} · {sprints.find((s) => s.id === i.sprintId)?.name ?? 'Backlog'}
                <WorkBadge issue={i} className="h-4" />
              </div>
            </button>
            <StatusLozenge status={project.statuses.find((s) => s.id === i.statusId)} />
            <Avatar user={users.find((u) => u.id === i.assigneeId)} size="xs" />
            {!readOnly && (
              <button onClick={() => update(i.id, { moduleId: null })} className="text-subtle opacity-0 group-hover:opacity-100 hover:text-accent" aria-label={`Unlink ${i.key}`}>
                <X className="size-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {!readOnly && (
        <div className="mt-2 space-y-1">
          <Select<string>
            value={null}
            searchable
            placeholder="Link an existing task…"
            width={360}
            onChange={(id) => update(id, { moduleId: module.id })}
            options={candidates.map((i) => ({ value: i.id, label: `${i.key} ${i.summary}`, icon: <IssueTypeIcon type={i.type} /> }))}
            className="h-8 text-[13px]"
          />
          <QuickCreate projectId={project.id} variant="card" label="Create task in this module" defaults={{ moduleId: module.id, sprintId: null }} />
        </div>
      )}
      {!readOnly && <p className="mt-1 text-[11px] text-subtle">Linking keeps each task’s own status, sprint and assignee.</p>}
    </div>
  )
}

// ───────────────────────────── comparison ─────────────────────────────

function Comparison({ module }: { module: WorkModule }) {
  const updateModule = useStore((s) => s.updateModule)
  const { criteria, candidates } = module
  const setCriteria = (c: ComparisonCriterion[]) => updateModule(module.id, { criteria: c })
  const setCandidates = (c: ComparisonCandidate[]) => updateModule(module.id, { candidates: c })
  const patchCandidate = (id: string, patch: Partial<ComparisonCandidate>) => setCandidates(candidates.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  const addCandidate = (baseline = false) =>
    setCandidates([
      ...candidates,
      { id: uid('cand'), name: baseline ? 'Current approach' : '', baseline, status: 'considering', reason: '', advantages: '', disadvantages: '', cells: {} },
    ])

  return (
    <Section
      id="comparison"
      title="Compare approaches"
      hint="State requirements and preferences first, then compare plausible candidates against the same criteria. It helps the team choose — it doesn’t pick a winner."
    >
      <div>
        <div className="mb-1.5 text-[12.5px] font-semibold">Criteria</div>
        {criteria.length === 0 && <p className="text-[12.5px] text-subtle">Requirements need a pass condition; preferences say what “better” means.</p>}
        <div className="space-y-1.5">
          {criteria.map((c) => (
            <div key={c.id} className="grid grid-cols-[1fr_140px_1.4fr_28px] items-center gap-2">
              <LazyInput
                value={c.name}
                onCommit={(name) => setCriteria(criteria.map((x) => (x.id === c.id ? { ...x, name } : x)))}
                placeholder="Criterion, e.g. Latency"
                aria-label="Criterion name"
                autoFocus={!c.name}
              />
              <Select<ComparisonCriterion['kind']>
                value={c.kind}
                onChange={(kind) => setCriteria(criteria.map((x) => (x.id === c.id ? { ...x, kind } : x)))}
                options={[
                  { value: 'requirement', label: 'Requirement' },
                  { value: 'preference', label: 'Preference' },
                ]}
                className="h-8 text-[13px]"
              />
              <LazyInput
                value={c.threshold}
                onCommit={(threshold) => setCriteria(criteria.map((x) => (x.id === c.id ? { ...x, threshold } : x)))}
                placeholder={c.kind === 'requirement' ? 'Pass condition, e.g. p95 < 200 ms' : 'What better means, e.g. lower is better'}
                aria-label="Threshold"
              />
              <button
                onClick={() => setCriteria(criteria.filter((x) => x.id !== c.id))}
                className="grid size-7 place-items-center rounded-md text-subtle hover:bg-hover hover:text-accent"
                aria-label="Remove criterion"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
        <Button
          className="mt-1.5"
          size="xs"
          variant="subtle"
          icon={<Plus className="size-3.5" />}
          onClick={() => setCriteria([...criteria, { id: uid('crit'), name: '', kind: 'requirement', threshold: '' }])}
        >
          Add criterion
        </Button>
      </div>

      <div>
        <div className="mb-1.5 flex items-center gap-2 text-[12.5px] font-semibold">Candidates</div>
        {candidates.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[720px] border-collapse text-[12.5px]">
              <thead>
                <tr className="bg-surface-2 text-left text-[11.5px] text-muted">
                  <th className="px-2.5 py-2 font-semibold">Candidate</th>
                  {criteria.map((c) => (
                    <th key={c.id} className="px-2.5 py-2 font-semibold">
                      {c.name || 'Untitled'}
                      <span className="ml-1 font-normal text-subtle">{c.kind === 'requirement' ? 'req.' : 'pref.'}</span>
                    </th>
                  ))}
                  <th className="px-2.5 py-2 font-semibold">
                    <span className="inline-flex items-center gap-1.5">
                      Advantages / disadvantages <AuthoringTag authoring="ai" />
                    </span>
                  </th>
                  <th className="px-2.5 py-2 font-semibold">Status and reason</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {candidates.map((cand) => (
                  <tr key={cand.id} className="border-t border-line align-top">
                    <td className="w-48 px-2.5 py-2">
                      <LazyInput
                        value={cand.name}
                        onCommit={(name) => patchCandidate(cand.id, { name })}
                        placeholder="Approach"
                        aria-label="Candidate name"
                        autoFocus={!cand.name}
                      />
                      <Checkbox
                        className="mt-1.5"
                        checked={cand.baseline}
                        onChange={(baseline) => patchCandidate(cand.id, { baseline })}
                        label={<span className="text-[11.5px] text-muted">Current approach / baseline</span>}
                      />
                    </td>
                    {criteria.map((c) => (
                      <td key={c.id} className="px-2.5 py-2">
                        <CellEditor value={cand.cells[c.id]} onChange={(cell) => patchCandidate(cand.id, { cells: { ...cand.cells, [c.id]: cell } })} />
                      </td>
                    ))}
                    <td className="w-64 space-y-1.5 px-2.5 py-2">
                      <LazyTextarea value={cand.advantages} onCommit={(advantages) => patchCandidate(cand.id, { advantages })} placeholder="Advantages in this context" />
                      <LazyTextarea
                        value={cand.disadvantages}
                        onCommit={(disadvantages) => patchCandidate(cand.id, { disadvantages })}
                        placeholder="Disadvantages in this context"
                      />
                    </td>
                    <td className="w-52 space-y-1.5 px-2.5 py-2">
                      <Select<CandidateStatus>
                        value={cand.status}
                        onChange={(status) => patchCandidate(cand.id, { status })}
                        options={CANDIDATE_STATUSES.map((s) => ({ value: s.id, label: s.label }))}
                        className="h-8 text-[12.5px]"
                      />
                      <LazyTextarea value={cand.reason} onCommit={(reason) => patchCandidate(cand.id, { reason })} placeholder="Why?" />
                    </td>
                    <td className="px-1 py-2">
                      <button
                        onClick={() => setCandidates(candidates.filter((x) => x.id !== cand.id))}
                        className="grid size-7 place-items-center rounded-md text-subtle hover:bg-hover hover:text-accent"
                        aria-label="Remove candidate"
                      >
                        <X className="size-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-1.5 flex flex-wrap gap-1">
          <Button size="xs" variant="subtle" icon={<Plus className="size-3.5" />} onClick={() => addCandidate()}>
            Add candidate
          </Button>
          {!candidates.some((c) => c.baseline) && (
            <Button size="xs" variant="subtle" icon={<Plus className="size-3.5" />} onClick={() => addCandidate(true)}>
              Add current approach
            </Button>
          )}
        </div>
        <p className="mt-1.5 text-[11.5px] text-subtle">
          Unknown values stay unknown. Results from different conditions aren’t directly comparable — say so in the basis. No fixed number of alternatives is required.
        </p>
      </div>
    </Section>
  )
}

function CellEditor({ value, onChange }: { value?: { value: string; basis: string }; onChange: (v: { value: string; basis: string }) => void }) {
  const [draft, setDraft] = useState(value ?? { value: '', basis: '' })
  return (
    <Popover
      width={300}
      onOpenChange={(o) => {
        if (o) setDraft(value ?? { value: '', basis: '' })
        else if (draft.value !== (value?.value ?? '') || draft.basis !== (value?.basis ?? '')) onChange(draft)
      }}
      trigger={
        <button className="w-full min-w-[120px] rounded-md px-1.5 py-1 text-left hover:bg-hover">
          {value?.value ? (
            <>
              <div className="text-fg">{value.value}</div>
              {value.basis && <div className="line-clamp-2 text-[11px] text-subtle">{value.basis}</div>}
            </>
          ) : (
            <span className="text-subtle italic">Unknown</span>
          )}
        </button>
      }
    >
      <div className="space-y-2 p-3">
        <FocusOnOpen>
          <Input
            value={draft.value}
            onChange={(e) => setDraft({ ...draft, value: e.target.value })}
            placeholder="Assessment (leave empty if unknown)"
            className="h-8 text-[13px]"
          />
        </FocusOnOpen>
        <Textarea
          value={draft.basis}
          rows={3}
          onChange={(e) => setDraft({ ...draft, basis: e.target.value })}
          placeholder="Basis and limitations — source, test or reasoning; note the conditions"
          className="text-[13px]"
        />
        <p className="text-[11px] text-subtle">Saved when you close this.</p>
      </div>
    </Popover>
  )
}

/** Popovers mount hidden for a frame while they're placed, so autoFocus can't work; focus once visible. */
function FocusOnOpen({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>('input,textarea')?.focus()))
    return () => cancelAnimationFrame(id)
  }, [])
  return <div ref={ref}>{children}</div>
}

// ───────────────────────────── tests ─────────────────────────────

const TEST_PLAN: { id: keyof ModuleTest; label: string; prompt: string }[] = [
  { id: 'question', label: 'Question', prompt: 'What will this test tell us?' },
  { id: 'baseline', label: 'Baseline', prompt: 'What are we comparing against?' },
  { id: 'conditions', label: 'Conditions', prompt: 'Data, environment, settings' },
  { id: 'checks', label: 'Metrics or checks', prompt: 'What we will measure' },
  { id: 'wouldChange', label: 'Would change the recommendation if…', prompt: 'Decide before running it' },
]

function Tests({ module }: { module: WorkModule }) {
  const updateModule = useStore((s) => s.updateModule)
  const me = useStore((s) => s.currentUserId)
  const patch = (id: string, p: Partial<ModuleTest>) => updateModule(module.id, { tests: module.tests.map((t) => (t.id === id ? { ...t, ...p } : t)) })
  return (
    <Section
      id="tests"
      title="Tests"
      hint="For consequential uncertainty. Write the plan before running it; record the result and its interpretation separately. Inconclusive or failed tests are kept."
    >
      {module.tests.map((t, k) => (
        <div key={t.id} className="rounded-xl border border-line bg-surface-2 p-3">
          <div className="mb-2 flex items-center justify-between text-[12.5px] font-semibold">
            Test {k + 1}
            <button
              onClick={() => updateModule(module.id, { tests: module.tests.filter((x) => x.id !== t.id) })}
              className="text-subtle hover:text-accent"
              aria-label="Remove test"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {TEST_PLAN.map((f) => (
              <label key={f.id} className={cn('block', f.id === 'question' && 'md:col-span-2')}>
                <span className="mb-0.5 block text-[11.5px] font-semibold text-muted">{f.label}</span>
                <LazyTextarea value={String(t[f.id] ?? '')} onCommit={(v) => patch(t.id, { [f.id]: v })} placeholder={f.prompt} rows={1} />
              </label>
            ))}
          </div>
          <div className="mt-3 grid gap-2 border-t border-line pt-3 md:grid-cols-2">
            <label className="block">
              <span className="mb-0.5 block text-[11.5px] font-semibold text-muted">Actual result</span>
              <LazyTextarea value={t.result} onCommit={(result) => patch(t.id, { result })} placeholder="What happened, including inconclusive results" />
            </label>
            <label className="block">
              <span className="mb-0.5 block text-[11.5px] font-semibold text-muted">Interpretation</span>
              <LazyTextarea value={t.interpretation} onCommit={(interpretation) => patch(t.id, { interpretation })} placeholder="Does it change the answer or the choice?" />
            </label>
          </div>
        </div>
      ))}
      <Button
        size="xs"
        variant="subtle"
        icon={<Plus className="size-3.5" />}
        onClick={() =>
          updateModule(module.id, {
            tests: [
              ...module.tests,
              { id: uid('test'), question: '', baseline: '', conditions: '', checks: '', wouldChange: '', result: '', interpretation: '', createdById: me, createdAt: nowISO() },
            ],
          })
        }
      >
        Plan a test
      </Button>
    </Section>
  )
}

// ───────────────────────────── read brief ─────────────────────────────

function ModuleReadBrief({ module }: { module: WorkModule }) {
  const b = module.brief
  const has = (...ids: string[]) => ids.some((id) => b[id]?.trim())
  const label = (id: string) => MODULE_FIELDS.get(id)?.label ?? id
  const block = (ids: string[]) => ids.map((id) => <ReadField key={id} label={label(id)} value={b[id]} />)
  const compared = module.candidates.filter((c) => c.name.trim())
  const tests = module.tests.filter((t) => t.result.trim() || t.interpretation.trim())
  const parts: { title: string; body: ReactNode }[] = []
  const framing = ['problem', 'example', 'context', 'formulation', 'scope', 'decision', 'questions']
  if (has(...framing)) parts.push({ title: 'Problem and essential context', body: block(framing) })
  if (has('synthesis', 'approach')) parts.push({ title: b.synthesis?.trim() ? 'Relevant findings' : 'Agreed implementation approach', body: block(['synthesis', 'approach']) })
  if (compared.length || has('tradeoffs'))
    parts.push({
      title: 'Alternatives and tradeoffs',
      body: (
        <>
          {compared.length > 0 && <ComparisonReadTable module={module} />}
          {block(['tradeoffs'])}
        </>
      ),
    })
  if (has('recommendation', 'reasons', 'chosen', 'rationale'))
    parts.push({ title: 'Recommendation and decision', body: block(['recommendation', 'reasons', 'chosen', 'rationale']) })
  if (has('verification', 'limitations', 'uncertainty', 'nextStep', 'nextAction') || tests.length)
    parts.push({
      title: 'Verification, limitations and next action',
      body: (
        <>
          {block(['verification', 'limitations', 'uncertainty', 'nextStep', 'nextAction'])}
          {tests.map((t, k) => (
            <div key={t.id} className="rounded-lg border border-line px-3 py-2 text-[13px]">
              <div className="font-semibold">
                Test {k + 1}: {t.question || 'Untitled'}
              </div>
              {t.result && <div className="mt-0.5 text-muted">Result: {t.result}</div>}
              {t.interpretation && <div className="text-muted">Interpretation: {t.interpretation}</div>}
            </div>
          ))}
        </>
      ),
    })
  return (
    <article className="space-y-6 rounded-2xl border border-line bg-surface px-6 py-5">
      {parts.length === 0 && <p className="text-[13px] text-subtle">Nothing written yet — switch to Edit to start the brief.</p>}
      {parts.map((p) => (
        <section key={p.title} className="space-y-3">
          <h2 className="text-[17px] font-semibold tracking-[-0.01em]">{p.title}</h2>
          {p.body}
        </section>
      ))}
      {module.references.length > 0 && (
        <section className="space-y-1.5">
          <h2 className="text-[17px] font-semibold tracking-[-0.01em]">Sources</h2>
          <ul className="list-disc space-y-1 pl-5 text-[13px]">
            {module.references.map((r) => (
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
                {r.citation && <span className="text-muted"> — {r.citation}</span>}
                {r.accessIssue && <span className="text-warn"> — can’t access: {r.accessIssue}</span>}
                {r.notes?.findings?.trim() && <div className="text-[12.5px] text-muted">{r.notes.findings}</div>}
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="text-[11.5px] text-subtle">Questions? Ask in the comments of any linked task.</p>
    </article>
  )
}

function ComparisonReadTable({ module }: { module: WorkModule }) {
  const status = (s: CandidateStatus) => CANDIDATE_STATUSES.find((x) => x.id === s)?.label ?? s
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full border-collapse text-[12.5px]">
        <thead>
          <tr className="bg-surface-2 text-left text-[11.5px] text-muted">
            <th className="px-2.5 py-2">Candidate</th>
            {module.criteria.map((c) => (
              <th key={c.id} className="px-2.5 py-2">
                {c.name}
                {c.threshold && <div className="font-normal text-subtle">{c.kind === 'requirement' ? `Must: ${c.threshold}` : c.threshold}</div>}
              </th>
            ))}
            <th className="px-2.5 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {module.candidates
            .filter((c) => c.name.trim())
            .map((c) => (
              <tr key={c.id} className="border-t border-line align-top">
                <td className="px-2.5 py-2 font-medium">
                  {c.name}
                  {c.baseline && <span className="ml-1 text-[11px] text-subtle">(baseline)</span>}
                </td>
                {module.criteria.map((cr) => (
                  <td key={cr.id} className="px-2.5 py-2">
                    {c.cells[cr.id]?.value ? (
                      <>
                        {c.cells[cr.id]!.value}
                        {c.cells[cr.id]!.basis && <div className="text-[11px] text-subtle">{c.cells[cr.id]!.basis}</div>}
                      </>
                    ) : (
                      <span className="text-subtle italic">Unknown</span>
                    )}
                  </td>
                ))}
                <td className="px-2.5 py-2">
                  {status(c.status)}
                  {c.reason && <div className="text-[11px] text-subtle">{c.reason}</div>}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  )
}
