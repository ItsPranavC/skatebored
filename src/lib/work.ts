/**
 * Operations / Technical work, and the three Technical work styles.
 *
 *   Operations                        ordinary outcome → owner → deadline → review
 *   Technical · Implementation heavy  Direct implementation, Focused investigation
 *   Technical · Research heavy        Research-led
 *
 * Briefs are stored as a flat map of field id → text, so switching work style only
 * changes which prompts are shown; nothing already written is lost.
 */
import type { CandidateStatus, Issue, ReferenceKind, WorkModule, WorkStyle, WorkTrack } from '@/types'

export const TRACKS: { id: WorkTrack; label: string; hint: string }[] = [
  { id: 'operations', label: 'Operations', hint: 'Coordination, admin, outreach, events — an outcome, an owner and a deadline' },
  { id: 'technical', label: 'Technical', hint: 'Building or investigating something — choose how much investigation it needs' },
]
export const trackLabel = (t: WorkTrack | null | undefined) => TRACKS.find((x) => x.id === t)?.label ?? 'Unclassified'

export type WorkCategory = 'implementation' | 'research'
export const CATEGORY_LABEL: Record<WorkCategory, string> = { implementation: 'Implementation heavy', research: 'Research heavy' }

export interface WorkStyleInfo {
  id: WorkStyle
  label: string
  category: WorkCategory
  useWhen: string
  flow: string[]
  output: string
  /** The first prompt shown when the work is created */
  firstPrompt: string
  firstField: string
}

export const WORK_STYLES: WorkStyleInfo[] = [
  {
    id: 'direct',
    label: 'Direct implementation',
    category: 'implementation',
    useWhen: 'The approach is known or follows an agreed pattern',
    flow: ['Define outcome', 'Build', 'Review and verify'],
    output: 'Change, acceptance checks and verification result',
    firstPrompt: 'What needs to change, and how will we check it?',
    firstField: 'outcome',
  },
  {
    id: 'focused',
    label: 'Focused investigation',
    category: 'implementation',
    useWhen: 'One specific unknown needs resolving',
    flow: ['Define question', 'Investigate', 'Continue implementation'],
    output: 'Short answer, supporting basis and its effect on the work',
    firstPrompt: 'What do we need to find out before continuing?',
    firstField: 'question',
  },
  {
    id: 'research',
    label: 'Research-led',
    category: 'research',
    useWhen: 'The problem or approach needs broader investigation',
    flow: ['Frame', 'Research', 'Compare', 'Recommend', 'Implement and verify'],
    output: 'Synthesis, justified choice and verification',
    firstPrompt: 'What problem are we investigating, and what decision must we make?',
    firstField: 'problem',
  },
]
export const styleInfo = (s: WorkStyle | null | undefined) => WORK_STYLES.find((x) => x.id === s)
export const styleLabel = (s: WorkStyle | null | undefined) => styleInfo(s)?.label ?? 'Not chosen'
export const OPERATIONS_FIRST_PROMPT = 'What outcome do we need, and by when?'

/** Use AI: a suggestion may be requested and accepted, edited or rejected. Handwrite: no generation action. */
export type Authoring = 'ai' | 'handwrite'

export interface BriefField {
  id: string
  label: string
  /** Placeholder / guidance in plain language */
  prompt: string
  authoring: Authoring
  /** Single-line input instead of a textarea */
  short?: boolean
  rows?: number
}

const F = (id: string, label: string, prompt: string, authoring: Authoring = 'handwrite', extra: Partial<BriefField> = {}): BriefField => ({
  id,
  label,
  prompt,
  authoring,
  ...extra,
})

export interface BriefGroup {
  title: string
  fields: BriefField[]
}

const OPERATIONS_FIELDS: BriefGroup[] = [
  {
    title: 'Outcome',
    fields: [
      F('outcome', 'Expected outcome', 'What will be true when this is done? Who needs it, and by when?', 'handwrite', { rows: 3 }),
      F('notes', 'Notes', 'Anything the owner or reviewer should know.'),
    ],
  },
  { title: 'Result', fields: [F('result', 'What was done', 'Record the result so the reviewer can check it against the outcome.')] },
]

const DIRECT_FIELDS: BriefGroup[] = [
  {
    title: 'Define outcome',
    fields: [
      F('outcome', 'Outcome and why it matters', 'What needs to change, and why does it matter?', 'handwrite', { rows: 3 }),
      F('acceptance', 'Acceptance checks', 'How will we check it? One check per line.', 'handwrite', { rows: 3 }),
      F('approach', 'Approach and constraints', 'Optional — or link an existing design, code pattern or decision below instead of rewriting it.'),
    ],
  },
  { title: 'Build', fields: [F('notes', 'Notes and questions', 'Relevant notes as you implement. If an unknown blocks you, use “Add a question”.')] },
  {
    title: 'Review and verify',
    fields: [
      F('changed', 'What changed', 'Summarise the change for the reviewer.'),
      F('verification', 'Verification result', 'What was checked, and the result.'),
      F('limitations', 'Limitations', 'Anything not covered or known to be imperfect.'),
    ],
  },
]

const FOCUSED_FIELDS: BriefGroup[] = [
  {
    title: 'Define question',
    fields: [
      F('question', 'Question', 'What do we need to find out before continuing?', 'ai', { rows: 2 }),
      F('why', 'Why the answer matters', 'How does the answer affect the work?'),
      F('effort', 'Effort limit', 'Optional, e.g. “half a day”', 'handwrite', { short: true }),
    ],
  },
  {
    title: 'Investigate',
    fields: [F('notes', 'Investigation notes', 'Docs, existing behaviour, code, a teammate’s input, a small comparison or a quick experiment. A paper review is optional.')],
  },
  {
    title: 'Continue implementation',
    fields: [
      F('answer', 'Answer or current finding', 'An inconclusive answer is a valid result — say what is known.'),
      F('basis', 'Supporting basis', 'The reference, observation or test result behind the answer.'),
      F('implication', 'What it changes about implementation', 'How the work should proceed now.'),
      F('uncertainty', 'Unresolved uncertainty', 'What is still unknown. If effort ran out, ask the owner how to proceed.'),
    ],
  },
]

const RESEARCH_FIELDS: BriefGroup[] = [
  {
    title: 'Frame',
    fields: [
      F('problem', 'Problem and decision', 'What problem are we investigating, and what decision must we make?', 'handwrite', { rows: 3 }),
      F('questions', 'Research questions', 'The questions the research must answer. One per line.', 'ai'),
      F('effort', 'Effort or time limit', 'Optional', 'handwrite', { short: true }),
      F('enough', 'Enough understanding means…', 'What would let us make the decision?'),
    ],
  },
  { title: 'Research', fields: [F('notes', 'Personal notes', 'Your own notes. Add sources below; one finding is enough — no need to summarise a whole paper.')] },
  {
    title: 'Recommend',
    fields: [
      F('synthesis', 'Synthesis', 'Answer the questions. Link conclusions to sources or test results; keep disagreements and missing evidence visible.'),
      F('recommendation', 'Recommendation', 'Recommended approach, strongest reasons, main tradeoffs, remaining uncertainty and next step.'),
    ],
  },
  {
    title: 'Implement and verify',
    fields: [F('verification', 'Verification', 'Implementing the chosen approach needs its own verification — completing research doesn’t claim it works.')],
  },
]

export function taskGroups(issue: Pick<Issue, 'track' | 'workStyle'>): BriefGroup[] {
  if (issue.track === 'operations') return OPERATIONS_FIELDS
  if (issue.track !== 'technical') return []
  if (issue.workStyle === 'direct') return DIRECT_FIELDS
  if (issue.workStyle === 'focused') return FOCUSED_FIELDS
  if (issue.workStyle === 'research') return RESEARCH_FIELDS
  return []
}

/** Every task field, for labelling text written under an earlier work style. */
export const ALL_TASK_FIELDS = new Map(
  [OPERATIONS_FIELDS, DIRECT_FIELDS, FOCUSED_FIELDS, RESEARCH_FIELDS]
    .flat()
    .flatMap((g) => g.fields)
    .map((f) => [f.id, f]),
)

// ───────────────────────────── module brief ─────────────────────────────

export const MODULE_SECTIONS: { id: string; title: string; hint: string; fields: BriefField[] }[] = [
  {
    id: 'problem',
    title: 'Problem',
    hint: 'A newcomer should understand the problem before reading detailed notes.',
    fields: [
      F('problem', 'Current situation and desired outcome', 'Where things stand today and what we want instead.', 'handwrite', { rows: 3 }),
      F('example', 'Concrete example', 'One specific case that shows the problem.'),
      F('context', 'Essential terms', 'Explain unfamiliar terms here, in the brief itself.'),
      F('formulation', 'Technical definitions or formulation', 'Equations or definitions, when they improve understanding.', 'ai'),
      F('scope', 'Scope and constraints', 'What is in and out, and what we must respect.'),
      F('decision', 'Decision this supports', 'The decision the research should let us make.'),
    ],
  },
  {
    id: 'questions',
    title: 'Research questions',
    hint: 'No required number of papers — research is sufficient when decision-relevant questions are answered well enough.',
    fields: [
      F('questions', 'Questions', 'One per line.', 'ai', { rows: 3 }),
      F('effort', 'Effort or time limit', 'Optional', 'handwrite', { short: true }),
      F('enough', 'Enough understanding means…', 'What would let us decide?'),
    ],
  },
  {
    id: 'synthesis',
    title: 'Synthesis',
    hint: 'Distinguish published findings, the team’s experiments, theoretical reasoning and assumptions.',
    fields: [
      F(
        'synthesis',
        'Answers to the questions',
        'What the findings mean for the project. Link important conclusions to sources or tests; keep disagreements and missing evidence visible.',
        'handwrite',
        { rows: 5 },
      ),
    ],
  },
  {
    id: 'recommendation',
    title: 'Recommendation',
    hint: 'Written by the researcher. The owner records the choice below.',
    fields: [
      F('recommendation', 'Recommended approach', 'What should we do?', 'handwrite', { rows: 3 }),
      F('reasons', 'Strongest supporting reasons', 'Link to the comparison and supporting material.'),
      F('tradeoffs', 'Main tradeoffs', ''),
      F('uncertainty', 'Remaining uncertainty', 'What could still change the answer.'),
      F('nextStep', 'Next step', '', 'handwrite', { short: true }),
    ],
  },
  {
    id: 'decision',
    title: 'Decision',
    hint: 'Recorded by the module owner. Later evidence can reopen it; earlier reasoning stays available.',
    fields: [F('chosen', 'Chosen approach', '', 'handwrite', { short: true }), F('rationale', 'Rationale', 'If this differs from the recommendation, say why.')],
  },
  {
    id: 'delivery',
    title: 'Delivery and verification',
    hint: 'The implementation of a research-led solution still needs its own verification.',
    fields: [
      F('approach', 'Agreed implementation approach', 'For modules that are mostly delivery work, describe the approach here.'),
      F('verification', 'Verification', 'What was checked, and the result.'),
      F('limitations', 'Limitations', ''),
      F('nextAction', 'Next action', '', 'handwrite', { short: true }),
    ],
  },
]
export const MODULE_FIELDS = new Map(MODULE_SECTIONS.flatMap((s) => s.fields).map((f) => [f.id, f]))

/** Individual paper notes (always Handwrite — they are personal notes). */
export const PAPER_NOTE_FIELDS: BriefField[] = [
  F('addresses', 'Problem and approach', 'What problem it addresses and how its approach works.'),
  F('findings', 'Relevant findings', 'Findings that matter for this module.'),
  F('assumptions', 'Assumptions and limits', 'Assumptions, evaluation conditions and limitations.'),
  F('applies', 'Applicability', 'Why it applies here — or where that is uncertain.'),
  F('where', 'Where in the source', 'Page, section or figure for important claims.', 'handwrite', { short: true }),
]

export const REFERENCE_KINDS: { id: ReferenceKind; label: string }[] = [
  { id: 'doc', label: 'Document' },
  { id: 'paper', label: 'Paper' },
  { id: 'obsidian', label: 'Obsidian note' },
  { id: 'web', label: 'Website' },
  { id: 'result', label: 'Test result' },
  { id: 'other', label: 'Other' },
]

export const CANDIDATE_STATUSES: { id: CandidateStatus; label: string }[] = [
  { id: 'considering', label: 'Under consideration' },
  { id: 'needs-test', label: 'Needs testing' },
  { id: 'deferred', label: 'Deferred' },
  { id: 'excluded', label: 'Excluded' },
  { id: 'not-evaluated', label: 'Not evaluated' },
]

// ───────────────────────────── colours ─────────────────────────────

/** One colour per kind of work, used for badges, lanes and the view switcher. */
export const WORK_COLOR = {
  operations: '#f2a93b',
  research: '#b48cff',
  implementation: '#6ea0ff',
  technical: '#38c6c6',
} as const

export function workColor(i: Pick<Issue, 'track' | 'workStyle'>) {
  if (i.track === 'operations') return WORK_COLOR.operations
  if (i.track === 'technical') return WORK_COLOR[categoryOfWork(i) ?? 'technical']
  return null
}

export function workDescription(i: Pick<Issue, 'track' | 'workStyle'>) {
  if (i.track !== 'technical') return trackLabel(i.track)
  const s = styleInfo(i.workStyle)
  return s ? `Technical · ${CATEGORY_LABEL[s.category]} · ${s.label}` : 'Technical · work style not chosen'
}

// ───────────────────────────── views ─────────────────────────────

export type WorkView = 'all' | 'operations' | 'technical' | 'research' | 'implementation' | 'unclassified'

export const WORK_VIEWS: { id: WorkView; label: string }[] = [
  { id: 'all', label: 'All work' },
  { id: 'operations', label: 'Operations' },
  { id: 'technical', label: 'Technical' },
  { id: 'research', label: 'Research heavy' },
  { id: 'implementation', label: 'Implementation heavy' },
  { id: 'unclassified', label: 'Unclassified' },
]
export const isWorkView = (v: string | null): v is WorkView => WORK_VIEWS.some((x) => x.id === v)

export const categoryOfWork = (i: Pick<Issue, 'track' | 'workStyle'>): WorkCategory | null => (i.track === 'technical' && i.workStyle ? styleInfo(i.workStyle)!.category : null)

export function inWorkView(i: Pick<Issue, 'track' | 'workStyle'>, view: WorkView) {
  switch (view) {
    case 'all':
      return true
    case 'operations':
      return i.track === 'operations'
    case 'technical':
      return i.track === 'technical'
    case 'research':
    case 'implementation':
      return categoryOfWork(i) === view
    case 'unclassified':
      return !i.track
  }
}

/** Defaults for issues created while a view is open (e.g. "+ Create" on the Operations board). */
export function viewDefaults(view: WorkView): Partial<Pick<Issue, 'track' | 'workStyle'>> {
  if (view === 'operations') return { track: 'operations', workStyle: null }
  if (view === 'technical') return { track: 'technical' }
  if (view === 'research') return { track: 'technical', workStyle: 'research' }
  if (view === 'implementation') return { track: 'technical', workStyle: 'direct' }
  return {}
}

// ───────────────────────────── completion ─────────────────────────────

const filled = (v: string | undefined) => !!v && v.trim().length > 0

/** What is checked before completion, by work style. Guidance only — nothing blocks a status change. */
export function completionChecks(issue: Issue, module?: WorkModule): { label: string; done: boolean }[] {
  const b = issue.brief ?? {}
  const m = module?.brief ?? {}
  const refs = (issue.references?.length ?? 0) + (module?.references.length ?? 0)
  if (issue.track === 'operations')
    return [
      { label: 'Stated outcome', done: filled(b.outcome) },
      { label: 'Result recorded for review', done: filled(b.result) },
    ]
  if (issue.track !== 'technical') return []
  switch (issue.workStyle) {
    case 'direct':
      return [
        { label: 'Acceptance checks agreed', done: filled(b.acceptance) },
        { label: 'What changed', done: filled(b.changed) },
        { label: 'Verification result', done: filled(b.verification) },
      ]
    case 'focused':
      return [
        { label: 'Answer or finding', done: filled(b.answer) },
        { label: 'Supporting basis', done: filled(b.basis) },
        { label: 'Implication for the linked work', done: filled(b.implication) },
      ]
    case 'research':
      return [
        { label: 'Synthesis or recommendation', done: filled(b.synthesis) || filled(b.recommendation) || filled(m.synthesis) || filled(m.recommendation) },
        { label: 'Supporting material linked', done: refs > 0 },
      ]
    default:
      return []
  }
}
