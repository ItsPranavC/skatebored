import { get, put } from '@vercel/blob'
import { HttpError, json, requireUser } from './auth.js'
import { WORKSPACE_ID } from './db.js'

/** Vercel Functions accept request bodies up to 4.5 MB. */
export const MAX_UPLOAD_BYTES = 4_000_000

const safeName = (n: string) => n.replace(/[^\w.\- ]+/g, '_').slice(0, 120) || 'file'

/** Stores an attachment in the private Blob store; returns its pathname. */
export async function upload(req: Request) {
  const { userId } = await requireUser(req)
  const url = new URL(req.url)
  const name = safeName(url.searchParams.get('name') ?? 'file')
  const type = req.headers.get('content-type') || 'application/octet-stream'
  const len = Number(req.headers.get('content-length') ?? 0)
  if (len > MAX_UPLOAD_BYTES) throw new HttpError(413, 'Attachments can be up to 4 MB')
  const body = await req.arrayBuffer()
  if (body.byteLength > MAX_UPLOAD_BYTES) throw new HttpError(413, 'Attachments can be up to 4 MB')
  const blob = await put(`${WORKSPACE_ID}/attachments/${name}`, body, { access: 'private', addRandomSuffix: true, contentType: type })
  return json({ pathname: blob.pathname, size: body.byteLength, contentType: type, uploadedBy: userId })
}

/** Streams a private attachment to a signed-in teammate. */
export async function download(req: Request) {
  await requireUser(req)
  const p = new URL(req.url).searchParams.get('p') ?? ''
  if (!p.startsWith(`${WORKSPACE_ID}/attachments/`) || p.includes('..')) throw new HttpError(400, 'Invalid attachment path')
  const file = await get(p, { access: 'private' })
  if (!file || file.statusCode !== 200) throw new HttpError(404, 'Attachment not found')
  // No content-length: Blob's metadata can report 0 for private files, which would truncate the body.
  // no-store: a signed-out browser must not be able to read files back from its HTTP cache.
  return new Response(file.stream, {
    headers: {
      'content-type': file.blob.contentType || 'application/octet-stream',
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  })
}
