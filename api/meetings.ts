import { handle } from '../server/auth.js'
import { meetingsApi } from '../server/meetings.js'

/** /api/meetings — upload a transcript to get meeting notes and suggested tasks; read a transcript back. */
export const GET = (req: Request) => handle(() => meetingsApi(req))
export const POST = (req: Request) => handle(() => meetingsApi(req))
