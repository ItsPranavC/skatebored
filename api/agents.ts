import { handle } from '../server/auth.js'
import { agentsApi } from '../server/agents.js'

/** /api/agents — create, list, rename, hand a task to, and revoke your agent tokens. */
export const GET = (req: Request) => handle(() => agentsApi(req))
export const POST = (req: Request) => handle(() => agentsApi(req))
export const PATCH = (req: Request) => handle(() => agentsApi(req))
export const DELETE = (req: Request) => handle(() => agentsApi(req))
