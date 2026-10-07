import { useState } from 'react'
import { Tag, Trash2, X } from 'lucide-react'
import { useStore } from '@/store/store'
import { toast } from '@/store/ui'
import { ConfirmDialog, Popover, SelectList } from '@/components/ui/overlay'
import { Button, Input } from '@/components/ui/primitives'
import { priorityOptions, StatusLozenge, useUserOptions } from '@/components/jira'
import type { Issue } from '@/types'

/** Bulk change toolbar for the issue navigator. */
export function BulkBar({ selected, onClear }: { selected: Issue[]; onClear: () => void }) {
  const projects = useStore((s) => s.projects)
  const sprints = useStore((s) => s.sprints)
  const updateIssue = useStore((s) => s.updateIssue)
  const moveToSprint = useStore((s) => s.moveToSprint)
  const deleteIssue = useStore((s) => s.deleteIssue)
  const [confirm, setConfirm] = useState(false)
  const [label, setLabel] = useState('')

  const projectIds = [...new Set(selected.map((i) => i.projectId))]
  const sameProject = projectIds.length === 1 ? projects.find((p) => p.id === projectIds[0]) : undefined
  const userOptions = useUserOptions(sameProject?.id)
  const n = selected.length
  const done = (what: string) => toast({ title: `${what} for ${n} issue${n === 1 ? '' : 's'}`, tone: 'success' })
  const each = (patch: (i: Issue) => Partial<Issue>) => selected.forEach((i) => updateIssue(i.id, patch(i)))

  const sprintOptions = sameProject
    ? [
        { value: '__backlog', label: 'Backlog' },
        ...sprints
          .filter((s) => s.projectId === sameProject.id && s.state !== 'closed')
          .sort((a, b) => a.order - b.order)
          .map((s) => ({ value: s.id, label: s.name, hint: s.state === 'active' ? 'Active' : undefined })),
      ]
    : []

  return (
    <div className="animate-pop sticky bottom-4 z-20 mx-auto mt-4 flex w-fit flex-wrap items-center gap-1.5 rounded-2xl border border-line-strong bg-surface-2 px-3 py-2 shadow-pop">
      <span className="mr-2 text-[13px] font-semibold">
        {n} selected
      </span>
      <Popover width={260} trigger={<Button size="sm">Assign</Button>}>
        {(close) => (
          <SelectList
            options={userOptions}
            value={null}
            placeholder="Assign to…"
            onSelect={(v) => {
              each(() => ({ assigneeId: v === '__none' ? null : v }))
              done('Assignee updated')
              close()
            }}
          />
        )}
      </Popover>
      <Popover
        width={240}
        trigger={
          <Button size="sm" disabled={!sameProject} title={sameProject ? undefined : 'Select issues from one project to change status'}>
            Transition
          </Button>
        }
      >
        {(close) => (
          <div className="py-1">
            {sameProject?.statuses.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  each(() => ({ statusId: s.id }))
                  done(`Moved to ${s.name}`)
                  close()
                }}
                className="flex w-full items-center justify-between px-3 py-1.5 text-[13px] hover:bg-hover"
              >
                {s.name}
                <StatusLozenge status={s} />
              </button>
            ))}
          </div>
        )}
      </Popover>
      <Popover width={220} trigger={<Button size="sm">Priority</Button>}>
        {(close) => (
          <SelectList
            searchable={false}
            options={priorityOptions}
            value={null}
            onSelect={(v) => {
              each(() => ({ priority: v }))
              done('Priority updated')
              close()
            }}
          />
        )}
      </Popover>
      <Popover width={260} trigger={<Button size="sm" icon={<Tag className="size-3.5" />}>Add label</Button>}>
        {(close) => (
          <form
            className="flex gap-2 p-2"
            onSubmit={(e) => {
              e.preventDefault()
              const l = label.trim().replace(/\s+/g, '-')
              if (!l) return
              each((i) => ({ labels: i.labels.includes(l) ? i.labels : [...i.labels, l] }))
              done(`Label “${l}” added`)
              setLabel('')
              close()
            }}
          >
            <Input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} placeholder="label" className="h-8" />
            <Button type="submit" variant="primary">
              Add
            </Button>
          </form>
        )}
      </Popover>
      <Popover
        width={260}
        trigger={
          <Button size="sm" disabled={!sameProject || sameProject.type !== 'scrum'} title={!sameProject ? 'Select issues from one project' : undefined}>
            Move to sprint
          </Button>
        }
      >
        {(close) => (
          <SelectList
            searchable={false}
            options={sprintOptions}
            value={null}
            onSelect={(v) => {
              moveToSprint(
                selected.map((i) => i.id),
                v === '__backlog' ? null : v,
              )
              done(v === '__backlog' ? 'Moved to backlog' : 'Moved to sprint')
              close()
            }}
          />
        )}
      </Popover>
      <Button size="sm" variant="ghost" className="text-accent hover:text-accent" icon={<Trash2 className="size-3.5" />} onClick={() => setConfirm(true)}>
        Delete
      </Button>
      <div className="mx-1 h-5 w-px bg-line" />
      <Button size="sm" variant="ghost" icon={<X className="size-4" />} onClick={onClear} aria-label="Clear selection" />
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title={`Delete ${n} issue${n === 1 ? '' : 's'}?`}
        onConfirm={() => {
          selected.forEach((i) => deleteIssue(i.id))
          toast({ title: `Deleted ${n} issue${n === 1 ? '' : 's'}` })
          onClear()
        }}
      >
        This permanently deletes the selected issues, their sub-tasks, comments and work logs. This can’t be undone.
      </ConfirmDialog>
    </div>
  )
}
