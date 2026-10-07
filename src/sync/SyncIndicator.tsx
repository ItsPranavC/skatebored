import { AlertTriangle, CloudCheck, CloudOff, Download, Loader2, RefreshCw } from 'lucide-react'
import { Popover } from '@/components/ui/overlay'
import { Button } from '@/components/ui/primitives'
import { cn, download, timeAgo } from '@/lib/utils'
import { syncNow, useSyncStatus } from './engine'

/** Top-bar cloud status: saved / saving / offline (changes queued) / needs attention. */
export function SyncIndicator() {
  const { phase, pending, lastSyncedAt, error, rejected } = useSyncStatus()
  const problem = phase === 'error' || rejected.length > 0
  const icon =
    phase === 'saving' || phase === 'connecting' ? (
      <Loader2 className="size-4 animate-spin" />
    ) : phase === 'offline' ? (
      <CloudOff className="size-4" />
    ) : problem ? (
      <AlertTriangle className="size-4" />
    ) : (
      <CloudCheck className="size-4" />
    )
  const label = phase === 'saving' ? 'Saving…' : phase === 'connecting' ? 'Connecting…' : phase === 'offline' ? `Offline${pending ? ` · ${pending} queued` : ''}` : problem ? 'Needs attention' : 'Saved'
  return (
    <Popover
      width={300}
      placement="bottom-end"
      trigger={
        <button
          className={cn(
            'mr-1 flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium transition hover:bg-hover',
            problem ? 'text-accent' : phase === 'offline' ? 'text-warn' : 'text-muted',
          )}
          aria-label={`Cloud sync: ${label}`}
        >
          {icon}
          <span className="hidden xl:inline">{label}</span>
        </button>
      }
    >
      <div className="space-y-3 p-4 text-[13px]">
        <div className="font-semibold">{phase === 'offline' ? 'You’re offline' : problem ? 'Some changes need attention' : 'All changes saved to the cloud'}</div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
          <dt className="text-subtle">Last synced</dt>
          <dd>{lastSyncedAt ? timeAgo(lastSyncedAt) : '—'}</dd>
          <dt className="text-subtle">Waiting to send</dt>
          <dd>{pending}</dd>
        </dl>
        {phase === 'offline' && <p className="text-[12px] text-muted">Keep working — changes are stored on this device and sent automatically when you’re back online.</p>}
        {error && phase !== 'synced' && <p className="text-[12px] text-accent">{error}</p>}
        {rejected.length > 0 && (
          <div className="rounded-lg border border-accent/40 bg-accent-soft p-2.5 text-[12px]">
            {rejected.length} change{rejected.length > 1 ? 's were' : ' was'} refused by the server ({rejected[0]!.reason}). They’re kept on this device.
            <button
              className="mt-1.5 flex items-center gap-1 font-semibold text-accent hover:underline"
              onClick={() => download('skatebored-unsaved-changes.json', localStorage.getItem('skatebored-rejected') ?? '[]', 'application/json')}
            >
              <Download className="size-3.5" /> Download them
            </button>
          </div>
        )}
        <Button size="sm" icon={<RefreshCw className="size-3.5" />} onClick={() => void syncNow()}>
          Sync now
        </Button>
      </div>
    </Popover>
  )
}
