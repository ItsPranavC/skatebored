import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bot, CalendarDays, Check, Columns3, ListTodo, Search, Sparkles } from 'lucide-react'
import { create } from 'zustand'
import { useMe } from '@/store/store'
import { toast } from '@/store/ui'
import { Modal } from '@/components/ui/overlay'
import { Button, Field, Input } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import { dismissPrompt, useGoogleCalendar } from '@/features/calendar/googleCalendar'
import { useMcpAgents } from '@/features/agents/mcpAgents'
import { AgentSetup } from '@/features/agents/AgentSetup'

/**
 * First-run onboarding, once per member: welcome → Google Calendar → coding agents → done.
 * Progress lives in this browser, so the flow resumes on the right step after the
 * Google sign-in redirect. Reopen it any time from Help → Getting started.
 */

type Step = 'welcome' | 'calendar' | 'agents' | 'done'
const STEPS: Step[] = ['welcome', 'calendar', 'agents', 'done']

const KEY = (userId: string) => `sb:onboarding:v1:${userId}`
function load(userId: string): { step: Step; finished: boolean } | null {
  try {
    return JSON.parse(localStorage.getItem(KEY(userId)) ?? 'null')
  } catch {
    return null
  }
}
function save(userId: string, v: { step: Step; finished: boolean }) {
  try {
    localStorage.setItem(KEY(userId), JSON.stringify(v))
  } catch {
    /* private mode — onboarding shows again next session */
  }
}

/** Lets the Help menu reopen onboarding. */
export const useOnboarding = create<{ requests: number; open: () => void }>((set, get) => ({
  requests: 0,
  open: () => set({ requests: get().requests + 1 }),
}))

function Dots({ step, steps }: { step: Step; steps: Step[] }) {
  return (
    <div className="flex items-center gap-1.5" aria-label={`Step ${steps.indexOf(step) + 1} of ${steps.length}`}>
      {steps.map((s) => (
        <span key={s} className={cn('h-1.5 rounded-full transition-all', s === step ? 'w-6 bg-accent' : 'w-1.5 bg-line-strong')} />
      ))}
    </div>
  )
}

function Hero({ icon, title, children }: { icon: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="grid size-12 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">{icon}</div>
      <div className="min-w-0 flex-1">
        <h2 className="display text-2xl">{title}</h2>
        {children}
      </div>
    </div>
  )
}

const Perk = ({ children }: { children: React.ReactNode }) => (
  <li className="flex gap-2 text-[13px]">
    <Check className="mt-0.5 size-4 shrink-0 text-success" /> <span>{children}</span>
  </li>
)

export function Onboarding() {
  const me = useMe()
  const navigate = useNavigate()
  const requests = useOnboarding((s) => s.requests)
  const [handled, setHandled] = useState(requests)
  const cal = useGoogleCalendar()
  const createAgent = useMcpAgents((s) => s.create)
  const [state, setState] = useState(() => load(me.id) ?? { step: 'welcome' as Step, finished: false })
  const [open, setOpen] = useState(() => !state.finished)
  const [agentName, setAgentName] = useState('')
  const [token, setToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void cal.checkStatus()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Help → Getting started: restart from the welcome step.
  if (requests !== handled) {
    setHandled(requests)
    setToken(null)
    setState({ step: 'welcome', finished: false })
    setOpen(true)
  }

  // No Google integration on this server → nothing to ask; leave the step out.
  const steps = cal.status === 'unavailable' ? STEPS.filter((s) => s !== 'calendar') : STEPS
  const step = steps.includes(state.step) ? state.step : 'agents'

  const go = (next: Step, finished = false) => {
    const v = { step: next, finished }
    setState(v)
    save(me.id, v)
  }
  const nextOf = (s: Step) => steps[Math.min(steps.indexOf(s) + 1, steps.length - 1)]!
  const finish = () => {
    go('done', true)
    setOpen(false)
  }
  // Closing early counts as "seen": it won't pop up again, but stays in Help → Getting started.
  const close = () => {
    save(me.id, { step, finished: true })
    setOpen(false)
  }

  const first = me.name.split(' ')[0]
  const createToken = async () => {
    if (!agentName.trim() || busy) return
    setBusy(true)
    try {
      setToken(await createAgent(agentName.trim()))
    } catch (e) {
      toast({ title: 'Couldn’t create the agent', description: (e as Error).message, tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  let body: React.ReactNode
  let footer: React.ReactNode
  if (step === 'welcome') {
    body = (
      <Hero icon={<Sparkles className="size-6" />} title={`Welcome, ${first}`}>
        <p className="mt-1 text-[14px] text-muted">This is the team’s shared scrum workspace. Everyone sees the same projects, sprints and issues, live.</p>
        <ul className="mt-4 space-y-2.5 text-[13px]">
          <li className="flex gap-2.5">
            <ListTodo className="mt-0.5 size-4 shrink-0 text-accent" /> <span><b>Backlog</b>: plan what goes into each sprint.</span>
          </li>
          <li className="flex gap-2.5">
            <Columns3 className="mt-0.5 size-4 shrink-0 text-accent" /> <span><b>Active sprints</b>: the board you update every day. Drag cards as work moves.</span>
          </li>
          <li className="flex gap-2.5">
            <Search className="mt-0.5 size-4 shrink-0 text-accent" /> <span>Press <b>c</b> to create an issue, <b>/</b> to search, <b>?</b> for every shortcut.</span>
          </li>
        </ul>
        <p className="mt-4 text-[13px] text-muted">{steps.includes('calendar') ? 'Two quick, optional steps' : 'One quick, optional step'} and you’re set up.</p>
      </Hero>
    )
    footer = (
      <Button variant="primary" onClick={() => go(nextOf('welcome'))}>
        Get started
      </Button>
    )
  } else if (step === 'calendar') {
    const connected = cal.status === 'connected'
    body = (
      <Hero icon={<CalendarDays className="size-6" />} title="Connect your Google Calendar">
        <ul className="mt-3 space-y-2">
          <Perk>Your meetings next to your sprint work, on one calendar</Perk>
          <Perk>New events show up here automatically</Perk>
          <Perk>Turn any event into an issue, or put a due date on your Google Calendar</Perk>
        </ul>
        {connected ? (
          <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-success/15 px-3 py-1 text-[13px] text-success">
            <Check className="size-4" /> Google Calendar connected
          </p>
        ) : (
          <p className="mt-4 text-[12px] text-subtle">You’ll sign in with Google, then come straight back here. Only you can see your calendar.</p>
        )}
      </Hero>
    )
    footer = connected ? (
      <Button variant="primary" onClick={() => go(nextOf('calendar'))}>
        Next
      </Button>
    ) : (
      <>
        <Button variant="subtle" onClick={() => go(nextOf('calendar'))}>
          Skip for now
        </Button>
        <Button
          variant="primary"
          disabled={busy || cal.status === 'unknown'}
          onClick={async () => {
            setBusy(true)
            // Come back on the next step after Google's redirect; the stand-alone calendar prompt stays quiet.
            go(nextOf('calendar'))
            dismissPrompt(me.id)
            try {
              await cal.connect()
            } catch (e) {
              setBusy(false)
              go('calendar')
              toast({ title: 'Couldn’t start Google sign-in', description: (e as Error).message, tone: 'error' })
            }
          }}
        >
          Connect Google Calendar
        </Button>
      </>
    )
  } else if (step === 'agents') {
    body = token ? (
      <div className="space-y-4">
        <Hero icon={<Bot className="size-6" />} title="Add it to your coding tool">
          <p className="mt-1 rounded-lg border border-accent/40 bg-accent-soft px-3 py-2 text-[13px]">
            This token is shown <strong>once</strong>. It lets the agent act as you, so keep it out of git and chats.
          </p>
        </Hero>
        <AgentSetup token={token} />
      </div>
    ) : (
      <Hero icon={<Bot className="size-6" />} title="Connect your coding agents">
        <p className="mt-1 text-[14px] text-muted">Using Claude Code, Cursor or VS Code? Connect them so they work from the board.</p>
        <ul className="mt-3 space-y-2">
          <Perk>Your agent knows you’re its owner, and which task you handed it</Perk>
          <Perk>It gets the full brief: description, sprint goal, epic, comments and branch name</Perk>
          <Perk>It moves its card and posts progress as it works, signed with its name</Perk>
        </ul>
        <form
          className="mt-4"
          onSubmit={(e) => {
            e.preventDefault()
            void createToken()
          }}
        >
          <Field label="Name this agent" hint="Shown on its comments. You can add more later in Settings → Agents & MCP.">
            <Input value={agentName} maxLength={60} onChange={(e) => setAgentName(e.target.value)} placeholder="Claude Code – laptop" />
          </Field>
        </form>
      </Hero>
    )
    footer = token ? (
      <Button variant="primary" onClick={() => go('done')}>
        I’ve added it
      </Button>
    ) : (
      <>
        <Button variant="subtle" onClick={() => go('done')}>
          Skip for now
        </Button>
        <Button variant="primary" disabled={!agentName.trim() || busy} onClick={() => void createToken()}>
          Create agent token
        </Button>
      </>
    )
  } else {
    body = (
      <Hero icon={<Check className="size-6" />} title="You’re all set">
        <ul className="mt-3 space-y-2">
          <Perk>
            Hand a task to your agent from any issue: <b>Development → Hand to agent</b>, then tell it “Work on my current skatebored task.”
          </Perk>
          <Perk>
            Add or revoke agents any time from <b>Settings → Agents & MCP</b>.
          </Perk>
          {cal.status !== 'unavailable' && (
            <Perk>
              Your meetings live in the <b>Calendar</b> tab{cal.status === 'connected' ? '' : ', where you can connect Google Calendar later'}.
            </Perk>
          )}
          <Perk>
            Replay this tour from <b>Help → Getting started</b>.
          </Perk>
        </ul>
      </Hero>
    )
    footer = (
      <>
        <Button
          variant="subtle"
          onClick={() => {
            finish()
            navigate('/agents')
          }}
        >
          Manage agents
        </Button>
        <Button variant="primary" onClick={finish}>
          Go to the workspace
        </Button>
      </>
    )
  }

  return (
    <Modal
      open={open}
      onClose={close}
      width={token && step === 'agents' ? 640 : 540}
      footer={
        <div className="flex w-full items-center gap-2">
          <Dots step={step} steps={steps} />
          <div className="ml-auto flex items-center gap-2">{footer}</div>
        </div>
      }
    >
      <div className="pt-2">{body}</div>
    </Modal>
  )
}
