import { handle } from '../server/auth.js'
import { calendarApi } from '../server/calendar.js'

/** /api/calendar — connect Google Calendar (via Composio), read your events, add events, disconnect. */
export const GET = (req: Request) => handle(() => calendarApi(req))
export const POST = (req: Request) => handle(() => calendarApi(req))
export const DELETE = (req: Request) => handle(() => calendarApi(req))
