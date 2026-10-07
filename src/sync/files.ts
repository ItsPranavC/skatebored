import { useEffect, useState } from 'react'
import { authedFetch } from './engine'

/** Attachments live in the private Blob store; records hold `sbfile:<pathname>`. */
export const FILE_SCHEME = 'sbfile:'
export const MAX_ATTACHMENT_BYTES = 4_000_000

export async function uploadAttachment(file: File) {
  const res = await authedFetch(`/api/files?name=${encodeURIComponent(file.name)}`, {
    method: 'POST',
    headers: { 'content-type': file.type || 'application/octet-stream' },
    body: file,
  })
  const out = (await res.json()) as { pathname: string }
  return `${FILE_SCHEME}${out.pathname}`
}

const cache = new Map<string, Promise<string>>()

/** Resolves an attachment url to something an <img>/<a> can use (fetches private files with your session). */
export function useAttachmentUrl(url: string) {
  const [src, setSrc] = useState<string | null>(url.startsWith(FILE_SCHEME) ? null : url)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!url.startsWith(FILE_SCHEME)) {
      setSrc(url)
      return
    }
    let alive = true
    let p = cache.get(url)
    if (!p) {
      p = authedFetch(`/api/files?p=${encodeURIComponent(url.slice(FILE_SCHEME.length))}`)
        .then((r) => r.blob())
        .then((b) => URL.createObjectURL(b))
      p.catch(() => cache.delete(url))
      cache.set(url, p)
    }
    p.then((u) => alive && setSrc(u)).catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [url])
  return { src, failed }
}
