import { handle } from '../server/auth.js'
import { mcp } from '../server/mcp.js'

/** /api/mcp — MCP server for coding agents (Streamable HTTP, agent-token auth). */
export const POST = (req: Request) => handle(() => mcp(req))
export const GET = (req: Request) => handle(() => mcp(req))
export const DELETE = (req: Request) => handle(() => mcp(req))
