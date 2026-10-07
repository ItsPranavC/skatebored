import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Mail, Pencil, Search, UserPlus } from 'lucide-react'
import { useMe, useStore } from '@/store/store'
import { toast } from '@/store/ui'
import { Avatar, IssueTypeIcon, StatusLozenge, StoryPoints, useIssueModal } from '@/components/jira'
import { Modal } from '@/components/ui/overlay'
import { Button, EmptyState, Field, Input, PageHeader, ProgressBar } from '@/components/ui/primitives'
import { ProjectAvatar } from '@/layout/TopNav'
import { cn, EPIC_COLORS, timeAgo } from '@/lib/utils'
import type { Issue, Project, User } from '@/types'

function useOpenCounts() {
  const issues = useStore((s) => s.issues)
  const projects = useStore((s) => s.projects)
  return useMemo(() => {
    const done = new Set(projects.flatMap((p) => p.statuses.filter((s) => s.category === 'done').map((s) => s.id)))
    const m = new Map<string, number>()
    for (const i of issues) if (i.assigneeId && !done.has(i.statusId)) m.set(i.assigneeId, (m.get(i.assigneeId) ?? 0) + 1)
    return m
  }, [issues, projects])
}

function UserFormModal({ open, onClose, user }: { open: boolean; onClose: () => void; user?: User }) {
  const createUser = useStore((s) => s.createUser)
  const updateUser = useStore((s) => s.updateUser)
  const users = useStore((s) => s.users)
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [title, setTitle] = useState('')
  const [color, setColor] = useState(EPIC_COLORS[0]!)
  const [err, setErr] = useState<{ name?: string; email?: string }>({})
  useEffect(() => {
    if (open) {
      setName(user?.name ?? '')
      setEmail(user?.email ?? '')
      setTitle(user?.title ?? '')
      setColor(user?.color ?? EPIC_COLORS[users.length % EPIC_COLORS.length]!)
      setErr({})
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const save = () => {
    const e: typeof err = {}
    if (!name.trim()) e.name = 'Name is required'
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) e.email = 'Enter a valid email'
    else if (users.some((u) => u.email.toLowerCase() === email.trim().toLowerCase() && u.id !== user?.id)) e.email = 'Someone already uses this email'
    setErr(e)
    if (Object.keys(e).length) return
    if (user) {
      updateUser(user.id, { name: name.trim(), email: email.trim(), title: title.trim(), color })
      toast({ title: 'Profile updated', tone: 'success' })
    } else {
      const u = createUser({ name: name.trim(), email: email.trim(), title: title.trim() || 'Team member', color })
      toast({ title: `${u.name} added to skatebored`, tone: 'success' })
      navigate(`/people/${u.id}`)
    }
    onClose()
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={user ? 'Edit profile' : 'Add people to skatebored'}
      width={480}
      footer={
        <>
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save}>
            {user ? 'Save' : 'Add'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Full name" required error={err.name}>
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Email" required error={err.email}>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@skatebored.org" />
        </Field>
        <Field label="Job title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Frontend Engineer" />
        </Field>
        <Field label="Avatar colour">
          <div className="flex flex-wrap gap-1.5">
            {EPIC_COLORS.map((c) => (
              <button key={c} type="button" onClick={() => setColor(c)} className={cn('size-8 rounded-full', color === c && 'ring-2 ring-fg ring-offset-2 ring-offset-surface')} style={{ background: c }} aria-label={`Colour ${c}`} />
            ))}
          </div>
        </Field>
      </div>
    </Modal>
  )
}

function Directory() {
  const users = useStore((s) => s.users)
  const counts = useOpenCounts()
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  const list = users.filter((u) => !q || `${u.name} ${u.email} ${u.title}`.toLowerCase().includes(q.toLowerCase()))
  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader
        title="People"
        actions={
          <Button variant="primary" icon={<UserPlus className="size-4" />} onClick={() => setAdding(true)}>
            Add people
          </Button>
        }
      >
        <div className="relative w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people by name, email or title" className="pl-9" />
        </div>
      </PageHeader>
      <div className="px-8 pb-10">
        {list.length === 0 ? (
          <EmptyState icon="🔍" title="Nobody by that name">Try another search, or add them to skatebored.</EmptyState>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {list.map((u) => (
              <Link key={u.id} to={`/people/${u.id}`} className="group flex flex-col items-center rounded-2xl border border-line bg-surface p-6 text-center transition hover:-translate-y-0.5 hover:border-line-strong hover:bg-surface-2">
                <Avatar user={u} size="xl" showTooltip={false} />
                <div className="mt-3 font-semibold tracking-[-0.02em] group-hover:text-accent">{u.name}</div>
                <div className="text-[13px] text-muted">{u.title}</div>
                <div className="mt-1 truncate text-[12px] text-subtle">{u.email}</div>
                <div className="mt-3 rounded-full bg-surface-3 px-2.5 py-0.5 text-[11px] font-semibold text-muted">{counts.get(u.id) ?? 0} open issues</div>
              </Link>
            ))}
          </div>
        )}
      </div>
      <UserFormModal open={adding} onClose={() => setAdding(false)} />
    </div>
  )
}

function Profile({ user }: { user: User }) {
  const me = useMe()
  const issues = useStore((s) => s.issues)
  const projects = useStore((s) => s.projects)
  const comments = useStore((s) => s.comments)
  const { open } = useIssueModal()
  const [editing, setEditing] = useState(false)

  const projectOf = (i: Issue) => projects.find((p) => p.id === i.projectId) as Project | undefined
  const catOf = (i: Issue) => projectOf(i)?.statuses.find((s) => s.id === i.statusId)?.category ?? 'todo'
  const assigned = issues.filter((i) => i.assigneeId === user.id)
  const workedOn = [...assigned, ...issues.filter((i) => i.reporterId === user.id && i.assigneeId !== user.id)]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 12)
  const places = projects.filter((p) => p.memberIds.includes(user.id) || p.leadId === user.id)
  const open_ = assigned.filter((i) => catOf(i) !== 'done')
  const todo = open_.filter((i) => catOf(i) === 'todo')
  const prog = open_.filter((i) => catOf(i) === 'inprogress')
  const points = open_.reduce((n, i) => n + (i.storyPoints ?? 0), 0)
  const commentCount = comments.filter((c) => c.authorId === user.id).length

  return (
    <div className="mx-auto max-w-[1200px] px-8 pt-6 pb-12">
      <Link to="/people" className="mb-5 inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg">
        <ArrowLeft className="size-3.5" /> People
      </Link>
      <div className="relative overflow-hidden rounded-3xl border border-line bg-surface p-8">
        <div className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full opacity-25 blur-3xl" style={{ background: user.color }} />
        <div className="relative flex flex-wrap items-end gap-6">
          <span className="grid size-28 place-items-center rounded-full text-4xl font-bold text-[#160707]" style={{ background: user.color }}>
            {user.name
              .split(' ')
              .map((p) => p[0])
              .slice(0, 2)
              .join('')}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="display text-[clamp(2.2rem,5vw,4rem)]">
              {user.name.split(' ')[0]}
              <span className="text-accent">.</span>
            </h1>
            <div className="mt-1 text-lg text-muted">
              {user.name} · {user.title}
            </div>
            <a href={`mailto:${user.email}`} className="mt-2 inline-flex items-center gap-1.5 text-[13px] text-subtle hover:text-accent">
              <Mail className="size-3.5" /> {user.email}
            </a>
          </div>
          {me.id === user.id && (
            <Button icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>
              Edit profile
            </Button>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <section>
          <h2 className="mb-3 text-[13px] font-semibold tracking-wide text-subtle uppercase">Worked on</h2>
          {workedOn.length === 0 ? (
            <div className="rounded-xl border border-line p-6 text-sm text-muted">Nothing yet.</div>
          ) : (
            <div className="divide-y divide-line rounded-xl border border-line bg-surface">
              {workedOn.map((i) => {
                const p = projectOf(i)
                return (
                  <button key={i.id} onClick={() => open(i.key)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-hover">
                    <IssueTypeIcon type={i.type} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium">{i.summary}</div>
                      <div className="text-[11px] text-subtle">
                        {i.key} · {p?.name} · updated {timeAgo(i.updatedAt)}
                      </div>
                    </div>
                    <StoryPoints value={i.storyPoints} />
                    <StatusLozenge status={p?.statuses.find((s) => s.id === i.statusId)} />
                  </button>
                )
              })}
            </div>
          )}
        </section>

        <aside className="space-y-6">
          <section className="rounded-xl border border-line bg-surface p-5">
            <h2 className="mb-3 text-[13px] font-semibold tracking-wide text-subtle uppercase">Current workload</h2>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                ['Open', open_.length],
                ['Points', points],
                ['Comments', commentCount],
              ].map(([l, n]) => (
                <div key={l as string} className="rounded-lg bg-surface-2 py-3">
                  <div className="display text-2xl">{n}</div>
                  <div className="text-[11px] text-muted">{l}</div>
                </div>
              ))}
            </div>
            <ProgressBar
              className="mt-4"
              segments={[
                { value: prog.length, color: 'var(--info)', label: 'In progress' },
                { value: todo.length, color: 'var(--line-strong)', label: 'To do' },
              ]}
            />
            <div className="mt-1.5 flex justify-between text-[11px] text-subtle">
              <span>{prog.length} in progress</span>
              <span>{todo.length} to do</span>
            </div>
          </section>
          <section className="rounded-xl border border-line bg-surface p-5">
            <h2 className="mb-3 text-[13px] font-semibold tracking-wide text-subtle uppercase">Places they work</h2>
            {places.length === 0 && <div className="text-[13px] text-muted">Not a member of any project.</div>}
            <div className="space-y-1">
              {places.map((p) => (
                <Link key={p.id} to={`/projects/${p.key}/board`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-hover">
                  <ProjectAvatar project={p} size={28} />
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium">{p.name}</div>
                    <div className="text-[11px] text-subtle">{p.leadId === user.id ? 'Project lead' : 'Member'}</div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        </aside>
      </div>
      <UserFormModal open={editing} onClose={() => setEditing(false)} user={user} />
    </div>
  )
}

export default function PeoplePage() {
  const { userId } = useParams()
  const users = useStore((s) => s.users)
  if (!userId) return <Directory />
  const user = users.find((u) => u.id === userId)
  if (!user) return <EmptyState icon="👻" title="Person not found" action={<Link to="/people" className="text-accent hover:underline">Back to people</Link>} />
  return <Profile user={user} />
}
