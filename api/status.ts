import { handle } from '../server/auth.js'
import { status } from '../server/sync.js'

/** GET /api/status — record counts per collection (signed-in only). */
export const GET = (req: Request) => handle(() => status(req))
