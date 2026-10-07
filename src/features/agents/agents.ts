/**
 * Coding agents a ticket can be handed to — modelled on Jira's "Open in coding tool"
 * (Development panel). Desktop tools open straight from a deep link with the prompt
 * pre-filled; terminal tools get a copy-ready command in a modal. Nothing is ever
 * sent automatically: every tool shows the prompt for review first.
 */

export type AgentKind = 'desktop' | 'terminal'

export interface LaunchTarget {
  /** GitHub owner/name slug, e.g. "skatebored/platform" */
  repo: string | null
  /** Absolute local path of the clone */
  path: string | null
}

export interface AgentDef {
  id: string
  name: string
  vendor: string
  kind: AgentKind
  blurb: string
  /** Max characters of prompt the launch channel accepts (after URL-encoding for links). */
  limit: number
  /** limit applies to the encoded URL, not the raw prompt */
  limitIsUrl?: boolean
  /** Without a repo/folder the tool opens somewhere unhelpful (e.g. your home folder). */
  needsFolder?: boolean
  deepLink?: (prompt: string, t: LaunchTarget) => string
  command?: (prompt: string, t: LaunchTarget) => string
  docs: string
  install: string
}

const enc = encodeURIComponent

/** POSIX single-quote escaping — safe for multi-line prompts in bash/zsh. */
export const shellQuote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`

const cd = (t: LaunchTarget) => (t.path ? `cd ${shellQuote(t.path)} && ` : '')

export const AGENTS: AgentDef[] = [
  {
    id: 'claude-code',
    needsFolder: true,
    name: 'Claude Code',
    vendor: 'Anthropic',
    kind: 'terminal',
    blurb: 'Opens a terminal session with the prompt typed in',
    limit: 5000,
    deepLink: (p, t) => {
      const params = [`q=${enc(p)}`]
      if (t.path) params.push(`cwd=${enc(t.path)}`)
      else if (t.repo) params.push(`repo=${enc(t.repo)}`)
      return `claude-cli://open?${params.join('&')}`
    },
    command: (p, t) => `${cd(t)}claude ${shellQuote(p)}`,
    docs: 'https://code.claude.com/docs/en/deep-links',
    install: 'npm install -g @anthropic-ai/claude-code',
  },
  {
    id: 'cursor',
    name: 'Cursor',
    vendor: 'Anysphere',
    kind: 'desktop',
    blurb: 'Opens Cursor’s agent with the prompt pre-filled',
    limit: 10000,
    limitIsUrl: true,
    deepLink: (p) => `cursor://anysphere.cursor-deeplink/prompt?text=${enc(p)}`,
    docs: 'https://cursor.com/docs/reference/deeplinks',
    install: 'https://cursor.com/download',
  },
  {
    id: 'codex',
    needsFolder: true,
    name: 'Codex',
    vendor: 'OpenAI',
    kind: 'desktop',
    blurb: 'Starts a new Codex thread in your workspace',
    limit: 16000,
    limitIsUrl: true,
    deepLink: (p, t) => {
      const params = [`prompt=${enc(p)}`]
      if (t.path) params.push(`path=${enc(t.path)}`)
      else if (t.repo) params.push(`originUrl=${enc(`https://github.com/${t.repo}.git`)}`)
      return `codex://new?${params.join('&')}`
    },
    command: (p, t) => `${cd(t)}codex ${shellQuote(p)}`,
    docs: 'https://learn.chatgpt.com/docs/reference/commands',
    install: 'https://openai.com/codex',
  },
  {
    id: 'github-copilot',
    name: 'GitHub Copilot',
    vendor: 'GitHub',
    kind: 'terminal',
    blurb: 'Runs the ticket through the Copilot CLI agent',
    limit: 100000,
    command: (p, t) => `${cd(t)}copilot -i ${shellQuote(p)}`,
    docs: 'https://docs.github.com/copilot/how-tos/use-copilot-agents/use-copilot-cli',
    install: 'npm install -g @github/copilot',
  },
  {
    id: 'vscode',
    needsFolder: true,
    name: 'VS Code',
    vendor: 'Microsoft',
    kind: 'desktop',
    blurb: 'Drafts a new agent session in VS Code',
    limit: 16000,
    limitIsUrl: true,
    deepLink: (p, t) => {
      const params = [`prompt=${enc(p)}`]
      if (t.path) params.push(`workspace=${enc(`file://${t.path}`)}`)
      return `vscode://agents/new?${params.join('&')}`
    },
    docs: 'https://code.visualstudio.com/docs/agents/run/agents-window',
    install: 'https://code.visualstudio.com/download',
  },
  {
    id: 'rovo-dev',
    name: 'Rovo Dev CLI',
    vendor: 'Atlassian',
    kind: 'terminal',
    blurb: 'Hands the ticket to Atlassian’s Rovo Dev agent',
    limit: 100000,
    command: (p, t) => `${cd(t)}acli rovodev run ${shellQuote(p)}`,
    docs: 'https://support.atlassian.com/rovo/docs/install-and-run-rovo-dev-cli-on-your-device/',
    install: 'https://developer.atlassian.com/cloud/acli/guides/install-acli/',
  },
  {
    id: 'gemini-cli',
    name: 'Gemini CLI',
    vendor: 'Google',
    kind: 'terminal',
    blurb: 'Starts an interactive Gemini session with the ticket',
    limit: 100000,
    command: (p, t) => `${cd(t)}gemini -i ${shellQuote(p)}`,
    docs: 'https://github.com/google-gemini/gemini-cli',
    install: 'npm install -g @google/gemini-cli',
  },
]

export const agentById = (id: string) => AGENTS.find((a) => a.id === id) ?? AGENTS[0]!

/** Size of the payload as the launch channel counts it. */
export function measure(agent: AgentDef, prompt: string, t: LaunchTarget) {
  if (agent.limitIsUrl && agent.deepLink) return agent.deepLink(prompt, t).length
  return prompt.length
}
