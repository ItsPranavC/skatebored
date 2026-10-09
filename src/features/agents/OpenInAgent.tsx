import { useEffect, useId, useMemo, useState } from 'react'
import { Bot, Check, ChevronDown, Copy, Download, ExternalLink, FileText, FolderOpen, GitBranch, Monitor, SquareTerminal, Wand2 } from 'lucide-react'
import type { Issue, Project } from '@/types'
import { useStore } from '@/store/store'
import { toast } from '@/store/ui'
import { cn, download } from '@/lib/utils'
import { Modal, Popover, Select, Tooltip } from '@/components/ui/overlay'
import { Button, Checkbox, Field, Input, Textarea } from '@/components/ui/primitives'
import { AGENTS, agentById, measure, type AgentDef, type LaunchTarget } from './agents'
import { AGENT_SVGS } from './icons'
import { branchName, buildIssueContext, fitPrompt } from './context'
import { useAgentLaunch, useAgentPrefs } from './prefs'
import { useMcpAgents } from './mcpAgents'
import { Link } from 'react-router-dom'

// ───────────────────────────── icon ─────────────────────────────

export function AgentIcon({ id, className }: { id: string; className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const svg = AGENT_SVGS[id] ?? ''
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={cn('size-4 shrink-0', className)}
      aria-hidden
      // Static, bundled brand marks — never user content.
      dangerouslySetInnerHTML={{ __html: svg.replaceAll('__ID__', uid) }}
    />
  )
}

// ───────────────────────────── launching ─────────────────────────────

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** Opens a custom-scheme URL; if the page never loses focus, the app probably isn't installed. */
function openDeepLink(url: string, agent: AgentDef) {
  let left = false
  const onBlur = () => (left = true)
  window.addEventListener('blur', onBlur, { once: true })
  // A real anchor click is the most reliable way to hand a custom scheme to the OS from Chrome/Safari.
  const a = document.createElement('a')
  a.href = url
  a.rel = 'noopener'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => {
    window.removeEventListener('blur', onBlur)
    if (!left && document.hasFocus())
      toast({
        title: `Didn’t open ${agent.name}?`,
        description: `Make sure ${agent.name} is installed${agent.id === 'claude-code' ? ' and you’ve run `claude` once so it registers its link handler' : ''}. The prompt is on your clipboard.`,
        action: { label: 'Setup guide', onClick: () => window.open(agent.docs, '_blank', 'noopener') },
      })
  }, 1600)
}

function useTarget(project: Project | undefined): LaunchTarget {
  const path = useAgentPrefs((s) => (project ? s.localPaths[project.id] : undefined))
  return { repo: project?.repo ?? null, path: path || null }
}

/** One-click launch: desktop tools open immediately, terminal tools open the modal (as in Jira). */
export function useLaunchAgent() {
  const openModal = useAgentLaunch((s) => s.open)
  const setLast = useAgentPrefs((s) => s.setLastAgent)
  return (issue: Issue, agentId: string) => {
    const agent = agentById(agentId)
    setLast(agent.id)
    if (!agent.deepLink) return openModal(issue.id, agent.id)
    const s = useStore.getState()
    const project = s.projects.find((p) => p.id === issue.projectId)
    const prefs = useAgentPrefs.getState()
    const target = { repo: project?.repo ?? null, path: (project && prefs.localPaths[project.id]) || null }
    // Ask where the code lives first, instead of dropping the agent into your home folder.
    if (agent.needsFolder && !target.repo && !target.path) return openModal(issue.id, agent.id)
    const fitted = fitPrompt(issue, s, prefs.context, agent, target)
    void copy(fitted.full)
    toast({
      title: `Opening ${issue.key} in ${agent.name}`,
      description: fitted.trimmed
        ? `Prompt trimmed to fit ${agent.name}’s link limit — the full context is on your clipboard.`
        : agent.kind === 'terminal'
          ? 'A new terminal window opens with the prompt typed in — press Enter to start. A copy is on your clipboard.'
          : 'Review the prompt, then send it. A copy is on your clipboard.',
      tone: 'success',
    })
    openDeepLink(agent.deepLink(fitted.prompt, target), agent)
  }
}

// ───────────────────────────── picker menu ─────────────────────────────

function AgentMenu({ issue, onPick, close }: { issue: Issue; onPick: (id: string) => void; close: () => void }) {
  const openModal = useAgentLaunch((s) => s.open)
  const context = useAgentPrefs((s) => s.context)
  const groups: [string, AgentDef[]][] = [
    ['Desktop apps', AGENTS.filter((a) => a.kind === 'desktop')],
    ['Terminal agents', AGENTS.filter((a) => a.kind === 'terminal')],
  ]
  return (
    <div className="py-1.5" role="menu">
      {groups.map(([label, list]) => (
        <div key={label}>
          <div className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-subtle uppercase">{label}</div>
          {list.map((a) => (
            <button
              key={a.id}
              role="menuitem"
              onClick={() => {
                close()
                onPick(a.id)
              }}
              className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-hover"
            >
              <span className="grid size-7 place-items-center rounded-lg border border-line bg-surface-3 text-fg">
                <AgentIcon id={a.id} className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium">{a.name}</span>
                <span className="block truncate text-[11px] text-subtle">{a.blurb}</span>
              </span>
              {a.kind === 'terminal' ? <SquareTerminal className="size-3.5 text-subtle" /> : <ExternalLink className="size-3.5 text-subtle" />}
            </button>
          ))}
        </div>
      ))}
      <div className="my-1.5 h-px bg-line" />
      <button
        onClick={() => {
          close()
          openModal(issue.id)
        }}
        className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] hover:bg-hover"
      >
        <Wand2 className="size-4 text-muted" /> Review &amp; edit prompt…
      </button>
      <button
        onClick={async () => {
          close()
          const ok = await copy(buildIssueContext(issue, useStore.getState(), context))
          toast({ title: ok ? `${issue.key} context copied as Markdown` : 'Clipboard blocked by the browser', tone: ok ? 'success' : 'error' })
        }}
        className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] hover:bg-hover"
      >
        <Copy className="size-4 text-muted" /> Copy context as Markdown
      </button>
      <button
        onClick={() => {
          close()
          download(`${issue.key}.md`, buildIssueContext(issue, useStore.getState(), context), 'text/markdown')
        }}
        className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] hover:bg-hover"
      >
        <Download className="size-4 text-muted" /> Download {issue.key}.md
      </button>
    </div>
  )
}

/** Split button: main half launches your last-used tool, chevron picks another. */
export function OpenInAgentButton({ issue, className }: { issue: Issue; className?: string }) {
  const lastId = useAgentPrefs((s) => s.lastAgentId)
  const launch = useLaunchAgent()
  const agent = agentById(lastId)
  return (
    <div className={cn('flex w-full items-stretch', className)}>
      <button
        onClick={() => launch(issue, agent.id)}
        className="flex h-9 min-w-0 flex-1 items-center gap-2.5 rounded-l-lg border border-line bg-surface-3 px-3 text-[13px] font-semibold transition hover:bg-active"
      >
        <AgentIcon id={agent.id} className="size-4" />
        <span className="truncate">Open in {agent.name}</span>
      </button>
      <Popover
        width={320}
        placement="bottom-end"
        trigger={
          <button className="grid h-9 w-9 place-items-center rounded-r-lg border border-l-0 border-line bg-surface-3 text-muted transition hover:bg-active hover:text-fg" aria-label="Choose coding tool">
            <ChevronDown className="size-4" />
          </button>
        }
      >
        {(close) => <AgentMenu issue={issue} close={close} onPick={(id) => launch(issue, id)} />}
      </Popover>
    </div>
  )
}

// ───────────────────────────── Development panel (issue view) ─────────────────────────────

export function DevelopmentPanel({ issue }: { issue: Issue }) {
  const [open, setOpen] = useState(true)
  const [copied, setCopied] = useState(false)
  const branch = branchName(issue)
  return (
    <div className="rounded-xl border border-line">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between rounded-t-xl px-4 py-3 text-left hover:bg-hover">
        <span className="text-[14px] font-semibold">Development</span>
        <ChevronDown className={cn('size-4 text-muted transition', !open && '-rotate-90')} />
      </button>
      {open && (
        <div className="space-y-3 border-t border-line px-4 py-3">
          <div>
            <div className="mb-1.5 text-xs font-semibold text-muted">Open in coding tool</div>
            <OpenInAgentButton issue={issue} />
            <p className="mt-1.5 text-[11px] leading-snug text-subtle">Hands the agent this ticket’s description, sub-tasks, links and discussion — nothing runs until you send it.</p>
          </div>
          <HandToAgent issue={issue} />
          <div>
            <div className="mb-1.5 text-xs font-semibold text-muted">Branch</div>
            <div className="flex items-center gap-1.5 rounded-lg border border-line bg-surface-2 py-1 pr-1 pl-2.5">
              <GitBranch className="size-3.5 shrink-0 text-subtle" />
              <code className="min-w-0 flex-1 truncate text-[12px]" title={branch}>
                {branch}
              </code>
              <Tooltip label={copied ? 'Copied' : 'Copy git checkout command'}>
                <button
                  onClick={async () => {
                    if (await copy(`git checkout -b ${branch}`)) {
                      setCopied(true)
                      setTimeout(() => setCopied(false), 1500)
                    }
                  }}
                  className="grid size-7 place-items-center rounded-md text-muted hover:bg-hover hover:text-fg"
                  aria-label="Copy git checkout command"
                >
                  {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
                </button>
              </Tooltip>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** Puts this issue in one of your MCP agents' "current task" slot. */
function HandToAgent({ issue }: { issue: Issue }) {
  const { agents, loaded, load, setTask } = useMcpAgents()
  useEffect(() => {
    if (!loaded) void load()
  }, [loaded, load])
  const holder = agents.find((a) => a.currentIssueId === issue.id)
  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold text-muted">Hand to agent</div>
      {loaded && !agents.length ? (
        <p className="text-[12px] text-subtle">
          <Link to="/agents" className="text-accent hover:underline">
            Connect an agent
          </Link>{' '}
          so it can pick this up over MCP with full context.
        </p>
      ) : (
        <>
          <Select
            value={holder?.id ?? null}
            placeholder="Choose one of your agents…"
            options={agents.map((a) => ({ value: a.id, label: a.name, icon: <Bot className="size-4" />, hint: a.currentIssueId && a.currentIssueId !== issue.id ? 'busy' : undefined }))}
            onChange={async (id) => {
              const a = agents.find((x) => x.id === id)!
              try {
                await setTask(id, issue.id)
                toast({ title: `${issue.key} handed to ${a.name}`, description: 'Tell it: “Work on my current skatebored task.”', tone: 'success' })
              } catch (e) {
                toast({ title: 'Couldn’t hand it over', description: (e as Error).message, tone: 'error' })
              }
            }}
          />
          <p className="mt-1.5 text-[11px] leading-snug text-subtle">{holder ? `${holder.name} is working on this.` : 'Becomes the agent’s current task in the skatebored MCP server.'}</p>
        </>
      )}
    </div>
  )
}

// ───────────────────────────── launch modal ─────────────────────────────

export function AgentLaunchHost() {
  const issueId = useAgentLaunch((s) => s.issueId)
  const issue = useStore((s) => (issueId ? s.issues.find((i) => i.id === issueId) : undefined))
  if (!issue) return null
  return <AgentLaunchModal issue={issue} />
}

function AgentLaunchModal({ issue }: { issue: Issue }) {
  const agentId = useAgentLaunch((s) => s.agentId)
  const close = useAgentLaunch((s) => s.close)
  const switchTo = useAgentLaunch((s) => s.open)
  const setLast = useAgentPrefs((s) => s.setLastAgent)
  const context = useAgentPrefs((s) => s.context)
  const setContext = useAgentPrefs((s) => s.setContext)
  const setLocalPath = useAgentPrefs((s) => s.setLocalPath)
  const project = useStore((s) => s.projects.find((p) => p.id === issue.projectId))
  const updateProject = useStore((s) => s.updateProject)
  // Re-render when related data changes so the preview stays live.
  const issues = useStore((s) => s.issues)
  const comments = useStore((s) => s.comments)
  const users = useStore((s) => s.users)
  const sprints = useStore((s) => s.sprints)
  const projects = useStore((s) => s.projects)
  const agent = agentById(agentId ?? 'claude-code')
  const target = useTarget(project)

  const fitted = useMemo(
    () => fitPrompt(issue, { issues, comments, users, sprints, projects }, context, agent, target),
    [issue, issues, comments, users, sprints, projects, context, agent, target.repo, target.path], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const [draft, setDraft] = useState<string | null>(null)
  useEffect(() => setDraft(null), [fitted.prompt])
  const prompt = draft ?? fitted.prompt
  const size = measure(agent, prompt, target)
  const over = size > agent.limit
  const [repoInput, setRepoInput] = useState(project?.repo ?? '')
  const [pathInput, setPathInput] = useState(target.path ?? '')
  const command = agent.command?.(prompt, target)
  const link = agent.deepLink?.(prompt, target)

  const copyAndToast = async (text: string, what: string) => {
    const ok = await copy(text)
    toast({ title: ok ? `${what} copied` : 'Clipboard blocked by the browser — select and copy manually', tone: ok ? 'success' : 'error' })
  }

  return (
    <Modal
      open
      onClose={close}
      width={880}
      title={
        <span className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-xl border border-line bg-surface-3">
            <AgentIcon id={agent.id} className="size-5" />
          </span>
          <span>
            Open {issue.key} in {agent.name}
            <span className="block text-[12px] font-normal tracking-normal text-muted">
              {agent.kind === 'terminal' ? 'Terminal agent' : 'Desktop app'} · {agent.vendor} · the prompt is pre-filled, nothing runs until you send it
            </span>
          </span>
        </span>
      }
      footer={
        <>
          <Button variant="ghost" icon={<Download className="size-4" />} onClick={() => download(`${issue.key}.md`, fitted.full, 'text/markdown')}>
            {issue.key}.md
          </Button>
          <div className="flex-1" />
          <Button onClick={() => copyAndToast(prompt, 'Prompt')} icon={<Copy className="size-4" />}>
            Copy prompt
          </Button>
          {command && (
            <Button variant={link ? 'default' : 'primary'} onClick={() => copyAndToast(command, 'Command')} icon={<SquareTerminal className="size-4" />}>
              Copy command
            </Button>
          )}
          {link && (
            <Button
              variant="primary"
              disabled={over}
              icon={<AgentIcon id={agent.id} className="size-4" />}
              onClick={() => {
                setLast(agent.id)
                void copy(prompt)
                openDeepLink(link, agent)
              }}
            >
              {agent.kind === 'terminal' ? 'Open in terminal' : `Open in ${agent.name}`}
            </Button>
          )}
        </>
      }
    >
      {/* tool switcher */}
      <div className="-mx-1 mb-4 flex flex-wrap gap-1.5" role="tablist" aria-label="Coding tool">
        {AGENTS.map((a) => (
          <button
            key={a.id}
            role="tab"
            aria-selected={a.id === agent.id}
            onClick={() => switchTo(issue.id, a.id)}
            className={cn(
              'flex h-8 items-center gap-2 rounded-full border px-3 text-[12.5px] font-medium transition',
              a.id === agent.id ? 'border-accent bg-accent-soft text-fg' : 'border-line text-muted hover:bg-hover hover:text-fg',
            )}
          >
            <AgentIcon id={a.id} className="size-3.5" />
            {a.name}
          </button>
        ))}
      </div>

      {agent.needsFolder && !target.repo && !target.path && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-warn/40 bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] p-3 text-[13px]">
          <FolderOpen className="mt-0.5 size-4 shrink-0 text-warn" />
          <div>
            <div className="font-semibold">Where’s the code for {project?.name}?</div>
            <div className="text-muted">
              Set the GitHub repository or your local folder on the right so {agent.name} opens in the project — otherwise it starts in your home folder. You only do this once.
            </div>
          </div>
        </div>
      )}
      <div className="grid gap-5 md:grid-cols-[1fr_260px]">
        <div className="min-w-0 space-y-3">
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-muted">
                <FileText className="size-3.5" /> Prompt
                {draft !== null && (
                  <button className="ml-1 font-normal text-accent hover:underline" onClick={() => setDraft(null)}>
                    reset edits
                  </button>
                )}
              </span>
              <span className={cn('text-[11px] tabular-nums', over ? 'font-semibold text-accent' : 'text-subtle')}>
                {size.toLocaleString()} / {agent.limit.toLocaleString()} {agent.limitIsUrl ? 'link chars' : 'chars'}
              </span>
            </div>
            <Textarea
              value={prompt}
              onChange={(e) => setDraft(e.target.value)}
              spellCheck={false}
              className="h-[340px] resize-y font-mono text-[12px] leading-relaxed"
              aria-label="Prompt sent to the coding agent"
            />
            {fitted.trimmed && draft === null && (
              <p className="mt-1.5 text-[11px] text-warn">
                Trimmed to fit {agent.name}’s {agent.limitIsUrl ? 'link' : 'prompt'} limit (older comments and long sections dropped). “{issue.key}.md” and the clipboard copy keep everything.
              </p>
            )}
            {over && <p className="mt-1.5 text-[11px] font-semibold text-accent">Too long for {agent.name}’s link — shorten the prompt or use Copy.</p>}
          </div>
          {command && (
            <div>
              <div className="mb-1.5 text-xs font-semibold text-muted">Run in your terminal</div>
              <pre className="max-h-24 overflow-auto rounded-lg border border-line bg-canvas p-3 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap text-muted">
                {command.length > 600 ? `${command.slice(0, 600)}…` : command}
              </pre>
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <section>
            <h3 className="mb-2 text-xs font-semibold text-muted">Context to include</h3>
            <div className="flex flex-col items-start gap-2">
              <Checkbox checked={context.related} onChange={(v) => setContext({ related: v })} label="Sub-tasks, links & attachments" />
              <Checkbox checked={context.epic} onChange={(v) => setContext({ epic: v })} label="Epic context" />
              <Checkbox checked={context.comments} onChange={(v) => setContext({ comments: v })} label="Recent comments" />
              <Checkbox checked={context.conventions} onChange={(v) => setContext({ conventions: v })} label="Branch & commit conventions" />
            </div>
          </section>
          <Field label="Extra instructions" hint="Added to every ticket you send. Saved in this browser.">
            <Textarea rows={3} value={context.instructions} onChange={(e) => setContext({ instructions: e.target.value })} placeholder="e.g. Use pnpm. Don’t touch the 3D scene." className="text-[12.5px]" />
          </Field>
          <section className="space-y-3 rounded-xl border border-line p-3">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold text-muted">
              <Monitor className="size-3.5" /> Where the agent starts
            </h3>
            <Field label="GitHub repository" hint={`Shared with everyone on ${project?.key}.`}>
              <Input
                value={repoInput}
                placeholder="owner/name"
                onChange={(e) => setRepoInput(e.target.value)}
                onBlur={() => {
                  const v = repoInput.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '')
                  if (v && !/^[\w.-]+\/[\w.-]+$/.test(v)) return toast({ title: 'Use the owner/name form, e.g. skatebored/platform', tone: 'error' })
                  setRepoInput(v)
                  if (project && v !== (project.repo ?? '')) updateProject(project.id, { repo: v || null })
                }}
                className="h-8 text-[13px]"
              />
            </Field>
            <Field label="Local clone path" hint="Only on this computer. Wins over the repository.">
              <Input
                value={pathInput}
                placeholder="/Users/you/code/skatebored"
                onChange={(e) => setPathInput(e.target.value)}
                onBlur={() => {
                  const v = pathInput.trim()
                  if (v && !v.startsWith('/') && !/^[A-Za-z]:\\/.test(v)) return toast({ title: 'Use an absolute path', tone: 'error' })
                  if (project) setLocalPath(project.id, v)
                }}
                className="h-8 text-[13px]"
              />
            </Field>
          </section>
          <p className="text-[11px] leading-snug text-subtle">
            Need {agent.name}?{' '}
            {agent.install.startsWith('http') ? (
              <a href={agent.install} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                Download it
              </a>
            ) : (
              <>
                <code className="rounded bg-surface-3 px-1">{agent.install}</code>
              </>
            )}{' '}
            ·{' '}
            <a href={agent.docs} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
              Docs
            </a>
          </p>
        </aside>
      </div>
    </Modal>
  )
}
