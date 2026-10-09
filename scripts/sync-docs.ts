/**
 * Mirrors the Google Drive knowledge base (DRIVE_FOLDER_ID) into the database now,
 * instead of waiting for the next agent connection to trigger it.
 *
 *   npm run docs:sync            # only changed files
 *   npm run docs:sync -- --force # re-read everything
 */
import { readFileSync, existsSync } from 'node:fs'

for (const f of ['.env.local', '.env.development.local']) {
  if (!existsSync(f)) continue
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]!.replace(/^"|"$/g, '')
  }
}
const { syncDocs, docStats } = await import('../server/docs.ts')
const { pool } = await import('../server/db.ts')
const t = Date.now()
try {
  const r = await syncDocs({ force: process.argv.includes('--force') })
  if (r.skipped) console.log(`Skipped: ${r.skipped}`)
  else console.log(`Synced in ${((Date.now() - t) / 1000).toFixed(1)}s: ${r.files} files, ${r.updated} read, ${r.removed} removed`)
  for (const f of r.failed) console.log(`  ✗ ${f.name}: ${f.error}`)
  const s = await docStats()
  console.log(`Knowledge base: ${s.files} files, ${(s.chars / 1000).toFixed(0)}k characters of text`)
} catch (e) {
  console.error((e as Error).message)
  process.exitCode = 1
} finally {
  await pool().end()
}
