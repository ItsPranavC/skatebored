import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { ArrowDownUp, ArrowRight, Trash2 } from 'lucide-react'
import type { Comment, HistoryEntry, Issue, Project, WorkLog } from '@/types'
import { useMe, useStore } from '@/store/store'
import { Avatar, StatusLozenge } from '@/components/jira'
import { Button, Kbd, Tabs } from '@/components/ui/primitives'
import { ConfirmDialog } from '@/components/ui/overlay'
import { cn, fmtDate, fmtDuration, timeAgo } from '@/lib/utils'
import { RichText } from './RichText'
import { MentionTextarea, type MentionTextareaHandle } from './editors'

type Tab = 'all' | 'comments' | 'history' | 'worklog'

export interface ActivityHandle {
  openComment: () => void
}

export const Activity = forwardRef<ActivityHandle, { issue: Issue; project: Project }>(function Activity({ issue, project }, ref) {
  const me = useMe()
  const allComments = useStore((s) => s.comments)
  const allHistory = useStore((s) => s.history)
  const allWorklogs = useStore((s) => s.worklogs)
  const addComment = useStore((s) => s.addComment)
  const [tab, setTab] = useState<Tab>('comments')
  const [newestFirst, setNewestFirst] = useState(true)
  const [composing, setComposing] = useState(false)
  const [draft, setDraft] = useState('')
  const editorRef = useRef<MentionTextareaHandle>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useImperativeHandle(ref, () => ({
    openComment: () => {
      setTab((t) => (t === 'all' || t === 'comments' ? t : 'comments'))
      setComposing(true)
      requestAnimationFrame(() => {
        editorRef.current?.focus()
        wrapRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      })
    },
  }))

  const comments = useMemo(() => allComments.filter((c) => c.issueId === issue.id), [allComments, issue.id])
  const history = useMemo(() => allHistory.filter((h) => h.issueId === issue.id), [allHistory, issue.id])
  const worklogs = useMemo(() => allWorklogs.filter((w) => w.issueId === issue.id), [allWorklogs, issue.id])

  type Row = { kind: 'comment'; at: string; c: Comment } | { kind: 'history'; at: string; h: HistoryEntry } | { kind: 'worklog'; at: string; w: WorkLog }
  const rows: Row[] = useMemo(() => {
    const r: Row[] = []
    if (tab === 'all' || tab === 'comments') r.push(...comments.map((c) => ({ kind: 'comment' as const, at: c.createdAt, c })))
    if (tab === 'all' || tab === 'history') r.push(...history.map((h) => ({ kind: 'history' as const, at: h.createdAt, h })))
    if (tab === 'all' || tab === 'worklog') r.push(...worklogs.map((w) => ({ kind: 'worklog' as const, at: w.startedAt, w })))
    r.sort((a, b) => (newestFirst ? b.at.localeCompare(a.at) : a.at.localeCompare(b.at)))
    return r
  }, [tab, comments, history, worklogs, newestFirst])

  const save = () => {
    if (!draft.trim()) return
    addComment(issue.id, draft.trim())
    setDraft('')
    setComposing(false)
  }

  return (
    <section ref={wrapRef}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[15px] font-semibold tracking-[-0.01em]">Activity</h3>
        <Button variant="ghost" size="xs" icon={<ArrowDownUp className="size-3.5" />} onClick={() => setNewestFirst((v) => !v)} className="px-2">
          {newestFirst ? 'Newest first' : 'Oldest first'}
        </Button>
      </div>
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        className="mb-4"
        tabs={[
          { id: 'all', label: 'All' },
          { id: 'comments', label: `Comments${comments.length ? ` (${comments.length})` : ''}` },
          { id: 'history', label: 'History' },
          { id: 'worklog', label: `Work log${worklogs.length ? ` (${worklogs.length})` : ''}` },
        ]}
      />

      {(tab === 'all' || tab === 'comments') && (
        <div className="mb-5 flex gap-3">
          <Avatar user={me} size="md" />
          <div className="min-w-0 flex-1">
            {composing ? (
              <>
                <MentionTextarea
                  ref={editorRef}
                  autoFocus
                  value={draft}
                  onChange={setDraft}
                  onSubmit={save}
                  onCancel={() => {
                    setComposing(false)
                    setDraft('')
                  }}
                  placeholder="Add a comment… Type @ to mention a teammate"
                />
                <div className="mt-2 flex items-center gap-2">
                  <Button variant="primary" onClick={save} disabled={!draft.trim()}>
                    Save
                  </Button>
                  <Button
                    variant="subtle"
                    onClick={() => {
                      setComposing(false)
                      setDraft('')
                    }}
                  >
                    Cancel
                  </Button>
                  <span className="ml-auto text-[11px] text-subtle">
                    <Kbd>⌘</Kbd> <Kbd>Enter</Kbd> to save
                  </span>
                </div>
              </>
            ) : (
              <>
                <button
                  onClick={() => {
                    setComposing(true)
                    requestAnimationFrame(() => editorRef.current?.focus())
                  }}
                  className="h-10 w-full rounded-lg border border-line bg-surface-2 px-3 text-left text-sm text-subtle transition hover:border-line-strong hover:bg-surface-3"
                >
                  Add a comment…
                </button>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-subtle">
                  {['Looks good!', 'Need help?', 'This is blocked…', 'Can you clarify…?'].map((q) => (
                    <button
                      key={q}
                      onClick={() => {
                        setDraft(q)
                        setComposing(true)
                      }}
                      className="rounded-full border border-line px-2 py-0.5 text-muted hover:border-line-strong hover:text-fg"
                    >
                      {q}
                    </button>
                  ))}
                  <span className="ml-1">
                    <strong>Pro tip:</strong> press <Kbd>M</Kbd> to comment
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {rows.length === 0 && (
        <p className="py-4 text-center text-[13px] text-subtle">
          {tab === 'worklog' ? 'No work has been logged on this issue yet.' : tab === 'comments' ? 'No comments yet — start the conversation.' : 'Nothing here yet.'}
        </p>
      )}

      <ul className="space-y-4">
        {rows.map((r) =>
          r.kind === 'comment' ? (
            <CommentRow key={r.c.id} c={r.c} />
          ) : r.kind === 'history' ? (
            <HistoryRow key={r.h.id} h={r.h} issue={issue} project={project} />
          ) : (
            <WorklogRow key={r.w.id} w={r.w} />
          ),
        )}
      </ul>
    </section>
  )
})

function CommentRow({ c }: { c: Comment }) {
  const author = useStore((s) => s.users.find((u) => u.id === c.authorId))
  const me = useStore((s) => s.currentUserId)
  const updateComment = useStore((s) => s.updateComment)
  const deleteComment = useStore((s) => s.deleteComment)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(c.body)
  const [confirm, setConfirm] = useState(false)
  const mine = c.authorId === me
  return (
    <li className="group flex gap-3">
      <Avatar user={author} size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
          <span className="font-semibold">{author?.name ?? 'Former user'}</span>
          <span className="text-subtle" title={fmtDate(c.createdAt, 'PPpp')}>
            {timeAgo(c.createdAt)}
          </span>
          {c.updatedAt && <span className="text-subtle">· Edited</span>}
        </div>
        {editing ? (
          <div className="mt-1.5">
            <MentionTextarea
              autoFocus
              value={draft}
              onChange={setDraft}
              rows={3}
              onSubmit={() => {
                if (draft.trim()) updateComment(c.id, draft.trim())
                setEditing(false)
              }}
              onCancel={() => {
                setDraft(c.body)
                setEditing(false)
              }}
            />
            <div className="mt-2 flex gap-2">
              <Button
                variant="primary"
                disabled={!draft.trim()}
                onClick={() => {
                  updateComment(c.id, draft.trim())
                  setEditing(false)
                }}
              >
                Save
              </Button>
              <Button
                variant="subtle"
                onClick={() => {
                  setDraft(c.body)
                  setEditing(false)
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            <RichText text={c.body} className="prose-sb mt-1 text-sm leading-relaxed" />
            {mine && (
              <div className="mt-1 flex gap-3 text-[12px] font-medium text-muted">
                <button className="hover:text-fg hover:underline" onClick={() => setEditing(true)}>
                  Edit
                </button>
                <button className="hover:text-accent hover:underline" onClick={() => setConfirm(true)}>
                  Delete
                </button>
              </div>
            )}
          </>
        )}
      </div>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={() => deleteComment(c.id)} title="Delete this comment?">
        Once you delete, it’s gone for good.
      </ConfirmDialog>
    </li>
  )
}

function HistoryRow({ h, issue, project }: { h: HistoryEntry; issue: Issue; project: Project }) {
  const user = useStore((s) => s.users.find((u) => u.id === h.userId))
  const statusByName = (n: string | null) => project.statuses.find((s) => s.name === n)
  const isStatus = h.field === 'status'
  const clip = (v: string | null) => (v && v.length > 120 ? `${v.slice(0, 120)}…` : v)
  return (
    <li className="flex gap-3">
      <Avatar user={user} size="md" />
      <div className="min-w-0 flex-1 text-[13px]">
        <div className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="font-semibold">{user?.name ?? 'Someone'}</span>
          {h.field === 'created' ? (
            <span className="text-muted">created the {issue.type === 'subtask' ? 'sub-task' : 'issue'}</span>
          ) : (
            <span className="text-muted">
              {h.from == null && h.to != null ? 'set' : h.to == null ? 'removed' : 'changed'} the <strong className="font-semibold text-fg">{h.field}</strong>
            </span>
          )}
          <span className="text-subtle" title={fmtDate(h.createdAt, 'PPpp')}>
            {timeAgo(h.createdAt)}
          </span>
        </div>
        {h.field !== 'created' && (h.from != null || h.to != null) && (
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px]">
            {isStatus ? (
              <>
                {h.from && <StatusLozenge status={statusByName(h.from) ?? { id: '', name: h.from, category: 'todo' }} />}
                <ArrowRight className="size-3.5 text-subtle" />
                {h.to && <StatusLozenge status={statusByName(h.to) ?? { id: '', name: h.to, category: 'todo' }} />}
              </>
            ) : (
              <>
                <span className={cn('max-w-[45%] truncate', h.from ? 'text-muted line-through decoration-subtle' : 'text-subtle italic')}>{clip(h.from) ?? 'None'}</span>
                <ArrowRight className="size-3.5 shrink-0 text-subtle" />
                <span className={cn('max-w-[45%] truncate', !h.to && 'text-subtle italic')}>{clip(h.to) ?? 'None'}</span>
              </>
            )}
          </div>
        )}
      </div>
    </li>
  )
}

function WorklogRow({ w }: { w: WorkLog }) {
  const user = useStore((s) => s.users.find((u) => u.id === w.userId))
  const me = useStore((s) => s.currentUserId)
  const deleteWorklog = useStore((s) => s.deleteWorklog)
  return (
    <li className="group flex gap-3">
      <Avatar user={user} size="md" />
      <div className="min-w-0 flex-1 text-[13px]">
        <div className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="font-semibold">{user?.name}</span>
          <span className="text-muted">logged</span>
          <strong>{fmtDuration(w.minutes)}</strong>
          <span className="text-subtle" title={fmtDate(w.startedAt, 'PPpp')}>
            {timeAgo(w.startedAt)}
          </span>
          {w.userId === me && (
            <button onClick={() => deleteWorklog(w.id)} className="ml-auto text-subtle opacity-0 transition group-hover:opacity-100 hover:text-accent" aria-label="Delete work log">
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
        {w.comment && <p className="mt-0.5 text-muted">{w.comment}</p>}
      </div>
    </li>
  )
}
