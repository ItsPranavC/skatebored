import type { Sprint, SprintKind, SprintStep, SprintStepKey } from '@/types'

/** Engineering sprints: what each kind is made of. */
export const SPRINT_KINDS: { value: SprintKind; label: string; hint: string }[] = [
  { value: 'research', label: 'Research', hint: 'Research, alternatives, then a solution' },
  { value: 'implementation', label: 'Implementation', hint: 'Build it by an implementation date' },
]

export const STEPS: Record<SprintKind, { key: SprintStepKey; label: string }[]> = {
  research: [
    { key: 'research', label: 'Research' },
    { key: 'alternatives', label: 'Alternatives' },
    { key: 'solution', label: 'Solution' },
  ],
  implementation: [{ key: 'implementation', label: 'Implementation' }],
}

export const kindLabel = (k: SprintKind) => SPRINT_KINDS.find((x) => x.value === k)!.label

export const EMPTY_STEP: SprintStep = { docs: [], presentAt: null, date: null }

export const stepOf = (sprint: Sprint, key: SprintStepKey): SprintStep => ({ ...EMPTY_STEP, ...sprint.steps?.[key] })

/** "Google Doc", "Slides", … so a list of links stays readable. */
export function docLabel(url: string): string {
  try {
    const u = new URL(url)
    if (u.hostname === 'docs.google.com') {
      if (u.pathname.startsWith('/document')) return 'Google Doc'
      if (u.pathname.startsWith('/presentation')) return 'Slides'
      if (u.pathname.startsWith('/spreadsheets')) return 'Sheet'
    }
    if (u.hostname === 'drive.google.com') return 'Drive file'
    return u.hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** Adds https:// when someone pastes "docs.google.com/…". Empty strings are dropped. */
export function cleanDocs(docs: string[]): string[] {
  return docs.map((d) => d.trim()).filter(Boolean).map((d) => (/^[a-z]+:\/\//i.test(d) ? d : `https://${d}`))
}
