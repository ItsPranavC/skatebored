import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '@/store/store'
import { toast } from '@/store/ui'
import { Modal } from '@/components/ui/overlay'
import { Button, Field, Input, Textarea, Toggle } from '@/components/ui/primitives'
import { UserPicker } from '@/components/jira'
import { cn, EPIC_COLORS } from '@/lib/utils'
import { keyFromName, PROJECT_ICONS, validateKey } from './projectUtils'

export function CreateProjectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const projects = useStore((s) => s.projects)
  const me = useStore((s) => s.currentUserId)
  const createProject = useStore((s) => s.createProject)
  const [name, setName] = useState('')
  const [key, setKey] = useState('')
  const [keyTouched, setKeyTouched] = useState(false)
  const [leadId, setLeadId] = useState<string | null>(me)
  const [description, setDescription] = useState('')
  const [icon, setIcon] = useState(PROJECT_ICONS[0]!)
  const [color, setColor] = useState(EPIC_COLORS[0]!)
  const [engineering, setEngineering] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    if (open) {
      setName('')
      setKey('')
      setKeyTouched(false)
      setLeadId(me)
      setDescription('')
      setIcon(PROJECT_ICONS[0]!)
      setColor(EPIC_COLORS[projects.length % EPIC_COLORS.length]!)
      setSubmitted(false)
      setEngineering(false)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const keyError = validateKey(key, projects.map((p) => p.key))
  const nameError = !name.trim() ? 'Name is required' : null

  const submit = () => {
    setSubmitted(true)
    if (keyError || nameError) return
    const p = createProject({ name: name.trim(), key, type: 'scrum', leadId: leadId ?? me, description, icon, color, engineering })
    onClose()
    toast({ title: `${p.name} created`, description: 'Your scrum project is ready.', tone: 'success' })
    navigate(`/projects/${p.key}/backlog`)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={620}
      title="Create a scrum project"
      footer={
        <>
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit}>
            Create project
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <p className="text-sm text-muted">
          Backlog, sprints, board and reports, ready to go. You can change columns and statuses later in project settings.
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
        <Field label="Engineering team" hint="Sprints become Research or Implementation, with Google Docs and presentation times.">
          <Toggle checked={engineering} onChange={setEngineering} label="Engineering project" />
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
    </Modal>
  )
}
