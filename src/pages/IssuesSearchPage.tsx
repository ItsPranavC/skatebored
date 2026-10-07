import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Columns3, Download, HelpCircle, Info, LayoutList, PanelLeft, Star } from 'lucide-react'
import { useMe, useProjectByKey, useStore } from '@/store/store'
import { toast } from '@/store/ui'
import { useJql } from '@/lib/useJql'
import { basicToJql } from '@/lib/jql'
import { cn, download, toCSV } from '@/lib/utils'
import { Popover, Modal } from '@/components/ui/overlay'
import { Button, Checkbox, EmptyState, Field, Input } from '@/components/ui/primitives'
import { IssueTypeIcon, StatusLozenge, useIssueModal, Avatar } from '@/components/jira'
import { JqlEditor } from '@/features/search/JqlEditor'
import { JqlHelp } from '@/features/search/JqlHelp'
import { BulkBar } from '@/features/search/BulkBar'
import { BasicFilters, emptyBasic, type BasicState } from '@/features/search/BasicFilters'
import { IssueDetailCard } from '@/features/search/IssueDetailCard'
import { COLUMNS, DEFAULT_COLUMNS, currentSort, loadColumns, saveColumns, withSort, type ColCtx } from '@/features/search/columns'

const PAGE_SIZE = 50

function lsGet<T extends string>(key: string, fallback: T, allowed: readonly T[]): T {
  try {
    const v = localStorage.getItem(key) as T | null
    return v && allowed.includes(v) ? v : fallback
  } catch {
    return fallback
  }
}
function lsSet(key: string, v: string) {
  try {
    localStorage.setItem(key, v)
  } catch {
    /* ignore */
  }
}

export default function IssuesSearchPage() {
  const { projectKey } = useParams()
  const project = useProjectByKey(projectKey)
  const navigate = useNavigate()
  const me = useMe()
  const [params, setParams] = useSearchParams()
  const filters = useStore((s) => s.filters)
  const users = useStore((s) => s.users)
  const allIssues = useStore((s) => s.issues)
  const projects = useStore((s) => s.projects)
  const sprints = useStore((s) => s.sprints)
  const saveFilter = useStore((s) => s.saveFilter)
  const updateFilter = useStore((s) => s.updateFilter)
  const { open: openIssue } = useIssueModal()

  const filterId = params.get('filter')
  const filter = filters.find((f) => f.id === filterId)
  const defaultJql = project ? `project = ${project.key} ORDER BY created DESC` : 'ORDER BY created DESC'
  const applied = params.get('jql') ?? filter?.jql ?? defaultJql
  const modified = !!filter && applied !== filter.jql

  const [draft, setDraft] = useState(applied)
  useEffect(() => setDraft(applied), [applied])

  const [mode, setMode] = useState<'basic' | 'jql'>(() =>
    params.get('jql') || params.get('filter') || params.get('help') ? 'jql' : lsGet('skatebored-search-mode', 'basic', ['basic', 'jql'] as const),
  )
  const [basic, setBasic] = useState<BasicState>(() => emptyBasic(project?.key))
  const [view, setView] = useState<'list' | 'detail'>(() => lsGet('skatebored-search-view', 'list', ['list', 'detail'] as const))
  const [cols, setCols] = useState<string[]>(loadColumns)
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [detailId, setDetailId] = useState<string | null>(null)
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveName, setSaveName] = useState('')

  const result = useJql(applied)
  const issues = result.issues
  useEffect(() => {
    setPage(0)
    setSelected(new Set())
  }, [applied])

  // Keep the project scope when the user changes project route
  useEffect(() => {
    setBasic(emptyBasic(project?.key))
  }, [project?.key])

  const setJql = (jql: string) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('jql', jql)
      if (filter && jql === filter.jql) next.delete('jql')
      return next
    })
  }

  const onBasic = (s: BasicState) => {
    setBasic(s)
    setJql(basicToJql(s, users, me.id).trim())
  }

  const switchMode = (m: 'basic' | 'jql') => {
    setMode(m)
    lsSet('skatebored-search-mode', m)
    if (m === 'basic') {
      // basic mode can only express a subset of JQL; start fresh like Jira does
      const fresh = emptyBasic(project?.key)
      setBasic(fresh)
      if (!filter) setJql(basicToJql(fresh, users, me.id).trim() || defaultJql)
    }
  }

  const ctx = useMemo(
    () => ({
      users: new Map(users.map((u) => [u.id, u])),
      issues: new Map(allIssues.map((i) => [i.id, i])),
      sprints: new Map(sprints.map((s) => [s.id, s])),
    }),
    [users, allIssues, sprints],
  )
  const ctxFor = (projectId: string): ColCtx => ({ ...ctx, project: projects.find((p) => p.id === projectId) })

  const visibleCols = cols.map((id) => COLUMNS.find((c) => c.id === id)!).filter(Boolean)
  const pages = Math.max(1, Math.ceil(issues.length / PAGE_SIZE))
  const pageIssues = issues.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const sort = currentSort(applied)
  const selectedIssues = issues.filter((i) => selected.has(i.id))
  const detailIssue = issues.find((i) => i.id === detailId) ?? pageIssues[0]

  const toggleCol = (id: string) => {
    const next = cols.includes(id) ? cols.filter((c) => c !== id) : COLUMNS.map((c) => c.id).filter((c) => c === id || cols.includes(c))
    setCols(next)
    saveColumns(next)
  }

  const exportCsv = (all: boolean) => {
    const defs = all ? COLUMNS : visibleCols
    const rows = [defs.map((d) => (d.id === 'type' ? 'Issue Type' : d.id === 'priority' ? 'Priority' : d.label)), ...issues.map((i) => defs.map((d) => d.text(i, ctxFor(i.projectId))))]
    download(`skatebored-issues-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(rows), 'text/csv')
    toast({ title: `Exported ${issues.length} issues`, tone: 'success' })
  }

  const helpOpen = params.get('help') === 'jql'
  const setHelp = (v: boolean) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      if (v) next.set('help', 'jql')
      else next.delete('help')
      return next
    })

  const title = filter ? filter.name : project ? 'Issues' : 'Search'
  const owner = filter ? users.find((u) => u.id === filter.ownerId) : undefined
  const allOnPage = pageIssues.length > 0 && pageIssues.every((i) => selected.has(i.id))

  return (
    <div className="flex min-h-full flex-col">
      <div className="px-8 pt-6 pb-3">
        {project && (
          <div className="mb-2 flex items-center gap-1.5 text-[13px] text-muted">
            <Link to="/projects" className="hover:underline">
              Projects
            </Link>
            <span>/</span>
            <Link to={`/projects/${project.key}/board`} className="hover:underline">
              {project.name}
            </Link>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="display text-[28px]">{title}</h1>
          {filter && (
            <button onClick={() => updateFilter(filter.id, { starred: !filter.starred })} aria-label={filter.starred ? 'Unstar filter' : 'Star filter'}>
              <Star className={cn('size-5', filter.starred ? 'fill-warn text-warn' : 'text-subtle hover:text-fg')} />
            </button>
          )}
          {modified && <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[11px] font-semibold text-muted uppercase">Edited</span>}
          <div className="flex-1" />
          {filter && modified && filter.ownerId === me.id && (
            <Button
              variant="primary"
              onClick={() => {
                updateFilter(filter.id, { jql: applied })
                navigate(`?filter=${filter.id}`)
                toast({ title: `Saved “${filter.name}”`, tone: 'success' })
              }}
            >
              Save
            </Button>
          )}
          {(!filter || modified) && (
            <Button
              variant={filter ? 'default' : 'primary'}
              onClick={() => {
                setSaveName(filter ? `Copy of ${filter.name}` : '')
                setSaveOpen(true)
              }}
            >
              {filter ? 'Save as' : 'Save filter'}
            </Button>
          )}
          {filter && (
            <Popover
              placement="bottom-end"
              width={340}
              trigger={
                <Button variant="ghost" icon={<Info className="size-4" />}>
                  Details
                </Button>
              }
            >
              <div className="space-y-3 p-4 text-[13px]">
                <div>
                  <div className="mb-1 text-xs font-semibold text-muted">Owner</div>
                  <div className="flex items-center gap-2">
                    <Avatar user={owner} size="xs" showTooltip={false} /> {owner?.name}
                  </div>
                </div>
                <div>
                  <div className="mb-1 text-xs font-semibold text-muted">Saved query</div>
                  <code className="block rounded-lg bg-surface-3 p-2 font-mono text-[12px] break-words">{filter.jql}</code>
                </div>
                <Link to="/filters" className="block text-accent hover:underline">
                  Manage filters
                </Link>
              </div>
            </Popover>
          )}
        </div>

        <div className="mt-4 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            {mode === 'basic' ? (
              <BasicFilters state={basic} onChange={onBasic} lockedProject={!!project} />
            ) : (
              <JqlEditor value={draft} onChange={setDraft} onRun={(v) => setJql(v.trim() || defaultJql)} />
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {mode === 'jql' && (
              <Button variant="primary" size="md" onClick={() => setJql(draft.trim() || defaultJql)}>
                Search
              </Button>
            )}
            <div className="ml-1 flex rounded-lg border border-line p-0.5">
              {(['basic', 'jql'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => switchMode(m)}
                  className={cn('h-7 rounded-md px-2.5 text-[12px] font-semibold uppercase transition', mode === m ? 'bg-accent text-ink' : 'text-muted hover:text-fg')}
                >
                  {m === 'basic' ? 'Basic' : 'JQL'}
                </button>
              ))}
            </div>
            <Button variant="ghost" icon={<HelpCircle className="size-4" />} onClick={() => setHelp(true)} aria-label="JQL reference" />
          </div>
        </div>
        {mode === 'basic' && params.get('jql') && (
          <code className="mt-2 block truncate font-mono text-[11.5px] text-subtle" title={applied}>
            {applied}
          </code>
        )}
      </div>

      <div className="flex items-center gap-2 border-y border-line bg-surface px-8 py-2">
        <span className="text-[13px] text-muted">
          {result.error ? (
            <span className="text-accent">Error: {result.error}</span>
          ) : issues.length ? (
            <>
              <span className="font-semibold text-fg">
                {page * PAGE_SIZE + 1}–{Math.min(issues.length, (page + 1) * PAGE_SIZE)}
              </span>{' '}
              of {issues.length}
            </>
          ) : (
            '0 issues'
          )}
        </span>
        <div className="flex-1" />
        <div className="flex rounded-lg border border-line p-0.5">
          <button
            onClick={() => {
              setView('list')
              lsSet('skatebored-search-view', 'list')
            }}
            className={cn('grid h-7 w-8 place-items-center rounded-md', view === 'list' ? 'bg-active text-fg' : 'text-muted hover:text-fg')}
            aria-label="List view"
            aria-pressed={view === 'list'}
          >
            <LayoutList className="size-4" />
          </button>
          <button
            onClick={() => {
              setView('detail')
              lsSet('skatebored-search-view', 'detail')
            }}
            className={cn('grid h-7 w-8 place-items-center rounded-md', view === 'detail' ? 'bg-active text-fg' : 'text-muted hover:text-fg')}
            aria-label="Detail view"
            aria-pressed={view === 'detail'}
          >
            <PanelLeft className="size-4" />
          </button>
        </div>
        {view === 'list' && (
          <Popover placement="bottom-end" width={240} trigger={<Button size="sm" icon={<Columns3 className="size-4" />}>Columns</Button>}>
            <div className="py-2">
              {COLUMNS.map((c) => (
                <div key={c.id} className="px-3 py-1 hover:bg-hover">
                  <Checkbox checked={cols.includes(c.id)} onChange={() => toggleCol(c.id)} label={c.id === 'type' ? 'Type' : c.id === 'priority' ? 'Priority' : c.label} />
                </div>
              ))}
              <div className="mt-1 border-t border-line px-3 pt-2">
                <button
                  className="text-[13px] text-accent hover:underline"
                  onClick={() => {
                    setCols(DEFAULT_COLUMNS)
                    saveColumns(DEFAULT_COLUMNS)
                  }}
                >
                  Restore defaults
                </button>
              </div>
            </div>
          </Popover>
        )}
        <Popover placement="bottom-end" width={220} trigger={<Button size="sm" icon={<Download className="size-4" />}>Export</Button>}>
          {(close) => (
            <div className="py-1">
              <button className="w-full px-3 py-1.5 text-left text-[13px] hover:bg-hover" onClick={() => { exportCsv(false); close() }}>
                CSV (current fields)
              </button>
              <button className="w-full px-3 py-1.5 text-left text-[13px] hover:bg-hover" onClick={() => { exportCsv(true); close() }}>
                CSV (all fields)
              </button>
            </div>
          )}
        </Popover>
      </div>

      <div className="min-h-0 flex-1">
        {result.error ? (
          <EmptyState icon="⚠️" title="We couldn’t run that query">
            {result.error}. Check the JQL reference for supported fields and operators.
          </EmptyState>
        ) : issues.length === 0 ? (
          <EmptyState icon="🛹" title="No issues match your search">
            Try removing a filter, widening the date range or searching across all projects.
          </EmptyState>
        ) : view === 'list' ? (
          <div className="overflow-x-auto px-8 py-4">
            <table className="w-full min-w-[900px] border-separate border-spacing-0 text-[13px]">
              <thead>
                <tr className="text-left text-xs font-semibold text-muted">
                  <th className="sticky top-0 w-10 border-b border-line bg-canvas px-2 py-2">
                    <Checkbox
                      checked={allOnPage}
                      onChange={(v) => {
                        const next = new Set(selected)
                        pageIssues.forEach((i) => (v ? next.add(i.id) : next.delete(i.id)))
                        setSelected(next)
                      }}
                    />
                  </th>
                  {visibleCols.map((c) => {
                    const active = c.sort && sort?.field === c.sort.toLowerCase()
                    return (
                      <th key={c.id} className={cn('sticky top-0 border-b border-line bg-canvas px-2 py-2 whitespace-nowrap', c.width)}>
                        {c.sort ? (
                          <button onClick={() => setJql(withSort(applied, c.sort!))} className={cn('inline-flex items-center gap-1 hover:text-fg', active && 'text-fg')}>
                            {c.label}
                            {active && (sort!.dir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                          </button>
                        ) : (
                          c.label
                        )}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {pageIssues.map((i) => (
                  <tr
                    key={i.id}
                    onClick={() => openIssue(i.key)}
                    className={cn('group cursor-pointer transition hover:bg-hover', selected.has(i.id) && 'bg-accent-soft')}
                  >
                    <td className="border-b border-line px-2 py-2" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selected.has(i.id)}
                        onChange={(v) => {
                          const next = new Set(selected)
                          if (v) next.add(i.id)
                          else next.delete(i.id)
                          setSelected(next)
                        }}
                      />
                    </td>
                    {visibleCols.map((c) => (
                      <td key={c.id} className={cn('max-w-[420px] border-b border-line px-2 py-2', c.id === 'summary' && 'group-hover:text-accent')}>
                        {c.render(i, ctxFor(i.projectId))}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {pages > 1 && (
              <div className="mt-4 flex items-center justify-center gap-1">
                <Button size="sm" variant="ghost" icon={<ChevronLeft className="size-4" />} disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Previous page" />
                {Array.from({ length: pages }, (_, k) => (
                  <Button key={k} size="sm" variant={k === page ? 'primary' : 'ghost'} onClick={() => setPage(k)}>
                    {k + 1}
                  </Button>
                ))}
                <Button size="sm" variant="ghost" icon={<ChevronRight className="size-4" />} disabled={page >= pages - 1} onClick={() => setPage(page + 1)} aria-label="Next page" />
              </div>
            )}
            {selectedIssues.length > 0 && <BulkBar selected={selectedIssues} onClear={() => setSelected(new Set())} />}
          </div>
        ) : (
          <div className="flex h-[calc(100vh-260px)] min-h-[420px]">
            <div className="w-[380px] shrink-0 overflow-y-auto border-r border-line">
              {pageIssues.map((i) => {
                const p = projects.find((x) => x.id === i.projectId)
                const active = detailIssue?.id === i.id
                return (
                  <button
                    key={i.id}
                    onClick={() => setDetailId(i.id)}
                    className={cn('flex w-full flex-col gap-1 border-b border-line px-4 py-3 text-left transition', active ? 'bg-accent-soft' : 'hover:bg-hover')}
                  >
                    <span className={cn('line-clamp-2 text-[13.5px] font-medium', active && 'text-accent')}>{i.summary}</span>
                    <span className="flex items-center gap-2 text-[12px] text-muted">
                      <IssueTypeIcon type={i.type} className="size-3.5" />
                      {i.key}
                      <span className="flex-1" />
                      <StatusLozenge status={p?.statuses.find((s) => s.id === i.statusId)} />
                    </span>
                  </button>
                )
              })}
              {pages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 text-[12px] text-muted">
                  <Button size="xs" variant="ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>
                    Previous
                  </Button>
                  Page {page + 1} of {pages}
                  <Button size="xs" variant="ghost" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>
                    Next
                  </Button>
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1 overflow-y-auto">{detailIssue && <IssueDetailCard key={detailIssue.id} issue={detailIssue} />}</div>
          </div>
        )}
      </div>

      <JqlHelp
        open={helpOpen}
        onClose={() => setHelp(false)}
        onApply={(j) => {
          setMode('jql')
          setJql(j)
        }}
      />
      <Modal
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        title="Save filter"
        width={480}
        footer={
          <>
            <Button variant="subtle" onClick={() => setSaveOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!saveName.trim()}
              onClick={() => {
                const f = saveFilter(saveName.trim(), applied)
                setSaveOpen(false)
                navigate(`${project ? `/projects/${project.key}/issues` : '/issues'}?filter=${f.id}`)
                toast({ title: `Filter “${f.name}” saved`, description: 'Find it under Filters in the top navigation.', tone: 'success' })
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
          }}
          className="space-y-4"
        >
          <Field label="Name" required>
            <Input autoFocus value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="e.g. Sprint bugs" />
          </Field>
          <Field label="Query">
            <code className="block rounded-lg bg-surface-3 p-2.5 font-mono text-[12px] break-words text-muted">{applied}</code>
          </Field>
        </form>
      </Modal>
    </div>
  )
}
