import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { MoreHorizontal, Plus, Search, Star } from 'lucide-react'
import { useStore } from '@/store/store'
import { toast } from '@/store/ui'
import { Avatar } from '@/components/jira'
import { ConfirmDialog, Menu, Modal } from '@/components/ui/overlay'
import { Button, EmptyState, Field, Input, PageHeader, Tabs, Textarea } from '@/components/ui/primitives'
import { cn, fmtDate } from '@/lib/utils'
import { useJql } from '@/lib/useJql'
import type { SavedFilter } from '@/types'

function Count({ jql }: { jql: string }) {
  const r = useJql(jql)
  return <span className={cn('tabular-nums', r.error ? 'text-accent' : 'text-muted')}>{r.error ? 'error' : r.issues.length}</span>
}

export default function FiltersPage() {
  const navigate = useNavigate()
  const filters = useStore((s) => s.filters)
  const users = useStore((s) => s.users)
  const me = useStore((s) => s.currentUserId)
  const updateFilter = useStore((s) => s.updateFilter)
  const deleteFilter = useStore((s) => s.deleteFilter)
  const [tab, setTab] = useState<'all' | 'starred' | 'mine'>('all')
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<SavedFilter | null>(null)
  const [draft, setDraft] = useState({ name: '', jql: '' })
  const [deleting, setDeleting] = useState<SavedFilter | null>(null)

  const list = filters
    .filter((f) => (tab === 'starred' ? f.starred : tab === 'mine' ? f.ownerId === me : true))
    .filter((f) => f.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => Number(b.starred) - Number(a.starred) || a.name.localeCompare(b.name))

  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader
        title="Filters"
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => navigate('/issues')}>
            Create filter
          </Button>
        }
      >
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'all', label: 'All filters' },
            { id: 'starred', label: 'Starred' },
            { id: 'mine', label: 'My filters' },
          ]}
        />
        <div className="relative mt-4 w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search filters" className="pl-9" />
        </div>
      </PageHeader>

      <div className="px-8 pb-10">
        {list.length === 0 ? (
          <EmptyState icon="🔍" title="No filters here" action={<Button variant="primary" onClick={() => navigate('/issues')}>Create a filter</Button>}>
            Save any search from the issue navigator to reuse it, share it, or power dashboard gadgets.
          </EmptyState>
        ) : (
          <div className="overflow-hidden rounded-xl border border-line">
            <table className="w-full text-[13px]">
              <thead className="bg-surface-2 text-left text-xs font-semibold text-muted">
                <tr>
                  <th className="w-10 px-3 py-2.5" />
                  <th className="px-3 py-2.5">Name</th>
                  <th className="px-3 py-2.5">Owner</th>
                  <th className="px-3 py-2.5">Query</th>
                  <th className="px-3 py-2.5 text-right">Issues</th>
                  <th className="px-3 py-2.5">Created</th>
                  <th className="w-12" />
                </tr>
              </thead>
              <tbody>
                {list.map((f) => {
                  const owner = users.find((u) => u.id === f.ownerId)
                  return (
                    <tr key={f.id} className="border-t border-line hover:bg-hover">
                      <td className="px-3 py-2.5">
                        <button onClick={() => updateFilter(f.id, { starred: !f.starred })} aria-label={f.starred ? 'Unstar' : 'Star'}>
                          <Star className={cn('size-4', f.starred ? 'fill-warn text-warn' : 'text-subtle hover:text-fg')} />
                        </button>
                      </td>
                      <td className="px-3 py-2.5">
                        <Link to={`/issues?filter=${f.id}`} className="font-medium hover:text-accent hover:underline">
                          {f.name}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="flex items-center gap-2">
                          <Avatar user={owner} size="xs" />
                          {owner?.name}
                        </span>
                      </td>
                      <td className="max-w-[380px] px-3 py-2.5">
                        <code className="block truncate font-mono text-[12px] text-muted" title={f.jql}>
                          {f.jql}
                        </code>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <Count jql={f.jql} />
                      </td>
                      <td className="px-3 py-2.5 text-muted">{fmtDate(f.createdAt)}</td>
                      <td className="px-2">
                        <Menu
                          trigger={<Button variant="ghost" size="xs" icon={<MoreHorizontal className="size-4" />} aria-label="Filter actions" />}
                          items={[
                            { label: 'Open', onClick: () => navigate(`/issues?filter=${f.id}`) },
                            {
                              label: 'Edit details',
                              disabled: f.ownerId !== me,
                              onClick: () => {
                                setDraft({ name: f.name, jql: f.jql })
                                setEditing(f)
                              },
                            },
                            { label: f.starred ? 'Unstar' : 'Star', onClick: () => updateFilter(f.id, { starred: !f.starred }) },
                            { divider: true, label: '' },
                            { label: 'Delete', danger: true, disabled: f.ownerId !== me, onClick: () => setDeleting(f) },
                          ]}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Edit filter"
        footer={
          <>
            <Button variant="subtle" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!draft.name.trim()}
              onClick={() => {
                updateFilter(editing!.id, { name: draft.name.trim(), jql: draft.jql })
                setEditing(null)
                toast({ title: 'Filter updated', tone: 'success' })
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Name" required>
            <Input autoFocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </Field>
          <Field label="JQL">
            <Textarea rows={4} className="font-mono text-[13px]" value={draft.jql} onChange={(e) => setDraft({ ...draft, jql: e.target.value })} />
          </Field>
        </div>
      </Modal>
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          deleteFilter(deleting!.id)
          toast({ title: `Deleted “${deleting!.name}”` })
        }}
        title="Delete filter?"
      >
        “{deleting?.name}” will be permanently deleted. Dashboard gadgets using it will stop showing results.
      </ConfirmDialog>
    </div>
  )
}
