import { useState } from 'react'
import { Bell, CheckCheck } from 'lucide-react'
import { isToday } from 'date-fns'
import { useStore } from '@/store/store'
import { Popover } from '@/components/ui/overlay'
import { Button, Toggle } from '@/components/ui/primitives'
import { Avatar, IssueTypeIcon, useIssueModal } from '@/components/jira'
import { cn, timeAgo } from '@/lib/utils'
import type { Notification } from '@/types'

export function NotificationsButton() {
  const me = useStore((s) => s.currentUserId)
  const all = useStore((s) => s.notifications)
  const issues = useStore((s) => s.issues)
  const users = useStore((s) => s.users)
  const markRead = useStore((s) => s.markNotificationRead)
  const markAll = useStore((s) => s.markAllNotificationsRead)
  const { open: openIssue } = useIssueModal()
  const [onlyUnread, setOnlyUnread] = useState(false)
  const [tab, setTab] = useState<'direct' | 'watching'>('direct')

  const mine = all.filter((n) => n.userId === me).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const unread = mine.filter((n) => !n.read).length
  const isDirect = (n: Notification) => /assigned you|mentioned you/.test(n.text)
  const list = mine.filter((n) => (tab === 'direct' ? isDirect(n) || n.text === 'commented on' : !isDirect(n))).filter((n) => !onlyUnread || !n.read)
  const today = list.filter((n) => isToday(new Date(n.createdAt)))
  const older = list.filter((n) => !isToday(new Date(n.createdAt)))

  const Row = ({ n, close }: { n: Notification; close: () => void }) => {
    const issue = issues.find((i) => i.id === n.issueId)
    const actor = users.find((u) => u.id === n.actorId)
    if (!issue) return null
    return (
      <button
        onClick={() => {
          markRead(n.id)
          close()
          openIssue(issue.key)
        }}
        className={cn('flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-hover', !n.read && 'bg-accent-soft/40')}
      >
        <Avatar user={actor} size="md" showTooltip={false} />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] leading-snug">
            <span className="font-semibold">{actor?.name.split(' ')[0] ?? 'Someone'}</span> <span className="text-muted">{n.text}</span>{' '}
            <span className="font-semibold">{issue.key}</span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[12px] text-muted">
            <IssueTypeIcon type={issue.type} className="size-3.5" />
            <span className="truncate">{issue.summary}</span>
          </div>
          <div className="mt-1 text-[11px] text-subtle">{timeAgo(n.createdAt)}</div>
        </div>
        {!n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-accent" aria-label="Unread" />}
      </button>
    )
  }

  return (
    <Popover
      placement="bottom-end"
      width={420}
      trigger={
        <button className="relative grid size-8 place-items-center rounded-lg text-muted transition hover:bg-hover hover:text-fg" aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}>
          <Bell className="size-[18px]" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-ink">{unread > 9 ? '9+' : unread}</span>
          )}
        </button>
      }
    >
      {(close) => (
        <div className="flex max-h-[600px] flex-col">
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <h2 className="display text-xl">Notifications</h2>
            <Toggle checked={onlyUnread} onChange={setOnlyUnread} label={<span className="text-xs text-muted">Only show unread</span>} />
          </div>
          <div className="flex items-center justify-between border-b border-line px-4">
            <div className="flex gap-1">
              {(['direct', 'watching'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cn('-mb-px border-b-2 px-2 pb-2 text-[13px] font-medium capitalize', tab === t ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg')}
                >
                  {t}
                </button>
              ))}
            </div>
            {unread > 0 && (
              <Button variant="ghost" size="xs" icon={<CheckCheck className="size-3.5" />} onClick={markAll} className="mb-1">
                Mark all as read
              </Button>
            )}
          </div>
          <div className="overflow-y-auto">
            {list.length === 0 && (
              <div className="px-6 py-12 text-center">
                <div className="mb-2 text-4xl">🛹</div>
                <div className="font-semibold">You’re all caught up</div>
                <div className="mt-1 text-[13px] text-muted">{onlyUnread ? 'No unread notifications.' : 'Nothing here yet.'}</div>
              </div>
            )}
            {today.length > 0 && <div className="px-4 pt-3 pb-1 text-[11px] font-semibold tracking-wide text-subtle uppercase">Today</div>}
            {today.map((n) => (
              <Row key={n.id} n={n} close={close} />
            ))}
            {older.length > 0 && <div className="px-4 pt-3 pb-1 text-[11px] font-semibold tracking-wide text-subtle uppercase">Older</div>}
            {older.map((n) => (
              <Row key={n.id} n={n} close={close} />
            ))}
          </div>
        </div>
      )}
    </Popover>
  )
}
