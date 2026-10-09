import { create } from 'zustand'
import { authedFetch } from '@/sync/engine'

/** Your personal agent tokens for the skatebored MCP server (server: server/agents.ts). */
export interface McpAgent {
  id: string
  name: string
  tokenHint: string
  currentIssueId: string | null
  createdAt: string
  lastUsedAt: string | null
}

export const MCP_URL = `${window.location.origin}/api/mcp`

const send = async (method: string, body?: unknown) =>
  (await authedFetch('/api/agents', { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })).json()

interface AgentsState {
  agents: McpAgent[]
  loaded: boolean
  error: string | null
  load: () => Promise<void>
  create: (name: string) => Promise<string>
  setTask: (id: string, issueId: string | null) => Promise<void>
  revoke: (id: string) => Promise<void>
}

export const useMcpAgents = create<AgentsState>((set, get) => {
  const replace = (a: McpAgent) => set({ agents: get().agents.map((x) => (x.id === a.id ? a : x)) })
  return {
    agents: [],
    loaded: false,
    error: null,
    load: async () => {
      try {
        const { agents } = (await send('GET')) as { agents: McpAgent[] }
        set({ agents, loaded: true, error: null })
      } catch (e) {
        set({ loaded: true, error: (e as Error).message })
      }
    },
    create: async (name) => {
      const { agent, token } = (await send('POST', { name })) as { agent: McpAgent; token: string }
      set({ agents: [...get().agents, agent] })
      return token
    },
    setTask: async (id, issueId) => replace(((await send('PATCH', { id, currentIssueId: issueId })) as { agent: McpAgent }).agent),
    revoke: async (id) => {
      await send('DELETE', { id })
      set({ agents: get().agents.filter((a) => a.id !== id) })
    },
  }
})

export function setupSnippets(token: string) {
  return {
    claude: `claude mcp add --transport http skatebored ${MCP_URL} --header "Authorization: Bearer ${token}"`,
    json: JSON.stringify({ mcpServers: { skatebored: { url: MCP_URL, headers: { Authorization: `Bearer ${token}` } } } }, null, 2),
    vscode: JSON.stringify({ servers: { skatebored: { type: 'http', url: MCP_URL, headers: { Authorization: `Bearer ${token}` } } } }, null, 2),
  }
}
