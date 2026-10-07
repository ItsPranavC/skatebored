import { useState } from 'react'
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, MoreHorizontal, Plus, Trash2, Pencil, ArrowRightLeft } from 'lucide-react'
import { useStore } from '@/store/store'
import { toast } from '@/store/ui'
import { StatusLozenge } from '@/components/jira'
import { Menu, Modal, Select, Popover } from '@/components/ui/overlay'
import { Button, Field, Input } from '@/components/ui/primitives'
import { cn, uid } from '@/lib/utils'
import type { BoardColumn, Project, Status, StatusCategory } from '@/types'

const CATS: { value: StatusCategory; label: string }[] = [
  { value: 'todo', label: 'To do' },
  { value: 'inprogress', label: 'In progress' },
  { value: 'done', label: 'Done' },
]

function InlineText({ value, onSave, className }: { value: string; onSave: (v: string) => void; className?: string }) {
  const [editing, setEditing] = useState(false)
  const [v, setV] = useState(value)
  if (!editing)
    return (
      <button onClick={() => { setV(value); setEditing(true) }} className={cn('truncate rounded px-1 text-left hover:bg-hover', className)} title="Click to rename">
        {value}
      </button>
    )
  const commit = () => {
    const t = v.trim()
    if (t && t !== value) onSave(t)
    setEditing(false)
  }
  return (
    <input
      autoFocus
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') setEditing(false)
      }}
      className={cn('w-full min-w-0 rounded border border-accent bg-surface px-1 outline-none', className)}
    />
  )
}

function RenameInput({ value, onDone }: { value: string; onDone: (v: string | null) => void }) {
  const [v, setV] = useState(value)
  return (
    <input
      autoFocus
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => onDone(v.trim() || null)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onDone(v.trim() || null)
        if (e.key === 'Escape') onDone(null)
      }}
      className="h-6 w-full rounded border border-accent bg-surface-2 px-1.5 text-[12px] outline-none"
    />
  )
}

function AddStatusForm({ onAdd, onCancel }: { onAdd: (name: string, cat: StatusCategory) => void; onCancel: () => void }) {
  const [name, setName] = useState('')
  const [cat, setCat] = useState<StatusCategory>('inprogress')
  return (
    <div className="space-y-2 rounded-lg border border-line bg-surface p-2">
      <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Status name" className="h-8" onKeyDown={(e) => e.key === 'Enter' && name.trim() && onAdd(name.trim(), cat)} />
      <Select value={cat} onChange={setCat} options={CATS} className="h-8" width={200} />
      <div className="flex justify-end gap-1">
        <Button size="xs" variant="subtle" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="xs" variant="primary" disabled={!name.trim()} onClick={() => onAdd(name.trim(), cat)}>
          Add
        </Button>
      </div>
    </div>
  )
}

function StatusChip({ project, status, count, onDelete, columns, currentColumnId }: { project: Project; status: Status; count: number; onDelete: () => void; columns: BoardColumn[]; currentColumnId: string | null }) {
  const updateStatus = useStore((s) => s.updateStatus)
  const setColumns = useStore((s) => s.setColumns)
  const [renaming, setRenaming] = useState(false)
  const moveTo = (colId: string | null) => {
    const next = project.columns.map((c) => ({
      ...c,
      statusIds: c.id === colId ? [...c.statusIds.filter((x) => x !== status.id), status.id] : c.statusIds.filter((x) => x !== status.id),
    }))
    setColumns(project.id, next)
  }
  return (
    <div className="group flex items-center gap-2 rounded-lg border border-line bg-surface px-2 py-2">
      <div className="min-w-0 flex-1">
        {renaming ? (
          <RenameInput
            value={status.name}
            onDone={(name) => {
              if (name) updateStatus(project.id, status.id, { name })
              setRenaming(false)
            }}
          />
        ) : (
          <StatusLozenge status={status} />
        )}
        <div className="mt-1 text-[11px] text-subtle">
          {count} issue{count !== 1 && 's'} · {CATS.find((c) => c.value === status.category)?.label}
        </div>
      </div>
      <Menu
        trigger={<Button size="xs" variant="ghost" icon={<MoreHorizontal className="size-3.5" />} aria-label={`${status.name} actions`} />}
        items={[
          {
            label: 'Rename',
            icon: <Pencil className="size-4" />,
            onClick: () => setRenaming(true),
          },
          { heading: true, label: 'Category' },
          ...CATS.map((c) => ({ label: c.label, checked: status.category === c.value, onClick: () => updateStatus(project.id, status.id, { category: c.value }) })),
          { heading: true, label: 'Move to column' },
          ...columns.filter((c) => c.id !== currentColumnId).map((c) => ({ label: c.name, icon: <ArrowRightLeft className="size-4" />, onClick: () => moveTo(c.id) })),
          ...(currentColumnId ? [{ label: 'Unmap (remove from board)', onClick: () => moveTo(null) }] : []),
          { divider: true, label: '' },
          { label: 'Delete status', icon: <Trash2 className="size-4" />, danger: true, onClick: onDelete, disabled: project.statuses.length <= 1 },
        ]}
      />
    </div>
  )
}

function ColumnCard({ project, column, issueCounts, onDeleteStatus }: { project: Project; column: BoardColumn; issueCounts: Map<string, number>; onDeleteStatus: (s: Status) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: column.id })
  const setColumns = useStore((s) => s.setColumns)
  const addStatus = useStore((s) => s.addStatus)
  const [adding, setAdding] = useState(false)
  const statuses = column.statusIds.map((id) => project.statuses.find((s) => s.id === id)).filter(Boolean) as Status[]
  const total = column.statusIds.reduce((n, id) => n + (issueCounts.get(id) ?? 0), 0)
  const patch = (p: Partial<BoardColumn>) => setColumns(project.id, project.columns.map((c) => (c.id === column.id ? { ...c, ...p } : c)))
  const over = column.wipLimit != null && total > column.wipLimit
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn('flex w-[240px] shrink-0 flex-col rounded-xl border bg-surface-2', isDragging ? 'z-10 border-accent shadow-pop' : 'border-line', over && 'border-accent/60')}
    >
      <div className="flex items-center gap-1 border-b border-line px-2 py-2">
        <button {...attributes} {...listeners} className="cursor-grab rounded p-1 text-subtle hover:bg-hover hover:text-fg active:cursor-grabbing" aria-label="Drag column">
          <GripVertical className="size-4" />
        </button>
        <InlineText value={column.name} onSave={(name) => patch({ name })} className="flex-1 text-[13px] font-semibold uppercase" />
        <Menu
          trigger={<Button size="xs" variant="ghost" icon={<MoreHorizontal className="size-3.5" />} aria-label="Column actions" />}
          items={[
            {
              label: 'Delete column',
              icon: <Trash2 className="size-4" />,
              danger: true,
              disabled: total > 0 || project.columns.length <= 1,
              onClick: () => {
                setColumns(project.id, project.columns.filter((c) => c.id !== column.id))
                toast({ title: `Column “${column.name}” deleted`, description: statuses.length ? 'Its statuses are now unmapped.' : undefined })
              },
            },
          ]}
        />
      </div>
      <div className="flex items-center gap-2 px-3 pt-2 text-[12px] text-muted">
        <span>WIP limit</span>
        <input
          type="number"
          min={0}
          value={column.wipLimit ?? ''}
          placeholder="None"
          onChange={(e) => patch({ wipLimit: e.target.value === '' ? null : Math.max(0, parseInt(e.target.value, 10) || 0) })}
          className={cn('h-7 w-16 rounded-md border bg-surface px-2 text-[12px] outline-none focus:border-accent', over ? 'border-accent text-accent' : 'border-line')}
          aria-label="WIP limit"
        />
        <span className="ml-auto tabular-nums">{total} issues</span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-2">
        {statuses.map((s) => (
          <StatusChip key={s.id} project={project} status={s} count={issueCounts.get(s.id) ?? 0} onDelete={() => onDeleteStatus(s)} columns={project.columns} currentColumnId={column.id} />
        ))}
        {statuses.length === 0 && <div className="rounded-lg border border-dashed border-line px-2 py-4 text-center text-[12px] text-subtle">No statuses — issues can’t appear in this column</div>}
        {adding ? (
          <AddStatusForm
            onCancel={() => setAdding(false)}
            onAdd={(name, category) => {
              addStatus(project.id, { name, category }, column.id)
              setAdding(false)
            }}
          />
        ) : (
          <button onClick={() => setAdding(true)} className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12px] text-muted hover:bg-hover hover:text-fg">
            <Plus className="size-3.5" /> Add status
          </button>
        )}
      </div>
    </div>
  )
}

export function ColumnsTab({ project }: { project: Project }) {
  const issues = useStore((s) => s.issues)
  const setColumns = useStore((s) => s.setColumns)
  const removeStatus = useStore((s) => s.removeStatus)
  const addStatus = useStore((s) => s.addStatus)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const [deleting, setDeleting] = useState<Status | null>(null)
  const [moveTo, setMoveTo] = useState<string | null>(null)
  const [newColumn, setNewColumn] = useState('')

  const issueCounts = new Map<string, number>()
  for (const i of issues) if (i.projectId === project.id) issueCounts.set(i.statusId, (issueCounts.get(i.statusId) ?? 0) + 1)
  const mapped = new Set(project.columns.flatMap((c) => c.statusIds))
  const unmapped = project.statuses.filter((s) => !mapped.has(s.id))

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    const from = project.columns.findIndex((c) => c.id === e.active.id)
    const to = project.columns.findIndex((c) => c.id === e.over!.id)
    setColumns(project.id, arrayMove(project.columns, from, to))
  }

  const addColumn = () => {
    const name = newColumn.trim()
    if (!name) return
    setColumns(project.id, [...project.columns, { id: uid('col-'), name, statusIds: [], wipLimit: null }])
    setNewColumn('')
  }

  return (
    <div>
      <h2 className="display text-2xl">Columns and statuses</h2>
      <p className="mt-1 mb-5 max-w-2xl text-sm text-muted">
        Drag columns to reorder your board. Each column maps one or more statuses; an issue appears in the column that contains its status. Set a WIP limit to flag overloaded columns.
      </p>
      <div className="overflow-x-auto pb-4">
        <div className="flex items-start gap-3">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={project.columns.map((c) => c.id)} strategy={horizontalListSortingStrategy}>
              {project.columns.map((c) => (
                <ColumnCard
                  key={c.id}
                  project={project}
                  column={c}
                  issueCounts={issueCounts}
                  onDeleteStatus={(s) => {
                    setDeleting(s)
                    setMoveTo(project.statuses.find((x) => x.id !== s.id)?.id ?? null)
                  }}
                />
              ))}
            </SortableContext>
          </DndContext>
          <div className="w-[220px] shrink-0 rounded-xl border border-dashed border-line-strong p-3">
            <div className="mb-2 text-[12px] font-semibold text-muted">Add column</div>
            <Input value={newColumn} onChange={(e) => setNewColumn(e.target.value)} placeholder="Column name" className="h-8" onKeyDown={(e) => e.key === 'Enter' && addColumn()} />
            <Button size="sm" className="mt-2 w-full" icon={<Plus className="size-4" />} onClick={addColumn} disabled={!newColumn.trim()}>
              Add column
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-6 max-w-3xl rounded-xl border border-line bg-surface-2 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Unmapped statuses</h3>
            <p className="text-[12px] text-subtle">Issues in these statuses don’t appear on the board. Map them to a column from their menu.</p>
          </div>
          <Popover trigger={<Button size="sm" icon={<Plus className="size-4" />}>New status</Button>} width={240} placement="bottom-end">
            {(close) => (
              <div className="p-2">
                <AddStatusForm
                  onCancel={close}
                  onAdd={(name, category) => {
                    addStatus(project.id, { name, category }, null)
                    close()
                  }}
                />
              </div>
            )}
          </Popover>
        </div>
        {unmapped.length === 0 ? (
          <div className="text-[13px] text-subtle">All statuses are mapped to a column. 🛹</div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-3">
            {unmapped.map((s) => (
              <StatusChip
                key={s.id}
                project={project}
                status={s}
                count={issueCounts.get(s.id) ?? 0}
                columns={project.columns}
                currentColumnId={null}
                onDelete={() => {
                  setDeleting(s)
                  setMoveTo(project.statuses.find((x) => x.id !== s.id)?.id ?? null)
                }}
              />
            ))}
          </div>
        )}
      </div>

      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete status “${deleting?.name}”?`}
        width={480}
        footer={
          <>
            <Button variant="subtle" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={!moveTo}
              onClick={() => {
                if (!deleting || !moveTo) return
                removeStatus(project.id, deleting.id, moveTo)
                toast({ title: `Status “${deleting.name}” deleted` })
                setDeleting(null)
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="mb-4 text-sm text-muted">
          {issueCounts.get(deleting?.id ?? '') ?? 0} issue(s) currently use this status. Choose where they should move.
        </p>
        <Field label="Move issues to">
          <Select
            value={moveTo}
            onChange={setMoveTo}
            options={project.statuses.filter((s) => s.id !== deleting?.id).map((s) => ({ value: s.id, label: s.name }))}
          />
        </Field>
      </Modal>
    </div>
  )
}
