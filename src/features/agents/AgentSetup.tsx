import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Tabs } from '@/components/ui/primitives'
import { setupSnippets } from './mcpAgents'

/** Copy-ready MCP config for a freshly created agent token (Agents page + onboarding). */
function CopyBlock({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false)
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-lg border border-line bg-canvas p-3 pr-12 text-[12px] leading-relaxed whitespace-pre-wrap break-all">{text}</pre>
      <button
        onClick={async () => {
          await navigator.clipboard.writeText(text).catch(() => {})
          setDone(true)
          setTimeout(() => setDone(false), 1500)
        }}
        className="absolute top-2 right-2 grid size-8 place-items-center rounded-md text-muted hover:bg-hover hover:text-fg"
        aria-label={`Copy ${label}`}
      >
        {done ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
      </button>
    </div>
  )
}

export function AgentSetup({ token }: { token: string }) {
  const [tab, setTab] = useState<'claude' | 'json' | 'vscode'>('claude')
  const s = setupSnippets(token)
  return (
    <div className="space-y-3">
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'claude', label: 'Claude Code' },
          { id: 'json', label: 'Cursor / JSON' },
          { id: 'vscode', label: 'VS Code' },
        ]}
      />
      {tab === 'claude' && (
        <>
          <p className="text-[13px] text-muted">Run this once in a terminal:</p>
          <CopyBlock text={s.claude} label="Claude Code command" />
        </>
      )}
      {tab === 'json' && (
        <>
          <p className="text-[13px] text-muted">
            Add to <code>~/.cursor/mcp.json</code> (or any client that takes an <code>mcpServers</code> config):
          </p>
          <CopyBlock text={s.json} label="MCP JSON config" />
        </>
      )}
      {tab === 'vscode' && (
        <>
          <p className="text-[13px] text-muted">
            Add to <code>.vscode/mcp.json</code> in your project:
          </p>
          <CopyBlock text={s.vscode} label="VS Code config" />
        </>
      )}
      <p className="text-[12px] text-subtle">
        Then tell the agent: <span className="text-fg">“Work on my current skatebored task.”</span>
      </p>
    </div>
  )
}
