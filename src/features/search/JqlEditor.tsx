import { useMemo, useRef, useState } from 'react'
import { CheckCircle2, AlertCircle, Search } from 'lucide-react'
import { useStore } from '@/store/store'
import { runJql, JQL_FIELDS } from '@/lib/jql'
import { PRIORITIES, cn } from '@/lib/utils'

type Ctx = 'field' | 'op' | 'value' | 'listval' | 'listsep' | 'conj' | 'isval' | 'notin' | 'by' | 'sortfield' | 'sortdir'

const OPS = ['=', '!=', '~', '!~', '>', '>=', '<', '<=', 'IN', 'NOT IN', 'IS', 'IS NOT']
const OP_TOKENS = new Set(['=', '!=', '~', '!~', '>', '>=', '<', '<='])
const SORTABLE = ['priority', 'created', 'updated', 'resolved', 'due', 'key', 'storyPoints', 'rank', 'assignee', 'status', 'summary', 'type']

const TOKEN_RE = /"[^"]*"?|'[^']*'?|\(|\)|,|!=|!~|>=|<=|[=~<>]|[^\s(),=!~<>"']+/g

/** Walks completed tokens to work out what the user is typing next. */
function analyse(before: string): { ctx: Ctx; field: string | null; fragment: string } {
  const endsClean = /[\s(),=~<>]$/.test(before) || before === ''
  const tokens = before.match(TOKEN_RE) ?? []
  let fragment = ''
  if (!endsClean && tokens.length) {
    const last = tokens[tokens.length - 1]!
    // operators stuck to a fragment (e.g. "status=") are complete tokens
    if (!['(', ')', ','].includes(last) && !OP_TOKENS.has(last)) fragment = tokens.pop()!
  }
  let ctx: Ctx = 'field'
  let field: string | null = null
  for (const raw of tokens) {
    const t = raw.toLowerCase()
    switch (ctx) {
      case 'field':
        if (t === '(' || t === 'not') break
        if (t === 'order') ctx = 'by'
        else {
          field = t.replace(/^["']|["']$/g, '')
          ctx = 'op'
        }
        break
      case 'op':
        if (OP_TOKENS.has(t)) ctx = 'value'
        else if (t === 'in') ctx = 'listval'
        else if (t === 'not') ctx = 'notin'
        else if (t === 'is') ctx = 'isval'
        break
      case 'notin':
        ctx = t === 'in' ? 'listval' : 'op'
        break
      case 'isval':
        if (t !== 'not') ctx = 'conj'
        break
      case 'value':
        ctx = 'conj'
        break
      case 'listval':
        if (t === '(') break
        if (t.endsWith('()')) ctx = 'conj'
        else ctx = 'listsep'
        break
      case 'listsep':
        if (t === ',') ctx = 'listval'
        else if (t === ')') ctx = 'conj'
        break
      case 'conj':
        if (t === 'and' || t === 'or') ctx = 'field'
        else if (t === 'order') ctx = 'by'
        break
      case 'by':
        if (t === 'by') ctx = 'sortfield'
        break
      case 'sortfield':
        ctx = 'sortdir'
        break
      case 'sortdir':
        if (t === ',') ctx = 'sortfield'
        break
    }
  }
  return { ctx, field, fragment }
}

const quote = (v: string) => (/^[\w.-]+$/.test(v) || v.endsWith('()') ? v : `"${v}"`)

export function JqlEditor({ value, onChange, onRun }: { value: string; onChange: (v: string) => void; onRun: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [caret, setCaret] = useState(0)
  const [focused, setFocused] = useState(false)
  const [hi, setHi] = useState(-1)
  const [dismissed, setDismissed] = useState(false)
  const projects = useStore((s) => s.projects)
  const users = useStore((s) => s.users)
  const issues = useStore((s) => s.issues)
  const sprints = useStore((s) => s.sprints)
  const currentUserId = useStore((s) => s.currentUserId)

  const validation = useMemo(() => {
    if (!value.trim()) return null
    return runJql(value, { issues: issues.slice(0, 1), projects, sprints, users, currentUserId }).error
  }, [value, issues, projects, sprints, users, currentUserId])

  const valuesFor = (field: string | null): string[] => {
    switch (field) {
      case 'project':
        return projects.map((p) => p.key)
      case 'type':
      case 'issuetype':
        return ['Story', 'Task', 'Bug', 'Epic', 'Sub-task']
      case 'status':
        return [...new Set(projects.flatMap((p) => p.statuses.map((s) => s.name)))]
      case 'statuscategory':
        return ['"To Do"', '"In Progress"', 'Done']
      case 'priority':
        return PRIORITIES.map((p) => p.label)
      case 'assignee':
      case 'reporter':
      case 'watcher':
        return ['currentUser()', 'EMPTY', ...users.map((u) => u.name)]
      case 'labels':
        return [...new Set(issues.flatMap((i) => i.labels))].sort()
      case 'sprint':
        return ['openSprints()', 'closedSprints()', 'futureSprints()', ...sprints.map((s) => s.name)]
      case 'epic':
        return issues.filter((i) => i.type === 'epic').map((i) => i.key)
      case 'component':
        return [...new Set(projects.flatMap((p) => p.components.map((c) => c.name)))]
      case 'fixversion':
        return [...new Set(projects.flatMap((p) => p.versions.map((c) => c.name)))]
      case 'created':
      case 'updated':
      case 'resolved':
      case 'due':
        return ['-1d', '-7d', '-14d', '-30d', 'startOfDay()', 'startOfWeek()', 'now()']
      case 'flagged':
        return ['Impediment']
      default:
        return []
    }
  }

  const { ctx, field, fragment } = analyse(value.slice(0, caret))
  const suggestions = useMemo(() => {
    let list: string[]
    switch (ctx) {
      case 'field':
        list = [...JQL_FIELDS, 'NOT']
        break
      case 'op':
        list = OPS
        break
      case 'notin':
        list = ['IN']
        break
      case 'isval':
        list = ['EMPTY', 'NOT']
        break
      case 'value':
      case 'listval':
        list = valuesFor(field).map(quote)
        break
      case 'listsep':
        list = [',', ')']
        break
      case 'conj':
        list = ['AND', 'OR', 'ORDER BY']
        break
      case 'by':
        list = ['BY']
        break
      case 'sortfield':
        list = SORTABLE
        break
      case 'sortdir':
        list = ['ASC', 'DESC', ',']
        break
    }
    const f = fragment.replace(/^["']/, '').toLowerCase()
    return list.filter((s) => s.replace(/^["']/, '').toLowerCase().startsWith(f) && s.toLowerCase() !== f).slice(0, 12)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, field, fragment, projects, users, issues, sprints])

  const showSuggestions = focused && !dismissed && suggestions.length > 0

  const apply = (s: string) => {
    const start = caret - fragment.length
    const insert = s === ',' || s === ')' ? s : s + ' '
    const next = value.slice(0, start) + insert + value.slice(caret)
    onChange(next)
    const pos = start + insert.length
    requestAnimationFrame(() => {
      ref.current?.setSelectionRange(pos, pos)
      setCaret(pos)
    })
    setHi(-1)
  }

  const syncCaret = () => setCaret(ref.current?.selectionStart ?? value.length)

  return (
    <div className="relative">
      <div
        className={cn(
          'flex items-start rounded-lg border bg-surface-2 transition',
          focused ? 'border-accent ring-2 ring-accent-soft' : validation ? 'border-accent/60' : 'border-line',
        )}
      >
        <span className="grid h-10 w-9 shrink-0 place-items-center">
          {!value.trim() ? (
            <Search className="size-4 text-subtle" />
          ) : validation ? (
            <AlertCircle className="size-4 text-accent" aria-label="Invalid query" />
          ) : (
            <CheckCircle2 className="size-4 text-success" aria-label="Valid query" />
          )}
        </span>
        <textarea
          ref={ref}
          value={value}
          spellCheck={false}
          rows={Math.min(5, Math.max(1, Math.ceil(value.length / 90)))}
          placeholder='project = SKB AND status = "In Progress" ORDER BY priority DESC'
          onChange={(e) => {
            onChange(e.target.value)
            setCaret(e.target.selectionStart)
            setDismissed(false)
            setHi(-1)
          }}
          onKeyUp={syncCaret}
          onClick={syncCaret}
          onFocus={() => {
            setFocused(true)
            syncCaret()
          }}
          onBlur={() => setTimeout(() => setFocused(false), 120)}
          onKeyDown={(e) => {
            if (showSuggestions && e.key === 'ArrowDown') {
              e.preventDefault()
              setHi((h) => Math.min(h + 1, suggestions.length - 1))
            } else if (showSuggestions && e.key === 'ArrowUp') {
              e.preventDefault()
              setHi((h) => Math.max(h - 1, 0))
            } else if (showSuggestions && e.key === 'Tab') {
              e.preventDefault()
              apply(suggestions[Math.max(hi, 0)]!)
            } else if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              if (showSuggestions && hi >= 0) apply(suggestions[hi]!)
              else {
                setDismissed(true)
                onRun(value)
              }
            } else if (e.key === 'Escape' && showSuggestions) {
              e.preventDefault()
              e.stopPropagation()
              setDismissed(true)
            }
          }}
          className="min-h-10 flex-1 resize-none bg-transparent py-2.5 pr-3 font-mono text-[13px] leading-5 text-fg outline-none placeholder:text-subtle"
          aria-label="JQL query"
        />
      </div>
      {validation && !focused && <div className="mt-1.5 flex items-center gap-1.5 text-[12px] text-accent">{validation}</div>}
      {showSuggestions && (
        <div className="animate-pop absolute top-full left-9 z-30 mt-1 max-h-72 w-72 overflow-auto rounded-xl border border-line bg-surface-2 py-1 shadow-pop" role="listbox">
          <div className="px-3 pt-1 pb-1 text-[10px] font-semibold tracking-wide text-subtle uppercase">
            {{ field: 'Fields', op: 'Operators', notin: 'Operators', isval: 'Values', value: 'Values', listval: 'Values', listsep: '', conj: 'Keywords', by: 'Keywords', sortfield: 'Sort by', sortdir: 'Direction' }[ctx]}
          </div>
          {suggestions.map((s, i) => (
            <button
              key={s}
              role="option"
              aria-selected={i === hi}
              onMouseDown={(e) => {
                e.preventDefault()
                apply(s)
              }}
              onMouseEnter={() => setHi(i)}
              className={cn('flex w-full items-center px-3 py-1.5 text-left font-mono text-[12.5px]', i === hi && 'bg-hover text-accent')}
            >
              {s}
            </button>
          ))}
          <div className="border-t border-line px-3 pt-1.5 pb-1 text-[10px] text-subtle">Tab to insert · Enter to search</div>
        </div>
      )}
    </div>
  )
}
