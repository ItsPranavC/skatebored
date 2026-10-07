import { useEffect, useRef, useState, useLayoutEffect, type MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { ArrowDownToLine, ArrowUpToLine, ExternalLink, Flag, FlagOff, Link2, Trash2, UserCheck, CornerDownRight, Copy } from 'lucide-react'
import type { Issue, Project } from '@/types'
import { useStore } from '@/store/store'
import { toast } from '@/store/ui'
import { cn } from '@/lib/utils'
import { ConfirmDialog, type MenuItem } from '@/components/ui/overlay'
import { useIssueModal } from '@/components/jira'

export interface IssueMenuContext {
  /** ordered ids of the container the issue lives in (for top/bottom moves) */
  containerIds?: string[]
  /** show "move to sprint" options */
  sprintMoves?: boolean
  /** show "change status" options */
  statusMoves?: boolean
  /** ids acted on together (multi-select); defaults to [issue.id] */
  selection?: string[]
}

/** Shared ⋯ / right-click actions for issues on the board and backlog. */
export function useIssueMenu(project: Project) {
  const [toDelete, setToDelete] = useState<string[] | null>(null)
  const { open } = useIssueModal()
  const s = useStore()

  const items = (issue: Issue, ctx: IssueMenuContext = {}): MenuItem[] => {
    const ids = ctx.selection && ctx.selection.includes(issue.id) && ctx.selection.length > 1 ? ctx.selection : [issue.id]
    const many = ids.length > 1
    const out: MenuItem[] = []
    if (!many) out.push({ label: 'Open issue', icon: <ExternalLink className="size-4" />, onClick: () => open(issue.key) })
    out.push({
      label: 'Copy link',
      icon: <Link2 className="size-4" />,
      onClick: () => {
        void navigator.clipboard?.writeText(`${location.origin}/browse/${issue.key}`).catch(() => {})
        toast({ title: 'Link copied', description: issue.key })
      },
    })
    if (ctx.containerIds && ctx.containerIds.length > 1) {
      const rest = ctx.containerIds.filter((x) => !ids.includes(x))
      out.push(
        { divider: true, label: '' },
        { label: 'Move to top', icon: <ArrowUpToLine className="size-4" />, onClick: () => s.rankIssues([...ids, ...rest]) },
        { label: 'Move to bottom', icon: <ArrowDownToLine className="size-4" />, onClick: () => s.rankIssues([...rest, ...ids]) },
      )
    }
    if (ctx.sprintMoves) {
      const sprints = s.sprints
        .filter((sp) => sp.projectId === project.id && sp.state !== 'closed')
        .sort((a, b) => (a.state === 'active' ? -1 : b.state === 'active' ? 1 : a.order - b.order))
      const targets = [...sprints.filter((sp) => sp.id !== issue.sprintId).map((sp) => ({ id: sp.id as string | null, name: sp.name })), ...(issue.sprintId ? [{ id: null, name: 'Backlog' }] : [])]
      if (targets.length) {
        out.push({ divider: true, label: '' }, { heading: true, label: 'Move to' })
        for (const t of targets)
          out.push({
            label: t.name,
            icon: <CornerDownRight className="size-4" />,
            onClick: () => {
              s.moveToSprint(ids, t.id)
              toast({ title: `${many ? `${ids.length} issues` : issue.key} moved to ${t.name}`, tone: 'success' })
            },
          })
      }
    }
    if (ctx.statusMoves && !many) {
      out.push({ divider: true, label: '' }, { heading: true, label: 'Change status' })
      for (const st of project.statuses)
        out.push({ label: st.name, checked: st.id === issue.statusId, onClick: () => st.id !== issue.statusId && s.updateIssue(issue.id, { statusId: st.id }) })
    }
    out.push({ divider: true, label: '' })
    if (!many && issue.assigneeId !== s.currentUserId)
      out.push({ label: 'Assign to me', icon: <UserCheck className="size-4" />, onClick: () => s.updateIssue(issue.id, { assigneeId: s.currentUserId }) })
    if (many) out.push({ label: `Assign ${ids.length} to me`, icon: <UserCheck className="size-4" />, onClick: () => ids.forEach((id) => s.updateIssue(id, { assigneeId: s.currentUserId })) })
    out.push(
      issue.flagged
        ? { label: many ? 'Remove flags' : 'Remove flag', icon: <FlagOff className="size-4" />, onClick: () => ids.forEach((id) => s.updateIssue(id, { flagged: false })) }
        : {
            label: many ? 'Add flags' : 'Add flag',
            icon: <Flag className="size-4" />,
            onClick: () => {
              ids.forEach((id) => s.updateIssue(id, { flagged: true }))
              toast({ title: 'Flag added', description: 'This issue is now marked as an impediment.' })
            },
          },
    )
    if (!many)
      out.push({
        label: 'Clone',
        icon: <Copy className="size-4" />,
        onClick: () => {
          const c = s.cloneIssue(issue.id)
          if (c) toast({ title: `${c.key} created`, tone: 'success', action: { label: 'View', onClick: () => open(c.key) } })
        },
      })
    out.push({ divider: true, label: '' }, { label: many ? `Delete ${ids.length} issues` : 'Delete', icon: <Trash2 className="size-4" />, danger: true, onClick: () => setToDelete(ids) })
    return out
  }

  const keys = toDelete?.map((id) => s.issues.find((i) => i.id === id)?.key).filter(Boolean) ?? []
  const dialog = (
    <ConfirmDialog
      open={!!toDelete}
      onClose={() => setToDelete(null)}
      onConfirm={() => {
        toDelete?.forEach((id) => s.deleteIssue(id))
        toast({ title: `Deleted ${keys.join(', ')}` })
      }}
      title={keys.length > 1 ? `Delete ${keys.length} issues?` : `Delete ${keys[0] ?? 'issue'}?`}
    >
      You’re about to permanently delete {keys.length > 1 ? 'these issues' : 'this issue'}, including comments, attachments, history and any sub-tasks. If you’re not sure, resolve or close it instead.
    </ConfirmDialog>
  )
  return { items, dialog }
}

/** A menu that opens at the cursor (right-click). */
export function ContextMenu({ at, items, onClose }: { at: { x: number; y: number } | null; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  useLayoutEffect(() => {
    if (!at || !ref.current) return setPos(null)
    const w = ref.current.offsetWidth
    const h = ref.current.offsetHeight
    setPos({ x: Math.min(at.x, window.innerWidth - w - 8), y: Math.max(8, Math.min(at.y, window.innerHeight - h - 8)) })
  }, [at])
  useEffect(() => {
    if (!at) return
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose()
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('mousedown', down)
    document.addEventListener('keydown', key)
    window.addEventListener('scroll', onClose, true)
    return () => {
      document.removeEventListener('mousedown', down)
      document.removeEventListener('keydown', key)
      window.removeEventListener('scroll', onClose, true)
    }
  }, [at, onClose])
  if (!at) return null
  return createPortal(
    <div
      ref={ref}
      role="menu"
      className="animate-pop fixed z-[1000] max-h-[80vh] w-[220px] overflow-auto rounded-xl border border-line bg-surface-2 py-1.5 shadow-pop"
      style={{ left: pos?.x ?? at.x, top: pos?.y ?? at.y, visibility: pos ? 'visible' : 'hidden' }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((it, i) =>
        it.divider ? (
          <div key={i} className="my-1.5 h-px bg-line" />
        ) : it.heading ? (
          <div key={i} className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-subtle uppercase">
            {it.label}
          </div>
        ) : (
          <button
            key={i}
            role="menuitem"
            disabled={it.disabled}
            onClick={() => {
              onClose()
              it.onClick?.()
            }}
            className={cn('flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] hover:bg-hover disabled:opacity-40', it.danger ? 'text-accent' : 'text-fg')}
          >
            {it.icon && <span className="grid w-4 place-items-center text-muted">{it.icon}</span>}
            <span className="flex-1 truncate">{it.label}</span>
            {it.checked && <span className="size-1.5 rounded-full bg-accent" />}
          </button>
        ),
      )}
    </div>,
    document.body,
  )
}

/** Convenience: state + handler for a right-click menu. */
export function useContextMenu() {
  const [state, setState] = useState<{ at: { x: number; y: number }; issueId: string } | null>(null)
  return {
    state,
    openAt: (e: ReactMouseEvent, issueId: string) => {
      e.preventDefault()
      setState({ at: { x: e.clientX, y: e.clientY }, issueId })
    },
    close: () => setState(null),
  }
}
