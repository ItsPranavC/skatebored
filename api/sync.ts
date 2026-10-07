import { handle } from '../server/auth.js'
import { pull, push } from '../server/sync.js'

/** GET /api/sync?since=N — records changed after version N. POST — apply a batch of changes. */
export const GET = (req: Request) => handle(() => pull(req))
export const POST = (req: Request) => handle(() => push(req))
