import { randomBytes } from 'node:crypto'
import { get, put } from '@vercel/blob'
import { HttpError, json, requireUser } from './auth.js'
import { ensureSchema, pool, WORKSPACE_ID } from './db.js'
import { buildNotes } from './meetingNotes.js'
import { applyOps } from './sync.js'

/**
 * Meeting notes. A teammate uploads a transcript; it's kept in private Blob storage and
 * turned into notes plus suggested tasks (each pointed at a sprint) by the rule-based
 * parser in meetingNotes.ts — no AI involved. The result is written as a `meetings`
 * record through applyOps, so it syncs to everyone like any other workspace data.
 */

const MAX_TRANSCRIPT_CHARS = 400_000
const MAX_SUGGESTIONS = 15

type Rec = { collection: string; id: string; data: Record<string, unknown> }

async function workspaceContext(projectId: string | null) {
  const { rows } = await pool().query<Rec>(
    `select collection, id, data from sb_records where workspace_id = $1 and not deleted and data is not null and collection in ('users', 'projects', 'sprints', 'issues')`,
    [WORKSPACE_ID],
  )
  const of = (c: string) => rows.filter((r) => r.collection === c)
  const projects = of('projects')
  const doneStatuses = new Set(projects.flatMap((p) => ((p.data.statuses as { id: string; category: string }[]) ?? []).filter((s) => s.category === 'done').map((s) => s.id)))
  const inScope = (pid: unknown) => !projectId || pid === projectId
  const users = of('users').map((u) => ({ id: u.id, name: String(u.data.name ?? '') }))
  const sprints = of('sprints')
    .filter((s) => s.data.state !== 'closed' && inScope(s.data.projectId))
    .map((s) => ({ id: s.id, name: String(s.data.name ?? ''), state: String(s.data.state ?? ''), startDate: (s.data.startDate as string | null) ?? null, endDate: (s.data.endDate as string | null) ?? null }))
  const openIssues = of('issues')
    .filter((i) => inScope(i.data.projectId) && !doneStatuses.has(String(i.data.statusId)) && i.data.type !== 'subtask')
    .slice(0, 500)
    .map((i) => String(i.data.summary ?? ''))
  return { users, sprints, openIssues, projects: projects.map((p) => ({ id: p.id, name: String(p.data.name ?? '') })) }
}

async function memberIdOf(clerkId: string) {
  const { rows } = await pool().query<{ id: string }>(
    `select id from sb_records where workspace_id = $1 and collection = 'users' and not deleted and data->>'clerkId' = $2 limit 1`,
    [WORKSPACE_ID, clerkId],
  )
  if (!rows[0]) throw new HttpError(409, 'Open the workspace once so your member profile exists, then try again')
  return rows[0].id
}

/** /api/meetings — POST a transcript to create a meeting; GET ?transcript=<meetingId> streams it back. */
export async function meetingsApi(req: Request) {
  const { userId } = await requireUser(req)
  await ensureSchema()
  const url = new URL(req.url)

  if (req.method === 'GET') {
    const id = url.searchParams.get('transcript') ?? ''
    const { rows } = await pool().query<{ path: string }>(
      `select data->>'transcriptPath' as path from sb_records where workspace_id = $1 and collection = 'meetings' and id = $2`,
      [WORKSPACE_ID, id],
    )
    const path = rows[0]?.path
    if (!path || !path.startsWith(`${WORKSPACE_ID}/meetings/`)) throw new HttpError(404, 'Transcript not found')
    const file = await get(path, { access: 'private' })
    if (!file || file.statusCode !== 200) throw new HttpError(404, 'Transcript not found')
    return new Response(file.stream, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } })
  }

  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed')
  const body = ((await req.json().catch(() => null)) ?? {}) as MeetingInput
  const meeting = await createMeeting(body, userId, await memberIdOf(userId))
  return json({ meeting }, 201)
}

export interface MeetingInput {
  title?: unknown
  date?: unknown
  projectId?: unknown
  transcript?: unknown
  fileName?: unknown
}

/** Stores the transcript, builds the notes and suggested tasks, and saves the meeting. Used by the app and by agents. */
export async function createMeeting(body: MeetingInput, userId: string, memberId: string) {
  await ensureSchema()
  const transcript = (typeof body.transcript === 'string' ? body.transcript : '').replace(/^\uFEFF/, '').trim()
  if (transcript.length < 20) throw new HttpError(400, 'That’s too short to summarize — paste or upload the full transcript')
  if (transcript.length > MAX_TRANSCRIPT_CHARS) throw new HttpError(413, `Transcripts can be up to ${MAX_TRANSCRIPT_CHARS / 1000}k characters (about 6 hours of talk)`)
  const date = typeof body.date === 'string' && !Number.isNaN(Date.parse(body.date)) ? new Date(body.date).toISOString() : new Date().toISOString()
  const ctx = await workspaceContext(typeof body.projectId === 'string' ? body.projectId : null)
  const projectId = typeof body.projectId === 'string' && ctx.projects.some((p) => p.id === body.projectId) ? body.projectId : null
  const givenTitle = typeof body.title === 'string' ? body.title.trim().slice(0, 200) : ''
  const notes = buildNotes(transcript, { title: givenTitle, team: ctx.users, sprints: ctx.sprints, openIssues: ctx.openIssues, maxTasks: MAX_SUGGESTIONS })
  if (!notes.summary) throw new HttpError(400, 'Couldn’t find any speech in that file — is it a transcript?')

  const id = 'mt' + randomBytes(6).toString('hex')
  const fileName = (typeof body.fileName === 'string' && body.fileName ? body.fileName : 'transcript.txt').replace(/[^\w.\- ]+/g, '_').slice(0, 120)
  const blob = await put(`${WORKSPACE_ID}/meetings/${id}-${fileName}`, transcript, { access: 'private', addRandomSuffix: true, contentType: 'text/plain; charset=utf-8' })
  const sprintIds = new Set(ctx.sprints.map((s) => s.id))
  const meeting = {
    id,
    title: notes.title.slice(0, 200),
    date,
    projectId,
    createdById: memberId,
    createdAt: new Date().toISOString(),
    transcriptPath: blob.pathname,
    transcriptName: fileName,
    transcriptChars: transcript.length,
    summary: notes.summary,
    keyPoints: notes.keyPoints.slice(0, 30),
    decisions: notes.decisions.slice(0, 30),
    openQuestions: notes.openQuestions.slice(0, 30),
    attendees: notes.attendees.slice(0, 40),
    suggestions: notes.tasks.map((t, n) => ({
      ...t,
      id: `${id}-s${n + 1}`,
      summary: t.summary.slice(0, 255),
      sprintId: t.sprintId && sprintIds.has(t.sprintId) ? t.sprintId : null,
      issueId: null,
      dismissed: false,
    })),
  }
  await applyOps([{ c: 'meetings', id, op: 'put', d: meeting }], userId)
  return meeting
}
