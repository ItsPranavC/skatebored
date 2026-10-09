import { createSign } from 'node:crypto'

/**
 * Google service-account auth (JWT bearer flow) without an SDK. The key comes from
 * GOOGLE_SERVICE_ACCOUNT_JSON — the downloaded key file's contents, as one string.
 */

interface ServiceAccount {
  client_email: string
  private_key: string
  token_uri?: string
}

function serviceAccount(): ServiceAccount {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not set')
  const sa = JSON.parse(raw) as ServiceAccount
  if (!sa.client_email || !sa.private_key) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not a service account key')
  return sa
}

export const serviceAccountEmail = () => serviceAccount().client_email

const b64url = (v: string | Buffer) => Buffer.from(v).toString('base64url')

let cached: { token: string; exp: number; scope: string } | null = null

export async function googleToken(scope = 'https://www.googleapis.com/auth/drive.readonly') {
  if (cached && cached.scope === scope && cached.exp - 60_000 > Date.now()) return cached.token
  const sa = serviceAccount()
  const aud = sa.token_uri ?? 'https://oauth2.googleapis.com/token'
  const now = Math.floor(Date.now() / 1000)
  const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify({ iss: sa.client_email, scope, aud, iat: now, exp: now + 3600 }))}`
  const sig = createSign('RSA-SHA256').update(unsigned).sign(sa.private_key)
  const res = await fetch(aud, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${b64url(sig)}` }),
  })
  const body = (await res.json()) as { access_token?: string; expires_in?: number; error_description?: string }
  if (!res.ok || !body.access_token) throw new Error(`Google auth failed: ${body.error_description ?? res.status}`)
  cached = { token: body.access_token, exp: Date.now() + (body.expires_in ?? 3600) * 1000, scope }
  return cached.token
}

/** GET a Google API URL with the service account's token. */
export async function googleFetch(url: string) {
  const res = await fetch(url, { headers: { authorization: `Bearer ${await googleToken()}` } })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    const err = new Error(`Google API ${res.status}: ${text.slice(0, 300)}`) as Error & { status: number }
    err.status = res.status
    throw err
  }
  return res
}
