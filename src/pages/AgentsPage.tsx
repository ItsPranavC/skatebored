import { useEffect, useMemo, useState } from 'react'
import { Bot, Plus, Trash2 } from 'lucide-react'
import { useStore } from '@/store/store'
import { toast } from '@/store/ui'
import { IssueTypeIcon } from '@/components/jira'
import { ConfirmDialog, Modal, Select, type Option } from '@/components/ui/overlay'
import { Button, EmptyState, Field, Input, PageHeader, Spinner } from '@/components/ui/primitives'
import { timeAgo } from '@/lib/utils'
import { MCP_URL, useMcpAgents, type McpAgent } from '@/features/agents/mcpAgents'
import { AgentSetup } from '@/features/agents/AgentSetup'

const TOOLS: [string, string][] = [
  ['whoami', 'Its name, its owner (you) and its current task'],
  ['get_current_task', 'The full brief for the task you handed it: description, sprint goal, epic, sub-tasks, links, comments, branch'],
  ['list_my_tasks', 'Your open issues in the active sprint, in priority order'],
  ['get_project_context', 'Project description, workflow, sprint progress, epics and who owns what'],
  ['get_issue / search_issues', 'Look up any issue, or find related and unassigned work'],
  ['start_task', 'Take an issue (yours or unassigned) and move it to In Progress'],
  ['update_task_status / add_comment', 'Move its task through the workflow and post progress, signed with its name'],
  ['complete_task', 'Post a summary, move the task to In Review and clear its slot'],
]

function useMyTaskOptions(): Option[] {
  const issues = useStore((s) => s.issues)
  const projects = useStore((s) => s.projects)
  const me = useStore((s) => s.currentUserId)
  return useMemo(() => {
    const done = new Set(projects.flatMap((p) => p.statuses.filter((x) => x.category === 'done').map((x) => x.id)))
    const open = issues.filter((i) => i.type !== 'epic' && !done.has(i.statusId) && (i.assigneeId === me || !i.assigneeId))
    return [
      { value: '__none', label: 'No task' },
      ...open
        .sort((a, b) => Number(b.assigneeId === me) - Number(a.assigneeId === me) || a.rank - b.rank)
        .map((i) => ({ value: i.id, label: `${i.key} ${i.summary}`, icon: <IssueTypeIcon type={i.type} />, group: i.assigneeId === me ? 'Assigned to you' : 'Unassigned' })),
    ]
  }, [issues, projects, me])
}

function AgentRow({ agent, onRevoke }: { agent: McpAgent; onRevoke: () => void }) {
  const setTask = useMcpAgents((s) => s.setTask)
  const issues = useStore((s) => s.issues)
  const options = useMyTaskOptions()
  const current = agent.currentIssueId ? issues.find((i) => i.id === agent.currentIssueId) : undefined
  // Keep a task that's no longer "open for me" (e.g. moved to review) selectable.
  const opts = current && !options.some((o) => o.value === current.id) ? [...options, { value: current.id, label: `${current.key} ${current.summary}`, icon: <IssueTypeIcon type={current.type} /> }] : options
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-line bg-surface p-4">
      <div className="grid size-10 place-items-center rounded-full bg-accent-soft text-accent">
        <Bot className="size-5" />
      </div>
      <div className="min-w-[180px] flex-1">
        <div className="font-semibold">{agent.name}</div>
        <div className="text-xs text-muted">
          sbk_…{agent.tokenHint} · {agent.lastUsedAt ? `last active ${timeAgo(agent.lastUsedAt)}` : 'never connected'}
        </div>
      </div>
      <div className="w-[320px] max-w-full">
        <div className="mb-1 text-[11px] font-semibold tracking-wide text-subtle uppercase">Current task</div>
        <Select
          value={agent.currentIssueId ?? '__none'}
          options={opts}
          searchable
          width={420}
          onChange={async (v) => {
            try {
              await setTask(agent.id, v === '__none' ? null : v)
              toast({ title: v === '__none' ? `${agent.name} has no task` : `Handed to ${agent.name}`, tone: 'success' })
            } catch (e) {
              toast({ title: 'Couldn’t update the agent', description: (e as Error).message, tone: 'error' })
            }
          }}
        />
      </div>
      <Button variant="subtle" icon={<Trash2 className="size-4" />} onClick={onRevoke} aria-label={`Revoke ${agent.name}`}>
        Revoke
      </Button>
    </div>
  )
}

export default function AgentsPage() {
  const { agents, loaded, error, load, create, revoke } = useMcpAgents()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [revoking, setRevoking] = useState<McpAgent | null>(null)

  useEffect(() => {
    void load()
  }, [load])

  const submitCreate = async () => {
    if (!name.trim() || busy) return
    setBusy(true)
    try {
      setToken(await create(name.trim()))
    } catch (e) {
      toast({ title: 'Couldn’t create the agent', description: (e as Error).message, tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const closeCreate = () => {
    setCreating(false)
    setToken(null)
    setName('')
  }

  return (
    <div className="mx-auto max-w-[1000px] pb-12">
      <PageHeader
        title="Agents & MCP"
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            Connect an agent
          </Button>
        }
      >
        <p className="max-w-[680px] text-sm text-muted">
          Connect your coding agents (Claude Code, Cursor, VS Code…) to this workspace. Each agent works for you: it knows you’re its owner, sees the task you hand it with full context, and updates the board as it goes.
        </p>
      </PageHeader>

      <div className="space-y-3 px-8">
        {!loaded ? (
          <div className="grid place-items-center py-16">
            <Spinner className="size-6" />
          </div>
        ) : error ? (
          <EmptyState icon="⚠️" title="Couldn’t load your agents" action={<Button onClick={() => void load()}>Try again</Button>}>
            {error}
          </EmptyState>
        ) : agents.length === 0 ? (
          <EmptyState icon="🤖" title="No agents yet" action={<Button variant="primary" onClick={() => setCreating(true)}>Connect an agent</Button>}>
            Create a token, add it to your coding tool, then hand it a task here or from any issue’s Development panel.
          </EmptyState>
        ) : (
          agents.map((a) => <AgentRow key={a.id} agent={a} onRevoke={() => setRevoking(a)} />)
        )}

        <div className="mt-8 rounded-xl border border-line p-5">
          <h2 className="text-[15px] font-semibold">What your agents can do</h2>
          <p className="mt-1 text-[13px] text-muted">
            Server: <code>{MCP_URL}</code> · Every change is recorded as yours and labelled with the agent’s name.
          </p>
          <table className="mt-3 w-full text-[13px]">
            <tbody>
              {TOOLS.map(([t, d]) => (
                <tr key={t} className="border-t border-line">
                  <td className="py-2 pr-4 align-top whitespace-nowrap">
                    <code>{t}</code>
                  </td>
                  <td className="py-2 text-muted">{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={creating}
        onClose={closeCreate}
        width={640}
        title={token ? 'Add it to your coding tool' : 'Connect an agent'}
        footer={
          token ? (
            <Button variant="primary" onClick={closeCreate}>
              Done
            </Button>
          ) : (
            <>
              <Button variant="subtle" onClick={closeCreate}>
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={!name.trim() || busy}
                onClick={() => void submitCreate()}
              >
                Create token
              </Button>
            </>
          )
        }
      >
        {token ? (
          <div className="space-y-4">
            <p className="rounded-lg border border-accent/40 bg-accent-soft px-3 py-2 text-[13px]">
              This token is shown <strong>once</strong>. It lets the agent act as you, so keep it out of git and chats. Revoke it here any time.
            </p>
            <AgentSetup token={token} />
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void submitCreate()
            }}
          >
            <Field label="Agent name" hint="Shown on its comments, e.g. “Claude Code – laptop”">
              <Input autoFocus value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Claude Code – laptop" />
            </Field>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={!!revoking}
        onClose={() => setRevoking(null)}
        title={`Revoke ${revoking?.name}?`}
        confirmLabel="Revoke"
        danger
        onConfirm={async () => {
          if (!revoking) return
          await revoke(revoking.id).catch((e: Error) => toast({ title: 'Couldn’t revoke', description: e.message, tone: 'error' }))
          setRevoking(null)
        }}
      >
        The agent loses access immediately. Anything it already did stays in the workspace.
      </ConfirmDialog>
    </div>
  )
}
