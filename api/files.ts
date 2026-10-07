import { handle } from '../server/auth.js'
import { download, upload } from '../server/files.js'

/** POST /api/files?name=… uploads an attachment; GET /api/files?p=… streams it back. */
export const GET = (req: Request) => handle(() => download(req))
export const POST = (req: Request) => handle(() => upload(req))
