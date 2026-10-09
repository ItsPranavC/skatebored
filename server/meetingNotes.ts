/**
 * Rule-based meeting notes: no AI, just text processing. Turns a transcript (Zoom / Meet /
 * Teams / Otter exports, WebVTT, SRT or plain "Name: text") into a summary, key points,
 * decisions, open questions and suggested tasks routed to sprints.
 *
 * Pure functions only, so it's easy to test (scripts/test-meetings.ts).
 */

export interface Utterance {
  speaker: string | null
  text: string
  /** seconds from the start, when the transcript has timestamps */
  at: number | null
}

export interface TeamMember {
  id: string
  name: string
}

export interface SprintInfo {
  id: string
  name: string
  state: string
  startDate: string | null
  endDate: string | null
}

export interface DraftTask {
  summary: string
  description: string
  type: 'task' | 'bug'
  priority: 'highest' | 'high' | 'medium' | 'low' | 'lowest'
  assigneeId: string | null
  sprintId: string | null
  storyPoints: number | null
  rationale: string
}

export interface Notes {
  title: string
  summary: string
  keyPoints: string[]
  decisions: string[]
  openQuestions: string[]
  attendees: string[]
  tasks: DraftTask[]
  durationMinutes: number | null
}

// ───────────────────────────── parsing ─────────────────────────────

const TIME = /(\d{1,2}):(\d{2})(?::(\d{2}))?(?:[.,]\d{1,3})?/
const toSeconds = (m: RegExpMatchArray) => (m[3] !== undefined ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : Number(m[1]) * 60 + Number(m[2]))
const CUE_TIMING = /^\s*(\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{3}\s*-->\s*(\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{3}/
/** "Jane Doe:" / "Jane Doe (Host):" / "[Jane Doe]" at the start of a line */
const NAME = String.raw`(?:\p{Lu}[\p{L}\d.'’-]*(?:[ \t]+\p{Lu}[\p{L}\d.'’-]*){0,3}|\p{Ll}[\p{L}\d]*[-_.\d][\p{L}\d._-]*)`
const SPEAKER_PREFIX = new RegExp(String.raw`^\s*(?:\[([^\]]{1,60})\]|(${NAME}(?:[ \t]*\([^)]{1,30}\))?))\s*:\s+(.*)$`, 'u')
/** Otter / Meet style: "Jane Doe  0:01" or "Jane Doe 00:01:23" on its own line, text on the next */
const SPEAKER_HEADER = new RegExp(String.raw`^\s*(${NAME})[ \t]+(\d{1,2}:\d{2}(?::\d{2})?)\s*$`, 'u')
const NOT_SPEAKERS = new Set(['note', 'notes', 'action', 'action item', 'todo', 'decision', 'question', 'agenda', 'http', 'https', 're', 'q', 'a'])

export function parseTranscript(raw: string): Utterance[] {
  const lines = raw.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n')
  const out: Utterance[] = []
  let at: number | null = null
  let pendingSpeaker: string | null = null
  const push = (speaker: string | null, text: string) => {
    const t = text.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
    if (!t) return
    const last = out[out.length - 1]
    // Captions split one turn across many cues; join consecutive lines from the same speaker.
    if (last && last.speaker === speaker && (speaker !== null || !/[.!?]$/.test(last.text))) last.text += ' ' + t
    else out.push({ speaker, text: t, at })
  }
  for (const line of lines) {
    if (!line.trim() || /^WEBVTT/.test(line) || /^NOTE\b/.test(line) || /^\s*\d+\s*$/.test(line)) continue
    if (CUE_TIMING.test(line)) {
      const m = line.match(TIME)
      if (m) at = toSeconds(m)
      continue
    }
    const header = line.match(SPEAKER_HEADER)
    if (header) {
      pendingSpeaker = header[1]!.trim()
      const m = header[2]!.match(TIME)
      if (m) at = toSeconds(m)
      continue
    }
    // WebVTT voice tags: <v Jane Doe>text</v>
    const voice = line.match(/^<v\s+([^>]{1,60})>(.*)$/)
    if (voice) {
      push(voice[1]!.trim(), voice[2]!)
      pendingSpeaker = null
      continue
    }
    const prefixed = line.match(SPEAKER_PREFIX)
    const name = prefixed ? (prefixed[1] ?? prefixed[2])!.replace(/\s*\([^)]*\)\s*$/, '').trim() : null
    if (prefixed && name && !NOT_SPEAKERS.has(name.toLowerCase())) {
      push(name, prefixed[3]!)
      pendingSpeaker = null
      continue
    }
    // A leading timestamp on a plain line: "[00:12:03] text"
    const stamped = line.match(/^\s*\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s+(.*)$/)
    if (stamped) {
      const m = stamped[1]!.match(TIME)
      if (m) at = toSeconds(m)
      push(pendingSpeaker ?? out[out.length - 1]?.speaker ?? null, stamped[2]!)
      continue
    }
    push(pendingSpeaker ?? out[out.length - 1]?.speaker ?? null, line)
  }
  return out
}

// ───────────────────────────── sentences & scoring ─────────────────────────────

interface Sentence {
  text: string
  speaker: string | null
  index: number
}

const ABBREV = /\b(?:e\.g|i\.e|etc|vs|mr|mrs|ms|dr|approx|st)\.$/i
function splitSentences(utts: Utterance[]): Sentence[] {
  const out: Sentence[] = []
  for (const u of utts) {
    let buf = ''
    for (const part of u.text.split(/(?<=[.!?])\s+/)) {
      buf = buf ? `${buf} ${part}` : part
      if (ABBREV.test(buf)) continue
      out.push({ text: buf.trim(), speaker: u.speaker, index: out.length })
      buf = ''
    }
    if (buf.trim()) out.push({ text: buf.trim(), speaker: u.speaker, index: out.length })
  }
  return out
}

const STOP = new Set(
  `a about above after again against all also am an and any are aren't as at be because been before being below between both but by can can't cannot could couldn't did didn't do does doesn't doing don't down during each few for from further get got gonna had hadn't has hasn't have haven't having he he'd he'll he's her here here's hers herself him himself his how how's i i'd i'll i'm i've if in into is isn't it it's its itself just kind know let's like me more most mustn't my myself no nor not now of off ok okay on once one only or other ought our ours ourselves out over own really right said same say says see shan't she she'd she'll she's should shouldn't so some such sure than that that's the their theirs them themselves then there there's these they they'd they'll they're they've thing things think this those through to too um uh under until up us very want was wasn't we we'd we'll we're we've well were weren't what what's when when's where where's which while who who's whom why why's will with won't would wouldn't yeah yes yep you you'd you'll you're you've your yours yourself yourselves going go gonna actually basically maybe mean guess stuff lot little bit good great cool awesome thanks thank hey hi hello oh alright need needs needed today tomorrow tonight week weeks probably also work working decide decided set look make made sounds sound start started question questions next last team everyone something anything everything`.split(/\s+/),
)
const words = (s: string) => (s.toLowerCase().match(/[a-z][a-z0-9'’-]{1,}/g) ?? []).map((w) => w.replace(/[’']s$/, '')).filter((w) => !STOP.has(w) && w.length > 2)

/** Filler at the start of spoken sentences that makes notes read badly. */
const FILLER = /^(?:(?:so|okay|ok|alright|all right|yeah|yes|um+|uh+|right|well|and|but|also|like|i mean|you know|anyway|cool|great|sure|perfect)[,.!]?\s+)+/i
const tidy = (s: string) => {
  const t = s.replace(FILLER, '').replace(/\s+/g, ' ').trim()
  return t ? t[0]!.toUpperCase() + t.slice(1) : t
}
const SMALL_TALK = /\b(can you hear me|you'?re on mute|my internet|sorry i'?m late|see you|have a good|bye\b|thanks everyone|let'?s get started|next slide)\b/i
const isSmallTalk = (s: string) => words(s).length < 3 || SMALL_TALK.test(s)

function rankSentences(sentences: Sentence[]) {
  const tf = new Map<string, number>()
  for (const s of sentences) for (const w of new Set(words(s.text))) tf.set(w, (tf.get(w) ?? 0) + 1)
  const top = Math.max(1, ...tf.values())
  return sentences
    .filter((s) => !isSmallTalk(s.text) && s.text.length <= 400)
    .map((s) => {
      const ws = words(s.text)
      // Sentences that use the meeting's recurring vocabulary are the ones that say what it was about.
      const score = ws.reduce((n, w) => n + (tf.get(w) ?? 0) / top, 0) / Math.sqrt(ws.length + 1)
      return { s, score }
    })
    .sort((a, b) => b.score - a.score)
}

// ───────────────────────────── classifiers ─────────────────────────────

const DECISION = /\b(we(?:'ve| have)? decided|decided to|decision is|the decision|we(?:'re| are) going (?:to go )?with|let'?s go with|go with option|we(?:'ll| will) go with|agreed (?:to|that|on)|we(?:'ve| have)? agreed|we agree|everyone agrees|final(?:ly)? (?:call|decision)|approved|sign(?:ed)? off on|ship it|locked in|settled on|we'?re not going to|we won'?t (?:do|be doing)|scrap(?:ping)?|cut (?:it|that) from)\b/i
const QUESTION = /\?\s*$/
const UNSURE = /\b(not sure|unclear|tbd|to be decided|open question|need to figure out|need to decide|don'?t know (?:yet|if|whether)|we'?ll see|haven'?t decided|still deciding|pending|blocked on|waiting on|risk is|concern is|worried)\b/i
const RHETORICAL = /^(?:right|okay|ok|you know|make sense|does that make sense|can you hear me|is that clear|sound good|cool|yeah)\??$/i

const SELF_COMMIT = /\b(?:i'?ll|i will|i'?m going to|i am going to|i can (?:take|handle|do|own|look)|let me|i'?ll take|i'?ll own|i'?m on it|i'?ll handle|i'?ll look into|i'?ll follow up)\b/i
const REQUEST = /\b(?:can you|could you|would you|will you|please|you'?ll need to|you should|can someone|could someone|someone (?:needs|should) to|who can)\b/i
const TEAM_TODO = /\b(?:we need to|we have to|we should|we'?ve got to|we must|need to|needs to|has to|have to|should probably|let'?s (?!go with|move on|start|get started|wrap|take a|see)|action item|to-?do|follow up|follow-up|make sure (?:we|to)|don'?t forget to|remember to|by (?:monday|tuesday|wednesday|thursday|friday|eod|end of (?:day|week|sprint)|tomorrow|next week))\b/i
const NOT_ACTION = /\b(?:let'?s (?:review|recap|go over|look at|talk about|discuss|begin|kick off|jump in|dive in)|today we|in this (?:meeting|call)|the agenda|on the agenda|we'?re here to|goal of this|purpose of this|i think|i feel|i guess|i wonder|last (?:week|sprint)|yesterday|already (?:did|done|finished|shipped)|we did|i did|was done|i'?ll (?:be honest|say|admit|tell you|just say|share my screen|stop sharing|let you)|let me (?:know|see|think|share|check if you)|i'?ll be (?:quick|brief|right back))\b/i
const BUG = /\b(bug|fix|broken|breaks|crash(?:es|ing)?|error|exception|regression|failing|fails|500|404|not working|doesn'?t work|glitch|issue with)\b/i
const URGENT = /\b(urgent|asap|right away|immediately|today|tonight|blocker|blocking|critical|top priority|p0|before (?:the )?(?:demo|launch|release))\b/i
const HIGH = /\b(important|priority|this week|tomorrow|soon|by friday|before end of sprint|this sprint|high)\b/i
const LOW = /\b(eventually|someday|at some point|nice to have|low priority|later on|when we have time|if we have time|not urgent|backlog)\b/i
const NEXT_SPRINT = /\b(next sprint|next week|after (?:this|the) sprint|following sprint|next cycle)\b/i
const THIS_SPRINT = /\b(this sprint|this week|today|tomorrow|tonight|asap|right away|before (?:friday|the demo|end of (?:day|week|sprint))|by (?:monday|tuesday|wednesday|thursday|friday|eod))\b/i
const ESTIMATE = [
  [/\b(quick|small|tiny|five minutes|10 minutes|an hour|easy|trivial|simple)\b/i, 1],
  [/\b(couple (?:of )?hours|half a day|minor)\b/i, 2],
  [/\b(a day|one day|day or two|couple (?:of )?days)\b/i, 3],
  [/\b(few days|half (?:a|the) week|several days)\b/i, 5],
  [/\b(a week|whole week|big|large|major|complex|rewrite|overhaul|redesign|migration)\b/i, 8],
] as const

/** "I'll update the docs by Friday" → "Update the docs" */
function taskTitle(sentence: string) {
  let t = tidy(sentence)
    .replace(/^.*?\b(?:action item|to-?do)\s*[:-]?\s*/i, '')
    .replace(/^[A-Z][a-z]+,\s+(?=(?:can|could|would|will|please)\b)/, '')
    .replace(/^(?:i think |i guess |maybe |probably |honestly |so )+/i, '')
    .replace(/^(?:i'?ll|i will|i'?m going to|i am going to|i can|let me|we need to|we have to|we should|we'?ve got to|we must|let'?s|can you|could you|would you|will you|please|you'?ll need to|you should|can someone|could someone|someone needs to|someone should|need to|make sure (?:we|to)|don'?t forget to|remember to|go ahead and|also)\s+/i, '')
    .replace(/^(?:go ahead and|also|just|quickly|probably|definitely|actually)\s+/i, '')
    .replace(/\s+\b(?:by|before|after|until|on|for)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|eod|end of (?:day|the day|week|the week|sprint|the sprint)|tomorrow|tonight|today|next week|this week|next sprint|this sprint)\b.*$/i, '')
    .replace(/\s+(?:this|next) (?:week|sprint|month)\b.*$|\s+(?:today|tomorrow|tonight|asap|right away|immediately|eventually|someday|at some point|later)\b.*$/i, '')
    .replace(/\s*,?\s*(?:okay|ok|right|yeah|please|if (?:you|that'?s) (?:can|okay|ok|possible)|when you get a chance|if possible|as well|too|then|now|first|afterwards|after that|for now)\s*[?.!]*$/i, '')
    .replace(/[?.!,;:]+$/, '')
    .trim()
  // "the onboarding email" → "Handle the onboarding email" when no verb survived
  if (/^(?:the|a|an|our|this|that|some)\b/i.test(t)) t = `Handle ${t}`
  t = t.replace(/\byour\b/gi, 'the').replace(/\bmy\b/gi, 'the').replace(/\bme\b/gi, 'the team')
  t = t ? t[0]!.toUpperCase() + t.slice(1) : t
  return t.length > 90 ? t.slice(0, 87).replace(/\s+\S*$/, '') + '…' : t
}

function firstName(n: string) {
  return n.trim().split(/\s+/)[0]!.toLowerCase()
}

function matchMember(name: string | null, team: TeamMember[]) {
  if (!name) return null
  const n = name.trim().toLowerCase()
  return (team.find((u) => u.name.toLowerCase() === n) ?? team.find((u) => firstName(u.name) === firstName(n)))?.id ?? null
}

/** Someone named in the sentence, e.g. "Priya, can you…" or "…assign it to Sam". */
function namedMember(text: string, team: TeamMember[]) {
  for (const u of team) {
    const f = firstName(u.name)
    if (f.length < 3) continue
    if (new RegExp(`(^|[^\\w])(${f}|${u.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})([^\\w]|$)`, 'i').test(text)) return u.id
  }
  return null
}

function chooseSprint(text: string, sprints: SprintInfo[], urgent: boolean) {
  const open = sprints.filter((s) => s.state !== 'closed')
  const active = open.filter((s) => s.state === 'active').sort((a, b) => (a.endDate ?? '').localeCompare(b.endDate ?? ''))[0]
  const future = open.filter((s) => s.state === 'future').sort((a, b) => (a.startDate ?? '9999').localeCompare(b.startDate ?? '9999'))[0]
  // A sprint named outright: "put it in Sprint 3".
  const named = open.find((s) => new RegExp(`\\b${s.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text))
  if (named) return named.id
  if (LOW.test(text)) return null
  if (NEXT_SPRINT.test(text)) return (future ?? active)?.id ?? null
  if (urgent || THIS_SPRINT.test(text)) return (active ?? future)?.id ?? null
  return (active ?? future)?.id ?? null
}

function similar(a: string, b: string) {
  const A = new Set(words(a))
  const B = new Set(words(b))
  if (!A.size || !B.size) return 0
  let common = 0
  for (const w of A) if (B.has(w)) common++
  return common / Math.min(A.size, B.size)
}

// ───────────────────────────── main ─────────────────────────────

export function buildNotes(raw: string, opts: { title?: string; team: TeamMember[]; sprints: SprintInfo[]; openIssues: string[]; maxTasks?: number }): Notes {
  const utts = parseTranscript(raw)
  const sentences = splitSentences(utts)
  const ranked = rankSentences(sentences)
  const say = (s: Sentence) => (s.speaker ? `${s.speaker}: ` : '') + tidy(s.text)

  // Attendees: everyone who spoke, most talkative first.
  const talk = new Map<string, number>()
  for (const u of utts) if (u.speaker) talk.set(u.speaker, (talk.get(u.speaker) ?? 0) + u.text.length)
  const attendees = [...talk.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n)

  const times = utts.map((u) => u.at).filter((t): t is number => t !== null)
  const durationMinutes = times.length > 1 ? Math.max(1, Math.round((Math.max(...times) - Math.min(...times)) / 60)) : null

  const decisions = sentences.filter((s) => DECISION.test(s.text) && !QUESTION.test(s.text) && words(s.text).length >= 3).map(say)
  const openQuestions = sentences
    .filter((s) => (QUESTION.test(s.text) && words(s.text).length >= 2 && !RHETORICAL.test(tidy(s.text)) && !REQUEST.test(s.text) && !SMALL_TALK.test(s.text)) || (UNSURE.test(s.text) && s.text.length > 8))
    .map(say)

  // Tasks: commitments ("I'll…"), requests ("Sam, can you…") and team to-dos ("we need to…").
  const maxTasks = opts.maxTasks ?? 15
  const tasks: DraftTask[] = []
  for (const s of sentences) {
    const text = s.text
    const commit = SELF_COMMIT.test(text)
    const request = REQUEST.test(text)
    const todo = TEAM_TODO.test(text)
    if (!(commit || request || todo) || NOT_ACTION.test(text) || SMALL_TALK.test(text) || DECISION.test(text) && !commit) continue
    if ((QUESTION.test(text) && !request) || UNSURE.test(text)) continue
    const prev = sentences[s.index - 1]
    let summary = taskTitle(text)
    if (/^(?:that|this|it)(?:'s|’s| is| was)\b/i.test(tidy(text)) && prev && !isSmallTalk(prev.text))
      summary = `${BUG.test(text) ? 'Fix' : 'Handle'}: ${tidy(prev.text).replace(/[.!?]+$/, '')}`.slice(0, 90)
    // "Put the spec in Sprint 2" → "The spec"; the sprint is captured separately.
    for (const sp of opts.sprints) summary = summary.replace(new RegExp(`\\s+(?:in|into|for|to)\\s+(?:the\\s+)?${sp.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'), '')
    summary = summary.replace(/^(?:put|add|move|schedule|plan)\s+(?=the\b)/i, '').replace(/^the\s+/i, (m) => (/^(?:the)\s+\w+\s+\w+/i.test(summary) ? '' : m))
    summary = summary ? summary[0]!.toUpperCase() + summary.slice(1) : summary
    if (words(summary).length < 2 || summary.length < 8) continue
    if (opts.openIssues.some((i) => similar(i, summary) >= 0.75)) continue
    const dupe = tasks.find((t) => similar(t.summary, summary) >= 0.7)
    const named = namedMember(text, opts.team)
    const speaker = matchMember(s.speaker, opts.team)
    // "I'll…" → the speaker; "Sam, can you…" / "…give it to Sam" → the person named.
    const reply = request && !named ? sentences.slice(s.index + 1).find((x) => x.speaker !== s.speaker) : undefined
    const accepted = reply && /^(?:yes|yeah|yep|sure|ok(?:ay)?|will do|on it|got it|can do|i can|i'?ll do|absolutely|definitely|no problem)\b/i.test(tidy(reply.text)) ? matchMember(reply.speaker, opts.team) : null
    const assigneeId = commit ? speaker : (named ?? accepted)
    // The sentence before often says what "it" or "that" is.
    const context = prev && /\b(?:fix|do|handle|take|own|ship|update|finish|check|review|test|move|write|build|send|schedule|book|look into|follow up on)\s+(?:it|that|this|those|them)\b|\b(?:it|that|them)[.!?]?$/i.test(text) && !isSmallTalk(prev.text) ? `${say(prev)}\n` : ''
    // The speaker's next sentence often adds the size or urgency: "It's probably a couple of days."
    const next = sentences[s.index + 1]
    const around = next && next.speaker === s.speaker && !SELF_COMMIT.test(next.text) && !REQUEST.test(next.text) ? `${text} ${next.text}` : text
    const urgent = URGENT.test(around)
    if (dupe) {
      // Same work mentioned twice ("let's put the spec in Sprint 2" … "I'll draft the spec"):
      // keep one task, owned by whoever committed, in the sprint that was named.
      if (!dupe.assigneeId && assigneeId) {
        dupe.assigneeId = assigneeId
        dupe.summary = summary
      }
      dupe.sprintId ??= chooseSprint(around, opts.sprints, urgent)
      dupe.description += `\n${say(s)}`
      if (urgent) dupe.priority = 'highest'
      continue
    }
    tasks.push({
      summary,
      description: `${context}${say(s)}`,
      type: BUG.test(text) ? 'bug' : 'task',
      priority: urgent ? 'highest' : HIGH.test(around) ? 'high' : LOW.test(around) ? 'low' : 'medium',
      assigneeId,
      sprintId: chooseSprint(around, opts.sprints, urgent),
      storyPoints: ESTIMATE.find(([re]) => re.test(around))?.[1] ?? null,
      rationale: say(s),
    })
  }
  // Explicit commitments first, then urgent work.
  const weight = { highest: 0, high: 1, medium: 2, low: 3, lowest: 4 }
  tasks.sort((a, b) => Number(!a.assigneeId) - Number(!b.assigneeId) || weight[a.priority] - weight[b.priority])

  const taskSentences = new Set(tasks.map((t) => t.rationale))
  const statement = (x: Sentence) => !QUESTION.test(x.text) && !REQUEST.test(x.text) && !UNSURE.test(x.text) && !TEAM_TODO.test(x.text) && !SELF_COMMIT.test(x.text) && !taskSentences.has(say(x)) && words(x.text).length >= 4
  const summaryPicks = ranked.filter((r) => statement(r.s)).slice(0, 4).map((r) => r.s).sort((a, b) => a.index - b.index)
  const used = new Set(summaryPicks.map((s) => s.index))
  const keyPoints = ranked
    .filter((r) => !used.has(r.s.index) && !DECISION.test(r.s.text) && statement(r.s))
    .slice(0, 7)
    .map((r) => r.s)
    .sort((a, b) => a.index - b.index)
    .map(say)

  const topics = topTerms(sentences, 4)
  const lead = `${attendees.length ? `${attendees.length} ${attendees.length === 1 ? 'person' : 'people'}` : 'The team'} met${durationMinutes ? ` for about ${durationMinutes} minute${durationMinutes === 1 ? '' : 's'}` : ''}${topics.length ? ` to discuss ${list(topics)}` : ''}.`
  const tail = [decisions.length && `${decisions.length} decision${decisions.length === 1 ? '' : 's'} made`, tasks.length && `${tasks.length} follow-up task${tasks.length === 1 ? '' : 's'} identified`].filter(Boolean).join(', ')
  const summary = [lead, ...summaryPicks.map((s) => tidy(s.text).replace(/([^.!?])$/, '$1.')), tail && `${tail[0]!.toUpperCase()}${tail.slice(1)}.`].filter(Boolean).join(' ')

  return {
    title: opts.title?.trim() || (topics.length ? cap(list(topics.slice(0, 3))) : 'Team meeting'),
    summary,
    keyPoints,
    decisions: dedupe(decisions).slice(0, 12),
    openQuestions: dedupe(openQuestions).slice(0, 10),
    attendees,
    tasks: tasks.slice(0, maxTasks),
    durationMinutes,
  }
}

function topTerms(sentences: Sentence[], n: number) {
  const uni = new Map<string, number>()
  const bi = new Map<string, number>()
  for (const s of sentences) {
    if (isSmallTalk(s.text)) continue
    const tokens = (s.text.toLowerCase().match(/[a-z][a-z0-9'’-]+/g) ?? []).map((w) => w.replace(/[’']s$/, ''))
    for (const w of new Set(tokens.filter((w) => !STOP.has(w) && w.length > 2))) uni.set(w, (uni.get(w) ?? 0) + 1)
    const pairs = new Set<string>()
    for (let i = 0; i + 1 < tokens.length; i++) {
      const [a, b] = [tokens[i]!, tokens[i + 1]!]
      if (!STOP.has(a) && !STOP.has(b) && a.length > 2 && b.length > 2) pairs.add(`${a} ${b}`)
    }
    for (const p of pairs) bi.set(p, (bi.get(p) ?? 0) + 1)
  }
  const phrases = [...bi.entries()].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).map(([p]) => p)
  const covered = new Set(phrases.flatMap((p) => p.split(' ')))
  const singles = [...uni.entries()].filter(([w, c]) => c >= 2 && !covered.has(w) && !/^\d+$/.test(w)).sort((a, b) => b[1] - a[1]).map(([w]) => w)
  return [...phrases, ...singles].slice(0, n)
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)

function dedupe(xs: string[]) {
  const out: string[] = []
  for (const x of xs) if (!out.some((y) => similar(x, y) >= 0.8)) out.push(x)
  return out
}
