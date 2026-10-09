import { ensureSchema, pool, WORKSPACE_ID } from './db.js'
import { googleFetch } from './google.js'

/**
 * Team knowledge base: a Google Drive folder mirrored into Postgres (sb_docs) as text,
 * searchable with Postgres full-text search, served to agents by the MCP server.
 * The sync is incremental (only files whose modifiedTime changed are re-read) and runs
 * lazily: whenever an agent connects and the copy is older than STALE_MS.
 */

const DRIVE = 'https://www.googleapis.com/drive/v3'
const G = 'application/vnd.google-apps.'
const STALE_MS = 10 * 60_000
const MAX_FILE_BYTES = 15_000_000
const MAX_CHARS = 1_500_000

/**
 * Never mirrored, so agents can never read them: folders listed in DRIVE_EXCLUDE
 * (comma-separated path prefixes, default "Sensitive/"), plus anything whose name
 * looks like it holds credentials.
 */
const SECRET_NAME = /pass(word|wd)|secret|credential|api[ _-]?key|token|\beids?\b|ssn/i
const excludes = () =>
  (process.env.DRIVE_EXCLUDE ?? 'Sensitive/')
    .split(',')
    .map((s) => s.trim().toLowerCase().replace(/\s*\/\s*/g, '/'))
    .filter(Boolean)
export function excluded(path: string) {
  const norm = path.toLowerCase().replace(/\s*\/\s*/g, '/')
  return excludes().some((x) => norm.startsWith(x) || norm.includes(`/${x}`)) || SECRET_NAME.test(path)
}

export const docsConfigured = () => !!(process.env.GOOGLE_SERVICE_ACCOUNT_JSON && process.env.DRIVE_FOLDER_ID)

interface DriveFile {
  id: string
  name: string
  mimeType: string
  modifiedTime: string
  size?: string
  webViewLink?: string
  shortcutDetails?: { targetId: string; targetMimeType: string }
}

async function listFolder(folderId: string): Promise<(DriveFile & { path: string })[]> {
  const out: (DriveFile & { path: string })[] = []
  const seen = new Set<string>()
  const walk = async (id: string, path: string) => {
    if (seen.has(id)) return
    seen.add(id)
    let page = ''
    do {
      const q = encodeURIComponent(`'${id}' in parents and trashed = false`)
      const fields = encodeURIComponent('nextPageToken,files(id,name,mimeType,modifiedTime,size,webViewLink,shortcutDetails)')
      const r = (await (
        await googleFetch(`${DRIVE}/files?q=${q}&fields=${fields}&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true${page ? `&pageToken=${page}` : ''}`)
      ).json()) as { files: DriveFile[]; nextPageToken?: string }
      for (const f of r.files) {
        if (excluded(`${path}${f.name}${f.mimeType === `${G}folder` ? '/' : ''}`)) continue
        if (f.mimeType === `${G}folder`) await walk(f.id, `${path}${f.name}/`)
        else if (f.mimeType === `${G}shortcut` && f.shortcutDetails?.targetMimeType === `${G}folder`) await walk(f.shortcutDetails.targetId, `${path}${f.name}/`)
        else out.push({ ...f, path: `${path}${f.name}` })
      }
      page = r.nextPageToken ?? ''
    } while (page)
  }
  await walk(folderId, '')
  return out
}

const exportAs = async (id: string, mime: string) => (await googleFetch(`${DRIVE}/files/${id}/export?mimeType=${encodeURIComponent(mime)}`)).text()
const download = async (id: string) => Buffer.from(await (await googleFetch(`${DRIVE}/files/${id}?alt=media&supportsAllDrives=true`)).arrayBuffer())

const TEXT_TYPES = /^(text\/|application\/(json|xml|x-yaml|yaml|javascript|x-sh|csv))/
const TEXT_EXT = /\.(md|markdown|txt|csv|tsv|json|ya?ml|xml|html?|js|ts|tsx|py|sql|sh)$/i

/** Turns one Drive file into text. Returns a note instead when it can't be read as text. */
async function extract(f: DriveFile): Promise<{ content: string; note: string | null }> {
  const size = Number(f.size ?? 0)
  switch (f.mimeType) {
    case `${G}document`:
      try {
        return { content: await exportAs(f.id, 'text/markdown'), note: null }
      } catch {
        return { content: await exportAs(f.id, 'text/plain'), note: null }
      }
    case `${G}spreadsheet`:
      return { content: await exportAs(f.id, 'text/csv'), note: 'Spreadsheet: first sheet only, as CSV' }
    case `${G}presentation`:
      return { content: await exportAs(f.id, 'text/plain'), note: 'Slides: text only' }
  }
  if (f.mimeType.startsWith(G)) return { content: '', note: `Google ${f.mimeType.slice(G.length)} — open the link to view` }
  if (size > MAX_FILE_BYTES) return { content: '', note: `Too large to index (${Math.round(size / 1e6)} MB) — open the link` }
  if (f.mimeType === 'application/pdf') {
    const { extractText, getDocumentProxy } = await import('unpdf')
    const pdf = await getDocumentProxy(new Uint8Array(await download(f.id)))
    const { text } = await extractText(pdf, { mergePages: true })
    return { content: text, note: text.trim() ? null : 'PDF has no text layer (scanned?) — open the link' }
  }
  if (f.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const mammoth = await import('mammoth')
    const { value } = await mammoth.extractRawText({ buffer: await download(f.id) })
    return { content: value, note: null }
  }
  if (TEXT_TYPES.test(f.mimeType) || TEXT_EXT.test(f.name)) return { content: (await download(f.id)).toString('utf8'), note: null }
  return { content: '', note: `${f.mimeType} — not indexed as text; open the link` }
}

/** Runs `fn` over items with at most `n` in flight. */
async function pooled<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  let i = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]!)
  }))
}

export interface SyncResult {
  skipped?: string
  files: number
  updated: number
  removed: number
  failed: { name: string; error: string }[]
}

/** Mirrors the folder into sb_docs. Only one sync runs at a time per workspace. */
export async function syncDocs(opts: { force?: boolean } = {}): Promise<SyncResult> {
  if (!docsConfigured()) return { skipped: 'not configured', files: 0, updated: 0, removed: 0, failed: [] }
  await ensureSchema()
  const folderId = process.env.DRIVE_FOLDER_ID!
  const db = pool()
  // Claim the sync (a crashed run is considered dead after 10 minutes).
  const claim = await db.query(
    `insert into sb_doc_syncs (workspace_id, folder_id, started_at) values ($1, $2, now())
     on conflict (workspace_id) do update set started_at = now(), folder_id = excluded.folder_id
     where sb_doc_syncs.started_at is null or sb_doc_syncs.finished_at >= sb_doc_syncs.started_at
        or sb_doc_syncs.started_at < now() - interval '10 minutes' ${opts.force ? 'or true' : ''}
     returning 1`,
    [WORKSPACE_ID, folderId],
  )
  if (!claim.rowCount) return { skipped: 'already running', files: 0, updated: 0, removed: 0, failed: [] }

  try {
    const files = await listFolder(folderId)
    const existing = new Map(
      (await db.query<{ id: string; modified_at: Date | null; deleted: boolean; path: string }>(`select id, modified_at, deleted, path from sb_docs where workspace_id = $1`, [WORKSPACE_ID])).rows.map((r) => [r.id, r]),
    )
    const changed = files.filter((f) => {
      const e = existing.get(f.id)
      return opts.force || !e || e.deleted || e.path !== f.path || e.modified_at?.toISOString() !== new Date(f.modifiedTime).toISOString()
    })
    const failed: SyncResult['failed'] = []
    await pooled(changed, 4, async (f) => {
      let content = ''
      let note: string | null = null
      try {
        ;({ content, note } = await extract(f))
      } catch (e) {
        note = `Couldn’t read this file: ${(e as Error).message.slice(0, 200)}`
        failed.push({ name: f.path, error: (e as Error).message.slice(0, 200) })
      }
      content = content.replace(/\u0000/g, '').slice(0, MAX_CHARS)
      await db.query(
        `insert into sb_docs (workspace_id, id, name, path, mime, url, modified_at, content, chars, note, deleted, synced_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, false, now())
         on conflict (workspace_id, id) do update set name = excluded.name, path = excluded.path, mime = excluded.mime, url = excluded.url,
           modified_at = excluded.modified_at, content = excluded.content, chars = excluded.chars, note = excluded.note, deleted = false, synced_at = now()`,
        [WORKSPACE_ID, f.id, f.name, f.path, f.mimeType, f.webViewLink ?? `https://drive.google.com/file/d/${f.id}/view`, f.modifiedTime, content, content.length, note],
      )
    })
    // Purge (not soft-delete) anything that's now excluded, so no copy of it stays in the database.
    const purge = [...existing.values()].filter((e) => excluded(e.path)).map((e) => e.id)
    if (purge.length) await db.query(`delete from sb_docs where workspace_id = $1 and id = any($2::text[])`, [WORKSPACE_ID, purge])
    for (const id of purge) existing.delete(id)
    const live = new Set(files.map((f) => f.id))
    const gone = [...existing.values()].filter((e) => !e.deleted && !live.has(e.id)).map((e) => e.id)
    if (gone.length) await db.query(`update sb_docs set deleted = true, synced_at = now() where workspace_id = $1 and id = any($2::text[])`, [WORKSPACE_ID, gone])
    await db.query(`update sb_doc_syncs set finished_at = now(), error = null, files = $2 where workspace_id = $1`, [WORKSPACE_ID, files.length])
    return { files: files.length, updated: changed.length, removed: gone.length, failed }
  } catch (e) {
    await db.query(`update sb_doc_syncs set finished_at = now(), error = $2 where workspace_id = $1`, [WORKSPACE_ID, (e as Error).message.slice(0, 500)])
    throw e
  }
}

export async function syncState() {
  await ensureSchema()
  const { rows } = await pool().query<{ finished_at: Date | null; started_at: Date | null; error: string | null; files: number }>(
    `select started_at, finished_at, error, files from sb_doc_syncs where workspace_id = $1`,
    [WORKSPACE_ID],
  )
  return rows[0] ?? null
}

/**
 * Keeps the mirror fresh. The very first sync is awaited (agents need the docs);
 * after that, a stale copy is served while a background sync refreshes it.
 */
export async function ensureFreshDocs(background: (p: Promise<unknown>) => void) {
  if (!docsConfigured()) return
  const s = await syncState()
  const run = () => syncDocs().catch((e) => console.error('[docs] sync failed', e))
  // Never synced, or the last attempt failed (e.g. folder not shared yet): try now.
  if (!s?.finished_at || s.error) await run()
  else if (Date.now() - s.finished_at.getTime() > STALE_MS) background(run())
}

// ───────────────────────────── reads ─────────────────────────────

export interface DocRow {
  id: string
  name: string
  path: string
  mime: string
  url: string
  modified_at: Date | null
  chars: number
  note: string | null
}

const kind = (mime: string) =>
  mime === `${G}document` ? 'Doc' : mime === `${G}spreadsheet` ? 'Sheet' : mime === `${G}presentation` ? 'Slides' : mime === 'application/pdf' ? 'PDF' : mime.split('/').pop()!

export const docLine = (d: DocRow) =>
  `- ${d.path} (${kind(d.mime)}, ${d.chars ? `${Math.round(d.chars / 100) / 10}k chars` : 'no text'}${d.modified_at ? `, edited ${d.modified_at.toISOString().slice(0, 10)}` : ''}) · id: ${d.id}${d.note ? ` · ${d.note}` : ''}`

export async function listDocs(prefix?: string) {
  await ensureSchema()
  const { rows } = await pool().query<DocRow>(
    `select id, name, path, mime, url, modified_at, chars, note from sb_docs
     where workspace_id = $1 and not deleted and ($2::text is null or path ilike $2 || '%') order by path`,
    [WORKSPACE_ID, prefix ?? null],
  )
  return rows
}

export async function searchDocs(query: string, limit = 8) {
  await ensureSchema()
  const { rows } = await pool().query<DocRow & { rank: number; snippet: string }>(
    `with q as (select websearch_to_tsquery('english', $2) as q)
     select id, name, path, mime, url, modified_at, chars, note, ts_rank_cd(tsv, q.q) as rank,
       ts_headline('english', left(content, 200000), q.q, 'MaxFragments=3, MaxWords=35, MinWords=12, FragmentDelimiter= … , StartSel=**, StopSel=**') as snippet
     from sb_docs, q where workspace_id = $1 and not deleted and tsv @@ q.q
     order by rank desc limit $3`,
    [WORKSPACE_ID, query, limit],
  )
  if (rows.length) return rows
  // No full-text hit (e.g. a code, an acronym): fall back to a plain substring match.
  const fb = await pool().query<DocRow & { rank: number; snippet: string }>(
    `select id, name, path, mime, url, modified_at, chars, note, 0 as rank,
       substr(content, greatest(1, strpos(lower(content), lower($2)) - 150), 400) as snippet
     from sb_docs where workspace_id = $1 and not deleted and (path ilike '%' || $2 || '%' or content ilike '%' || $2 || '%')
     order by (path ilike '%' || $2 || '%') desc, modified_at desc nulls last limit $3`,
    [WORKSPACE_ID, query, limit],
  )
  return fb.rows
}

/** A doc by Drive id, exact name/path, or best name match. */
export async function getDoc(ref: string) {
  await ensureSchema()
  const { rows } = await pool().query<DocRow & { content: string }>(
    `select id, name, path, mime, url, modified_at, chars, note, content from sb_docs
     where workspace_id = $1 and not deleted and (id = $2 or lower(path) = lower($2) or lower(name) = lower($2) or path ilike '%' || $2 || '%')
     order by (id = $2) desc, (lower(path) = lower($2)) desc, (lower(name) = lower($2)) desc, length(path) limit 1`,
    [WORKSPACE_ID, ref.trim()],
  )
  return rows[0] ?? null
}

export async function docStats() {
  await ensureSchema()
  const { rows } = await pool().query<{ n: string; chars: string | null }>(`select count(*) as n, sum(chars) as chars from sb_docs where workspace_id = $1 and not deleted`, [WORKSPACE_ID])
  return { files: Number(rows[0]?.n ?? 0), chars: Number(rows[0]?.chars ?? 0) }
}
