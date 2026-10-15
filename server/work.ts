/**
 * Operations / Technical work config for the MCP server.
 *
 * MIRRORS src/lib/work.ts — the server can't import from src/ (path aliases, and the
 * Vercel functions bundle only server/ and api/). Only labels, authoring and the
 * per-style flow/output are copied; keep field ids, labels and authoring in sync
 * when src/lib/work.ts changes.
 */

export type WorkTrack = 'operations' | 'technical'
export type WorkStyle = 'direct' | 'focused' | 'research'
export type Authoring = 'ai' | 'handwrite'
export type WorkCategory = 'implementation' | 'research'

export interface BriefField {
  id: string
  label: string
  authoring: Authoring
}
export interface BriefGroup {
  title: string
  fields: BriefField[]
}

export const AUTHORING_LABEL: Record<Authoring, string> = { ai: 'Use AI', handwrite: 'Handwrite' }
export const CATEGORY_LABEL: Record<WorkCategory, string> = { implementation: 'Implementation heavy', research: 'Research heavy' }
export const trackLabel = (t: WorkTrack | null | undefined) => (t === 'operations' ? 'Operations' : t === 'technical' ? 'Technical' : 'Unclassified')

export interface WorkStyleInfo {
  id: WorkStyle
  label: string
  category: WorkCategory
  flow: string[]
  output: string
}

export const WORK_STYLES: WorkStyleInfo[] = [
  { id: 'direct', label: 'Direct implementation', category: 'implementation', flow: ['Define outcome', 'Build', 'Review and verify'], output: 'Change, acceptance checks and verification result' },
  { id: 'focused', label: 'Focused investigation', category: 'implementation', flow: ['Define question', 'Investigate', 'Continue implementation'], output: 'Short answer, supporting basis and its effect on the work' },
  { id: 'research', label: 'Research-led', category: 'research', flow: ['Frame', 'Research', 'Compare', 'Recommend', 'Implement and verify'], output: 'Synthesis, justified choice and verification' },
]
export const styleInfo = (s: WorkStyle | null | undefined) => WORK_STYLES.find((x) => x.id === s)
export const OPERATIONS_FLOW = { flow: ['Outcome', 'Owner', 'Deadline', 'Review'], output: 'The stated outcome, with the result recorded for review' }

const F = (id: string, label: string, authoring: Authoring = 'handwrite'): BriefField => ({ id, label, authoring })

const OPERATIONS_FIELDS: BriefGroup[] = [
  { title: 'Outcome', fields: [F('outcome', 'Expected outcome'), F('notes', 'Notes')] },
  { title: 'Result', fields: [F('result', 'What was done')] },
]
const DIRECT_FIELDS: BriefGroup[] = [
  { title: 'Define outcome', fields: [F('outcome', 'Outcome and why it matters'), F('acceptance', 'Acceptance checks'), F('approach', 'Approach and constraints')] },
  { title: 'Build', fields: [F('notes', 'Notes and questions')] },
  { title: 'Review and verify', fields: [F('changed', 'What changed'), F('verification', 'Verification result'), F('limitations', 'Limitations')] },
]
const FOCUSED_FIELDS: BriefGroup[] = [
  { title: 'Define question', fields: [F('question', 'Question', 'ai'), F('why', 'Why the answer matters'), F('effort', 'Effort limit')] },
  { title: 'Investigate', fields: [F('notes', 'Investigation notes')] },
  {
    title: 'Continue implementation',
    fields: [F('answer', 'Answer or current finding'), F('basis', 'Supporting basis'), F('implication', 'What it changes about implementation'), F('uncertainty', 'Unresolved uncertainty')],
  },
]
const RESEARCH_FIELDS: BriefGroup[] = [
  { title: 'Frame', fields: [F('problem', 'Problem and decision'), F('questions', 'Research questions', 'ai'), F('effort', 'Effort or time limit'), F('enough', 'Enough understanding means…')] },
  { title: 'Research', fields: [F('notes', 'Personal notes')] },
  { title: 'Recommend', fields: [F('synthesis', 'Synthesis'), F('recommendation', 'Recommendation')] },
  { title: 'Implement and verify', fields: [F('verification', 'Verification')] },
]

export function taskGroups(issue: { track?: WorkTrack | null; workStyle?: WorkStyle | null }): BriefGroup[] {
  if (issue.track === 'operations') return OPERATIONS_FIELDS
  if (issue.track !== 'technical') return []
  if (issue.workStyle === 'direct') return DIRECT_FIELDS
  if (issue.workStyle === 'focused') return FOCUSED_FIELDS
  if (issue.workStyle === 'research') return RESEARCH_FIELDS
  return []
}
/** Every task field, for labelling text written under an earlier work style. */
export const ALL_TASK_FIELDS = new Map([OPERATIONS_FIELDS, DIRECT_FIELDS, FOCUSED_FIELDS, RESEARCH_FIELDS].flat().flatMap((g) => g.fields).map((f) => [f.id, f]))

export const MODULE_SECTIONS: { title: string; fields: BriefField[] }[] = [
  {
    title: 'Problem',
    fields: [
      F('problem', 'Current situation and desired outcome'),
      F('example', 'Concrete example'),
      F('context', 'Essential terms'),
      F('formulation', 'Technical definitions or formulation', 'ai'),
      F('scope', 'Scope and constraints'),
      F('decision', 'Decision this supports'),
    ],
  },
  { title: 'Research questions', fields: [F('questions', 'Questions', 'ai'), F('effort', 'Effort or time limit'), F('enough', 'Enough understanding means…')] },
  { title: 'Synthesis', fields: [F('synthesis', 'Answers to the questions')] },
  {
    title: 'Recommendation',
    fields: [F('recommendation', 'Recommended approach'), F('reasons', 'Strongest supporting reasons'), F('tradeoffs', 'Main tradeoffs'), F('uncertainty', 'Remaining uncertainty'), F('nextStep', 'Next step')],
  },
  { title: 'Decision', fields: [F('chosen', 'Chosen approach'), F('rationale', 'Rationale')] },
  { title: 'Delivery and verification', fields: [F('approach', 'Agreed implementation approach'), F('verification', 'Verification'), F('limitations', 'Limitations'), F('nextAction', 'Next action')] },
]

export const REFERENCE_KIND_LABEL: Record<string, string> = { doc: 'Document', paper: 'Paper', obsidian: 'Obsidian note', web: 'Website', result: 'Test result', other: 'Other' }
export const CANDIDATE_STATUS_LABEL: Record<string, string> = {
  considering: 'Under consideration',
  'needs-test': 'Needs testing',
  deferred: 'Deferred',
  excluded: 'Excluded',
  'not-evaluated': 'Not evaluated',
}
