import { createClerkClient, verifyToken } from '@clerk/backend'

export class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } })
}

/** Turns thrown errors into JSON responses; unexpected errors are logged, not leaked. */
export async function handle(fn: () => Promise<Response>) {
  try {
    return await fn()
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status)
    console.error('[api] unhandled', e)
    return json({ error: 'Internal error' }, 500)
  }
}

const list = (v: string | undefined) => (v ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)

/** Origins allowed to have minted the session token (Clerk's `azp` claim). */
function authorizedParties(req: Request) {
  const own = new URL(req.url).origin
  const extra = list(process.env.APP_ORIGINS)
  const vercel = [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL].filter(Boolean).map((h) => `https://${h}`)
  return [own, ...extra, ...vercel]
}

const emailCache = new Map<string, { email: string; at: number }>()

async function emailOf(userId: string, secretKey: string) {
  const hit = emailCache.get(userId)
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.email
  const user = await createClerkClient({ secretKey }).users.getUser(userId)
  const email = (user.primaryEmailAddress?.emailAddress ?? '').toLowerCase()
  emailCache.set(userId, { email, at: Date.now() })
  return email
}

/**
 * Verifies the Clerk session token sent as `Authorization: Bearer …` and, when
 * ALLOWED_EMAILS / ALLOWED_EMAIL_DOMAINS are configured, that the person is allowed in.
 */
export async function requireUser(req: Request): Promise<{ userId: string }> {
  const secretKey = process.env.CLERK_SECRET_KEY
  if (!secretKey) throw new HttpError(500, 'CLERK_SECRET_KEY is not configured on the server')
  const header = req.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) throw new HttpError(401, 'Sign in required')
  let sub: string | undefined
  try {
    // Throws if the signature, expiry or issuer is wrong.
    const claims = (await verifyToken(token, { secretKey })) as { sub?: string; azp?: string }
    // Browser sessions carry the origin they were issued to; it must be one of ours.
    // (Tokens minted server-side with the secret key have no azp.)
    const azpOk = !claims.azp || authorizedParties(req).includes(claims.azp)
    sub = azpOk ? claims.sub : undefined
  } catch {
    sub = undefined
  }
  if (!sub) throw new HttpError(401, 'Session expired or invalid — sign in again')

  const emails = list(process.env.ALLOWED_EMAILS)
  const domains = list(process.env.ALLOWED_EMAIL_DOMAINS)
  if (emails.length || domains.length) {
    const email = await emailOf(sub, secretKey)
    const domain = email.split('@')[1] ?? ''
    if (!emails.includes(email) && !domains.includes(domain)) throw new HttpError(403, `${email || 'This account'} isn’t allowed in this workspace`)
  }
  return { userId: sub }
}
