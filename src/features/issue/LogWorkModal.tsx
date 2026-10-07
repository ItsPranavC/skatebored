import { useState } from 'react'
import { format } from 'date-fns'
import type { Issue } from '@/types'
import { useStore } from '@/store/store'
import { toast } from '@/store/ui'
import { Modal } from '@/components/ui/overlay'
import { Button, Field, Input, Textarea } from '@/components/ui/primitives'
import { fmtDuration, parseDuration } from '@/lib/utils'

export function TimeTrackingBar({ spent, estimate }: { spent: number; estimate: number | null }) {
  const remaining = Math.max(0, (estimate ?? 0) - spent)
  const total = Math.max(spent + remaining, estimate ?? 0, 1)
  const over = estimate != null && spent > estimate
  return (
    <div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-surface-3">
        <div className={over ? 'bg-warn' : 'bg-info'} style={{ width: `${(spent / total) * 100}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted">
        <span>{spent ? `${fmtDuration(spent)} logged` : 'No time logged'}</span>
        <span>{estimate != null ? (over ? `${fmtDuration(spent - estimate)} over` : `${fmtDuration(remaining) || '0m'} remaining`) : 'No estimate'}</span>
      </div>
    </div>
  )
}

export function LogWorkModal({ issue, open, onClose }: { issue: Issue; open: boolean; onClose: () => void }) {
  const logWork = useStore((s) => s.logWork)
  const [spent, setSpent] = useState('')
  const [remaining, setRemaining] = useState('')
  const [started, setStarted] = useState(() => format(new Date(), "yyyy-MM-dd'T'HH:mm"))
  const [comment, setComment] = useState('')
  const [tried, setTried] = useState(false)

  const spentMin = parseDuration(spent)
  const remainingMin = remaining.trim() ? parseDuration(remaining) : null
  const remainingInvalid = remaining.trim() !== '' && remainingMin == null
  const valid = spentMin != null && spentMin > 0 && !remainingInvalid
  const previewSpent = issue.timeSpent + (spentMin ?? 0)
  const previewEstimate = remainingMin != null ? previewSpent + remainingMin : issue.originalEstimate

  const submit = () => {
    setTried(true)
    if (!valid) return
    logWork(issue.id, spentMin!, comment.trim(), new Date(started).toISOString(), remainingMin)
    toast({ title: `Logged ${fmtDuration(spentMin!)} on ${issue.key}`, tone: 'success' })
    setSpent('')
    setRemaining('')
    setComment('')
    setTried(false)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Time tracking"
      width={520}
      footer={
        <>
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit}>
            Save
          </Button>
        </>
      }
    >
      <div
        className="space-y-4"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
        }}
      >
        <TimeTrackingBar spent={previewSpent} estimate={previewEstimate} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Time spent" required error={tried && (spentMin == null || spentMin <= 0) ? 'Use a format like 2w 4d 6h 45m' : undefined}>
            <Input autoFocus value={spent} onChange={(e) => setSpent(e.target.value)} placeholder="e.g. 2h 30m" invalid={tried && !spentMin} />
          </Field>
          <Field label="Time remaining" error={remainingInvalid ? 'Invalid duration' : undefined} hint="Leave blank to keep the estimate">
            <Input value={remaining} onChange={(e) => setRemaining(e.target.value)} placeholder="e.g. 1d" invalid={remainingInvalid} />
          </Field>
        </div>
        <p className="text-xs text-subtle">
          Use the format: <strong>2w 4d 6h 45m</strong> — w = weeks (5 days), d = days (8 hours), h = hours, m = minutes.
        </p>
        <Field label="Date started" required>
          <Input type="datetime-local" value={started} onChange={(e) => setStarted(e.target.value)} />
        </Field>
        <Field label="Work description">
          <Textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="What did you work on?" />
        </Field>
      </div>
    </Modal>
  )
}
