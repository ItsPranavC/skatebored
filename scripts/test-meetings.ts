/**
 * Checks the rule-based meeting notes (server/meetingNotes.ts) against realistic
 * transcripts in the common export formats. Run: npm run test:meetings
 */
import { buildNotes, parseTranscript } from '../server/meetingNotes.js'

const team = [
  { id: 'u-pranav', name: 'Pranav Cavaturu' },
  { id: 'u-insol', name: 'in-sol-ence' },
  { id: 'u-maya', name: 'Maya Chen' },
  { id: 'u-sam', name: 'Sam Ortiz' },
]
const sprints = [
  { id: 's1', name: 'SKB Sprint 1', state: 'active', startDate: '2026-10-07T05:00:00.000Z', endDate: '2026-10-12T04:59:00.000Z' },
  { id: 's2', name: 'SKB Sprint 2', state: 'future', startDate: '2026-10-11T05:00:00.000Z', endDate: '2026-10-15T04:59:00.000Z' },
]
const openIssues = ['Set up CI pipeline for the web app']

const ZOOM_VTT = `WEBVTT

1
00:00:01.000 --> 00:00:04.000
Pranav Cavaturu: Okay, let's get started. Can everyone hear me?

2
00:00:05.000 --> 00:00:12.000
Pranav Cavaturu: So today we need to plan the onboarding flow for the adaptive learning app and look at the quiz engine bugs.

3
00:00:13.000 --> 00:00:22.000
Maya Chen: The quiz engine crashes when a student skips a question. That's a blocker for the demo, so it's urgent.

4
00:00:23.000 --> 00:00:28.000
Sam Ortiz: I'll fix the quiz engine crash today.

5
00:00:29.000 --> 00:00:40.000
Pranav Cavaturu: Great. We decided to go with the three step onboarding flow instead of the long survey.

6
00:00:41.000 --> 00:00:50.000
Maya Chen: I'll design the onboarding screens this week. It's probably a couple of days of work.

7
00:00:51.000 --> 00:01:02.000
Pranav Cavaturu: Sam, can you set up analytics events for onboarding next sprint?

8
00:01:03.000 --> 00:01:10.000
Sam Ortiz: Sure. Should we track the time spent on each onboarding step?

9
00:01:11.000 --> 00:01:20.000
Pranav Cavaturu: Not sure yet, we need to decide that with the research team.

10
00:01:21.000 --> 00:01:30.000
Maya Chen: We should also write docs for the onboarding API eventually, it's nice to have.

11
00:01:31.000 --> 00:01:36.000
Pranav Cavaturu: And we need to set up the CI pipeline for the web app.

12
00:01:37.000 --> 00:01:42.000
Pranav Cavaturu: Thanks everyone, see you tomorrow.
`

const OTTER = `Maya Chen  0:00
Quick sync on the landing page. The signup button is broken on mobile Safari.

Pranav Cavaturu  0:14
I'll look into the Safari signup bug right away. Maya, could you update the hero copy before Friday?

Maya Chen  0:31
Yep. We agreed that the pricing section is cut from the launch.

Sam Ortiz  0:45
What's the deadline for the press kit?
`

const PLAIN = `Pranav: Let's review the sprint. The adaptive quiz shipped last week and I already did the release notes.
Maya: Who owns the parent dashboard?
Pranav: Good question, still deciding. Let's put the parent dashboard spec in SKB Sprint 2.
Maya: OK. I will draft the parent dashboard spec then.
`

let failed = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || detail === undefined ? '' : `\n    got: ${JSON.stringify(detail, null, 1)}`}`)
  if (!ok) failed++
}

// ── Zoom WebVTT ──
{
  const utts = parseTranscript(ZOOM_VTT)
  check('vtt: speakers parsed', new Set(utts.map((u) => u.speaker)).size === 3, utts.slice(0, 3))
  const n = buildNotes(ZOOM_VTT, { team, sprints, openIssues })
  console.log(JSON.stringify(n, null, 1))
  check('vtt: attendees', n.attendees.length === 3, n.attendees)
  check('vtt: duration ~1 min', n.durationMinutes === 1 || n.durationMinutes === 2, n.durationMinutes)
  check('vtt: decision found', n.decisions.some((d) => /three step onboarding/i.test(d)), n.decisions)
  check('vtt: open question found', n.openQuestions.some((q) => /time spent|not sure/i.test(q)), n.openQuestions)
  const crash = n.tasks.find((t) => /quiz engine crash/i.test(t.summary))
  check('vtt: crash fix task → Sam, bug, urgent, active sprint', !!crash && crash.assigneeId === 'u-sam' && crash.type === 'bug' && crash.priority === 'highest' && crash.sprintId === 's1', crash)
  const design = n.tasks.find((t) => /design the onboarding screens/i.test(t.summary))
  check('vtt: design task → Maya, this sprint, ~3 pts', !!design && design.assigneeId === 'u-maya' && design.sprintId === 's1' && design.storyPoints === 3, design)
  const analytics = n.tasks.find((t) => /analytics events/i.test(t.summary))
  check('vtt: request → Sam, next sprint', !!analytics && analytics.assigneeId === 'u-sam' && analytics.sprintId === 's2', analytics)
  const docs = n.tasks.find((t) => /docs/i.test(t.summary))
  check('vtt: "eventually / nice to have" → backlog, low', !!docs && docs.sprintId === null && docs.priority === 'low', docs)
  check('vtt: existing issue (CI pipeline) not suggested again', !n.tasks.some((t) => /ci pipeline/i.test(t.summary)), n.tasks.map((t) => t.summary))
  check('vtt: small talk not a task', !n.tasks.some((t) => /hear me|see you/i.test(t.summary)), n.tasks.map((t) => t.summary))
}

// ── Otter export ──
{
  const n = buildNotes(OTTER, { team, sprints, openIssues: [] })
  console.log(JSON.stringify(n.tasks, null, 1))
  check('otter: speakers parsed', n.attendees.length === 3, n.attendees)
  check('otter: Safari bug → Pranav, urgent', n.tasks.some((t) => /safari signup bug/i.test(t.summary) && t.assigneeId === 'u-pranav' && t.priority === 'highest' && t.type === 'bug'), n.tasks)
  check('otter: hero copy request → Maya', n.tasks.some((t) => /hero copy/i.test(t.summary) && t.assigneeId === 'u-maya'), n.tasks)
  check('otter: decision found', n.decisions.some((d) => /pricing section/i.test(d)), n.decisions)
  check('otter: question found', n.openQuestions.some((q) => /press kit/i.test(q)), n.openQuestions)
}

// ── Plain "Name: text" ──
{
  const n = buildNotes(PLAIN, { team, sprints, openIssues: [] })
  console.log(JSON.stringify(n.tasks, null, 1))
  check('plain: past work not a task', !n.tasks.some((t) => /release notes/i.test(t.summary)), n.tasks.map((t) => t.summary))
  check('plain: named sprint honoured', n.tasks.some((t) => /parent dashboard spec/i.test(t.summary) && t.sprintId === 's2'), n.tasks)
  check('plain: open question', n.openQuestions.some((q) => /parent dashboard|still deciding/i.test(q)), n.openQuestions)
}

// ── usernames, replies, pronouns ──
{
  const t = `Pranav Cavaturu  0:00
Okay, quick standup for the adaptive learning platform.

in-sol-ence  0:20
The lesson recommender is returning the same lesson twice. That's a bug we need to fix before the demo.

Pranav Cavaturu  0:41
I'll pair on the recommender bug tomorrow. Can you write the test cases for the recommender next sprint?

in-sol-ence  1:05
Yes. We agreed the demo stays on Friday. Who is presenting the roadmap?

Pranav Cavaturu  1:20
Not sure yet. We should also clean up the old feature flags eventually.
`
  const n = buildNotes(t, { team, sprints, openIssues: [] })
  console.log(JSON.stringify(n, null, 1))
  check('username speaker parsed', n.attendees.includes('in-sol-ence'), n.attendees)
  check('"can you…" → whoever said yes', n.tasks.some((x) => /test cases/i.test(x.summary) && x.assigneeId === 'u-insol' && x.sprintId === 's2'), n.tasks)
  check('"That\'s a bug…" titled from the previous sentence', n.tasks.some((x) => /^Fix: The lesson recommender/i.test(x.summary) && x.type === 'bug'), n.tasks.map((x) => x.summary))
  check('"we agreed the…" is a decision', n.decisions.some((d) => /demo stays on Friday/i.test(d)), n.decisions)
  check('short commitment ("I\'ll present the roadmap") is a task', buildNotes('Pranav Cavaturu: Who is presenting?\nin-sol-ence: I\'ll present the roadmap. Thanks everyone, see you tomorrow.', { team, sprints, openIssues: [] }).tasks.some((x) => /present the roadmap/i.test(x.summary) && x.assigneeId === 'u-insol'))
  check('open questions not repeated as key points', !n.keyPoints.some((k) => /not sure/i.test(k)), n.keyPoints)
  check('short question kept', n.openQuestions.some((q) => /presenting the roadmap/i.test(q)), n.openQuestions)
}

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed')
process.exit(failed ? 1 : 0)
