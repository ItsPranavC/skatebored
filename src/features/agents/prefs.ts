import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { DEFAULT_CONTEXT, type ContextOptions } from './context'

/** Per-browser preferences: which tool you use and where your clones live. */
interface AgentPrefs {
  lastAgentId: string
  /** projectId → absolute path of the local clone */
  localPaths: Record<string, string>
  context: ContextOptions
  setLastAgent: (id: string) => void
  setLocalPath: (projectId: string, path: string) => void
  setContext: (patch: Partial<ContextOptions>) => void
}

export const useAgentPrefs = create<AgentPrefs>()(
  persist(
    (set) => ({
      lastAgentId: 'claude-code',
      localPaths: {},
      context: DEFAULT_CONTEXT,
      setLastAgent: (lastAgentId) => set({ lastAgentId }),
      setLocalPath: (projectId, path) => set((s) => ({ localPaths: { ...s.localPaths, [projectId]: path.trim() } })),
      setContext: (patch) => set((s) => ({ context: { ...s.context, ...patch } })),
    }),
    { name: 'skatebored-agent-prefs', storage: createJSONStorage(() => localStorage) },
  ),
)

/** Which issue/agent the launch modal is showing (null = closed). */
interface LaunchState {
  issueId: string | null
  agentId: string | null
  open: (issueId: string, agentId?: string) => void
  close: () => void
}

export const useAgentLaunch = create<LaunchState>((set) => ({
  issueId: null,
  agentId: null,
  open: (issueId, agentId) => set({ issueId, agentId: agentId ?? useAgentPrefs.getState().lastAgentId }),
  close: () => set({ issueId: null, agentId: null }),
}))
