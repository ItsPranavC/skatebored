import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Columns3, ListTodo } from 'lucide-react'
import { useStore } from '@/store/store'
import { toast } from '@/store/ui'
import { Modal } from '@/components/ui/overlay'
import { Button, Field, Input, Textarea } from '@/components/ui/primitives'
import { UserPicker } from '@/components/jira'
import { cn, EPIC_COLORS } from '@/lib/utils'
import { keyFromName, PROJECT_ICONS, validateKey } from './projectUtils'

function TemplateCard({ type, selected, onClick }: { type: 'scrum' | 'kanban'; selected: boolean; onClick: () => void }) {
  const scrum = type === 'scrum'
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-col gap-3 rounded-2xl border p-5 text-left transition',
        selected ? 'border-accent bg-accent-soft ring-2 ring-accent-soft' : 'border-line bg-surface-2 hover:border-line-strong',
      )}
    >
      {/* Illustration: mini board */}
      <div className="flex h-24 items-end gap-1.5 rounded-xl bg-canvas p-3">
        {(scrum ? [3, 2, 1, 2] : [4, 2, 1]).map((n, i) => (
          <div key={i} className="flex flex-1 flex-col gap-1">
            {Array.from({ length: n }).map((_, k) => (
              <div key={k} className="h-3 rounded" style={{ background: k === 0 && i === 0 ? 'var(--accent)' : 'var(--surface-3)' }} />
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        {scrum ? <ListTodo className="size-5 text-accent" /> : <Columns3 className="size-5 text-accent" />}
        <span className="display text-xl">{scrum ? 'Scrum' : 'Kanban'}</span>
      </div>
      <p className="text-[13px] text-muted">
        {scrum
          ? 'Sprint toward your goals. Plan work in a backlog, commit to time-boxed sprints, and track velocity and burndown.'
          : 'Visualize a continuous flow of work. Limit work in progress and ship as soon as something is ready.'}
      </p>
      <ul className="space-y-1 text-[12px] text-subtle">
        {(scrum ? ['Backlog & sprints', 'Burndown & velocity reports', 'Timeline'] : ['Continuous board', 'WIP limits', 'Cumulative flow']).map((f) => (
          <li key={f}>· {f}</li>
        ))}
      </ul>
    </button>
  )
}

export function CreateProjectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const projects = useStore((s) => s.projects)
  const me = useStore((s) => s.currentUserId)
  const createProject = useStore((s) => s.createProject)
  const [step, setStep] = useState<1 | 2>(1)
  const [type, setType] = useState<'scrum' | 'kanban'>('scrum')
  const [name, setName] = useState('')
  const [key, setKey] = useState('')
  const [keyTouched, setKeyTouched] = useState(false)
  const [leadId, setLeadId] = useState<string | null>(me)
  const [description, setDescription] = useState('')
  const [icon, setIcon] = useState(PROJECT_ICONS[0]!)
  const [color, setColor] = useState(EPIC_COLORS[0]!)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    if (open) {
      setStep(1)
      setType('scrum')
      setName('')
      setKey('')
      setKeyTouched(false)
      setLeadId(me)
      setDescription('')
      setIcon(PROJECT_ICONS[0]!)
      setColor(EPIC_COLORS[projects.length % EPIC_COLORS.length]!)
      setSubmitted(false)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const keyError = validateKey(key, projects.map((p) => p.key))
  const nameError = !name.trim() ? 'Name is required' : null

  const submit = () => {
    setSubmitted(true)
    if (keyError || nameError) return
    const p = createProject({ name: name.trim(), key, type, leadId: leadId ?? me, description, icon, color })
    onClose()
    toast({ title: `${p.name} created`, description: `Your ${type} project is ready.`, tone: 'success' })
    navigate(`/projects/${p.key}/${type === 'scrum' ? 'backlog' : 'board'}`)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={step === 1 ? 760 : 620}
      title={step === 1 ? 'Choose a project template' : 'Add project details'}
      footer={
        step === 1 ? (
          <>
            <Button variant="subtle" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => setStep(2)}>
              Use template
            </Button>
          </>
        ) : (
          <>
            <Button variant="subtle" icon={<ArrowLeft className="size-4" />} onClick={() => setStep(1)} className="mr-auto">
              Back
            </Button>
            <Button variant="subtle" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submit}>
              Create project
            </Button>
          </>
        )
      }
    >
      {step === 1 ? (
        <div>
          <p className="mb-4 text-sm text-muted">Templates set up your board, workflow and reports. You can change columns and statuses later in project settings.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <TemplateCard type="scrum" selected={type === 'scrum'} onClick={() => setType('scrum')} />
            <TemplateCard type="kanban" selected={type === 'kanban'} onClick={() => setType('kanban')} />
          </div>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <p className="text-sm text-muted">
            Template: <span className="font-semibold text-fg">{type === 'scrum' ? 'Scrum' : 'Kanban'}</span> · Team-managed
          </p>
          <Field label="Name" required error={submitted ? nameError : null}>
            <Input
              autoFocus
              value={name}
              placeholder="e.g. Learner mobile app"
              onChange={(e) => {
                setName(e.target.value)
                if (!keyTouched) setKey(keyFromName(e.target.value))
              }}
            />
          </Field>
          <Field label="Key" required error={(submitted || keyTouched) && key ? keyError : submitted ? keyError : null} hint="Prefix for issue keys, e.g. SKB-12">
            <Input
              value={key}
              maxLength={10}
              invalid={(submitted || keyTouched) && !!keyError}
              onChange={(e) => {
                setKeyTouched(true)
                setKey(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))
              }}
              className="w-40 font-semibold tracking-wide"
            />
          </Field>
          <Field label="Project lead">
            <div className="rounded-lg border border-line bg-surface-2 px-3 py-1">
              <UserPicker value={leadId} onChange={setLeadId} allowUnassigned={false} />
            </div>
          </Field>
          <Field label="Description">
            <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this project about?" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Icon">
              <div className="flex flex-wrap gap-1.5">
                {PROJECT_ICONS.map((i) => (
                  <button
                    type="button"
                    key={i}
                    onClick={() => setIcon(i)}
                    className={cn('grid size-9 place-items-center rounded-lg border text-lg transition', icon === i ? 'border-accent bg-accent-soft' : 'border-line bg-surface-2 hover:bg-surface-3')}
                    aria-label={`Icon ${i}`}
                  >
                    {i}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Colour">
              <div className="flex flex-wrap gap-1.5">
                {EPIC_COLORS.map((c) => (
                  <button
                    type="button"
                    key={c}
                    onClick={() => setColor(c)}
                    className={cn('size-9 rounded-lg transition', color === c ? 'ring-2 ring-fg ring-offset-2 ring-offset-surface' : 'hover:scale-105')}
                    style={{ background: c }}
                    aria-label={`Colour ${c}`}
                  />
                ))}
              </div>
            </Field>
          </div>
          <button type="submit" className="hidden" />
        </form>
      )}
    </Modal>
  )
}
