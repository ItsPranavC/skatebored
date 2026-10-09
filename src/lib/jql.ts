/**
 * A pragmatic JQL implementation.
 *
 *   project = SKB AND type in (Bug, Task) AND assignee = currentUser()
 *   AND status != Done AND labels is not EMPTY AND created >= -14d
 *   AND summary ~ "mastery" ORDER BY priority DESC, created ASC
 *
 * Supported operators: = != ~ !~ > >= < <= IN, NOT IN, IS [NOT] EMPTY|NULL
 * Supported functions: currentUser(), openSprints(), closedSprints(), futureSprints(),
 * now(), startOfDay(), startOfWeek(), endOfDay()
 * Relative dates: -7d, -2w, 3d, -12h
 */
import type { Issue, Project, Sprint, User } from '@/types'
import { priorityWeight } from '@/lib/utils'

export interface JqlContext {
  issues: Issue[]
  projects: Project[]
  sprints: Sprint[]
  users: User[]
  currentUserId: string
}

export interface JqlResult {
  issues: Issue[]
  error: string | null
}

type Tok = { t: 'word' | 'str' | 'op' | 'lp' | 'rp' | 'comma'; v: string }

export const JQL_FIELDS = [
  'project', 'key', 'type', 'status', 'statusCategory', 'priority', 'assignee', 'reporter', 'summary', 'description',
  'text', 'labels', 'sprint', 'epic', 'parent', 'component', 'fixVersion', 'storyPoints', 'created', 'updated',
  'resolved', 'due', 'flagged', 'watcher',
] as const

export const JQL_FUNCTIONS = ['currentUser()', 'openSprints()', 'closedSprints()', 'futureSprints()', 'now()', 'startOfDay()', 'startOfWeek()']

const FIELD_ALIASES: Record<string, string> = {
  issuekey: 'key',
  issuetype: 'type',
  'issue type': 'type',
  'story points': 'storypoints',
  storypoints: 'storypoints',
  points: 'storypoints',
  'epic link': 'epic',
  duedate: 'due',
  resolutiondate: 'resolved',
  components: 'component',
  fixversion: 'fixversion',
  'fix version': 'fixversion',
  label: 'labels',
  statuscategory: 'statuscategory',
}

function tokenize(src: string): Tok[] {
  const out: Tok[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]!
    if (/\s/.test(c)) {
      i++
      continue
    }
    if (c === '(') { out.push({ t: 'lp', v: c }); i++; continue }
    if (c === ')') { out.push({ t: 'rp', v: c }); i++; continue }
    if (c === ',') { out.push({ t: 'comma', v: c }); i++; continue }
    if (c === '"' || c === "'") {
      let j = i + 1
      let s = ''
      while (j < src.length && src[j] !== c) {
        if (src[j] === '\\') j++
        s += src[j] ?? ''
        j++
      }
      if (j >= src.length) throw new Error('Unterminated string')
      out.push({ t: 'str', v: s })
      i = j + 1
      continue
    }
    const two = src.slice(i, i + 2)
    if (['!=', '!~', '>=', '<='].includes(two)) { out.push({ t: 'op', v: two }); i += 2; continue }
    if ('=~<>'.includes(c)) { out.push({ t: 'op', v: c }); i++; continue }
    let j = i
    while (j < src.length && !/[\s(),=!~<>"']/.test(src[j]!)) j++
    let word = src.slice(i, j)
    // function call: word()
    if (src[j] === '(' && src[j + 1] === ')') {
      word += '()'
      j += 2
    }
    out.push({ t: 'word', v: word })
    i = j
  }
  return out
}

type Node =
  | { k: 'and' | 'or'; a: Node; b: Node }
  | { k: 'not'; a: Node }
  | { k: 'clause'; field: string; op: string; values: string[] }
  | { k: 'all' }

interface Sort {
  field: string
  dir: 'asc' | 'desc'
}

function parse(tokens: Tok[]): { node: Node; sort: Sort[] } {
  let p = 0
  const peek = () => tokens[p]
  const kw = (w: string) => peek()?.t === 'word' && peek()!.v.toLowerCase() === w
  const expect = (cond: boolean, msg: string) => {
    if (!cond) throw new Error(msg)
  }

  function parseOr(): Node {
    let a = parseAnd()
    while (kw('or')) {
      p++
      a = { k: 'or', a, b: parseAnd() }
    }
    return a
  }
  function parseAnd(): Node {
    let a = parseNot()
    while (kw('and')) {
      p++
      a = { k: 'and', a, b: parseNot() }
    }
    return a
  }
  function parseNot(): Node {
    if (kw('not')) {
      p++
      return { k: 'not', a: parseNot() }
    }
    if (peek()?.t === 'lp') {
      p++
      const n = parseOr()
      expect(peek()?.t === 'rp', 'Expected ")"')
      p++
      return n
    }
    return parseClause()
  }
  function parseValue(): string {
    const t = peek()
    expect(!!t && (t.t === 'word' || t.t === 'str'), `Expected a value${t ? ` but found "${t.v}"` : ''}`)
    p++
    return t!.v
  }
  function parseClause(): Node {
    const f = peek()
    expect(!!f && (f.t === 'word' || f.t === 'str'), `Expected a field name${f ? ` but found "${f.v}"` : ''}`)
    p++
    let field = f!.v.toLowerCase()
    field = FIELD_ALIASES[field] ?? field
    let op: string
    const t = peek()
    if (t?.t === 'op') {
      op = t.v
      p++
    } else if (kw('in')) {
      op = 'in'
      p++
    } else if (kw('not') && tokens[p + 1]?.v.toLowerCase() === 'in') {
      op = 'not in'
      p += 2
    } else if (kw('is')) {
      p++
      if (kw('not')) {
        p++
        op = 'is not'
      } else op = 'is'
    } else {
      throw new Error(`Expected an operator after "${f!.v}"`)
    }
    let values: string[] = []
    if ((op === 'in' || op === 'not in') && peek()?.t === 'word' && peek()!.v.endsWith('()')) {
      values = [parseValue()]
    } else if (op === 'in' || op === 'not in') {
      expect(peek()?.t === 'lp', `Expected "(" after ${op.toUpperCase()}`)
      p++
      while (peek() && peek()!.t !== 'rp') {
        values.push(parseValue())
        if (peek()?.t === 'comma') p++
      }
      expect(peek()?.t === 'rp', 'Expected ")"')
      p++
    } else {
      values = [parseValue()]
    }
    return { k: 'clause', field, op, values }
  }

  let node: Node = { k: 'all' }
  if (tokens.length && !kw('order')) node = parseOr()
  const sort: Sort[] = []
  if (kw('order')) {
    p++
    expect(kw('by'), 'Expected BY after ORDER')
    p++
    do {
      if (peek()?.t === 'comma') p++
      const f = parseValue().toLowerCase()
      let dir: 'asc' | 'desc' = 'asc'
      if (kw('asc') || kw('desc')) {
        dir = peek()!.v.toLowerCase() as 'asc' | 'desc'
        p++
      }
      sort.push({ field: FIELD_ALIASES[f] ?? f, dir })
    } while (peek()?.t === 'comma')
  }
  expect(p === tokens.length, `Unexpected "${tokens[p]?.v}"`)
  return { node, sort }
}

// ───────────────────────────── evaluation ─────────────────────────────

function relativeDate(v: string): number | null {
  const m = v.match(/^([+-]?\d+)([wdhm])$/i)
  if (!m) return null
  const n = parseInt(m[1]!, 10)
  const unit = { w: 7 * 864e5, d: 864e5, h: 36e5, m: 6e4 }[m[2]!.toLowerCase() as 'w' | 'd' | 'h' | 'm']
  return Date.now() + n * unit
}

function dateValue(v: string): number | null {
  const lv = v.toLowerCase()
  if (lv === 'now()') return Date.now()
  if (lv === 'startofday()') {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }
  if (lv === 'endofday()') {
    const d = new Date()
    d.setHours(23, 59, 59, 999)
    return d.getTime()
  }
  if (lv === 'startofweek()') {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
    return d.getTime()
  }
  const r = relativeDate(v)
  if (r != null) return r
  const t = Date.parse(v)
  return isNaN(t) ? null : t
}

export function runJql(jql: string, ctx: JqlContext): JqlResult {
  let ast: { node: Node; sort: Sort[] }
  try {
    ast = parse(tokenize(jql.trim()))
  } catch (e) {
    return { issues: [], error: (e as Error).message }
  }
  const projectOf = new Map(ctx.projects.map((p) => [p.id, p]))
  const byId = new Map(ctx.issues.map((i) => [i.id, i]))
  const userName = (id: string | null) => (id ? ctx.users.find((u) => u.id === id) : undefined)

  const resolveUserValue = (v: string): string[] => {
    const lv = v.toLowerCase()
    if (lv === 'currentuser()') return [ctx.currentUserId]
    const matches = ctx.users.filter((u) => u.id === v || u.name.toLowerCase() === lv || u.email.toLowerCase() === lv || u.name.split(' ')[0]!.toLowerCase() === lv)
    return matches.map((u) => u.id)
  }

  const sprintFn = (v: string): string[] | null => {
    const lv = v.toLowerCase()
    const state = lv === 'opensprints()' ? 'active' : lv === 'closedsprints()' ? 'closed' : lv === 'futuresprints()' ? 'future' : null
    if (!state) return null
    return ctx.sprints.filter((s) => s.state === state).map((s) => s.id)
  }

  let error: string | null = null

  function fieldValues(issue: Issue, field: string): (string | number)[] | null {
    const project = projectOf.get(issue.projectId)
    switch (field) {
      case 'project':
        return project ? [project.key.toLowerCase(), project.name.toLowerCase(), project.id] : []
      case 'key':
        return [issue.key.toLowerCase()]
      case 'type':
        return [issue.type === 'subtask' ? 'sub-task' : issue.type, issue.type]
      case 'status': {
        const s = project?.statuses.find((x) => x.id === issue.statusId)
        return s ? [s.name.toLowerCase()] : []
      }
      case 'statuscategory': {
        const c = project?.statuses.find((x) => x.id === issue.statusId)?.category
        return c ? [{ todo: 'to do', inprogress: 'in progress', done: 'done' }[c]] : []
      }
      case 'priority':
        return [issue.priority]
      case 'assignee':
        return issue.assigneeId ? [issue.assigneeId] : []
      case 'reporter':
        return [issue.reporterId]
      case 'watcher':
        return issue.watcherIds
      case 'summary':
        return [issue.summary.toLowerCase()]
      case 'description':
        return issue.description ? [issue.description.toLowerCase()] : []
      case 'text':
        return [`${issue.summary} ${issue.description} ${issue.key}`.toLowerCase()]
      case 'labels':
        return issue.labels.map((l) => l.toLowerCase())
      case 'sprint':
        return issue.sprintId ? [issue.sprintId, (ctx.sprints.find((s) => s.id === issue.sprintId)?.name ?? '').toLowerCase()] : []
      case 'epic': {
        const e = issue.epicId ? byId.get(issue.epicId) : undefined
        return e ? [e.key.toLowerCase(), e.summary.toLowerCase()] : []
      }
      case 'parent': {
        const pid = issue.parentId ?? issue.epicId
        const e = pid ? byId.get(pid) : undefined
        return e ? [e.key.toLowerCase()] : []
      }
      case 'component':
        return issue.componentIds.map((id) => (project?.components.find((c) => c.id === id)?.name ?? '').toLowerCase())
      case 'fixversion':
        return issue.fixVersionIds.map((id) => (project?.versions.find((c) => c.id === id)?.name ?? '').toLowerCase())
      case 'storypoints':
        return issue.storyPoints == null ? [] : [issue.storyPoints]
      case 'created':
        return [Date.parse(issue.createdAt)]
      case 'updated':
        return [Date.parse(issue.updatedAt)]
      case 'resolved':
        return issue.resolvedAt ? [Date.parse(issue.resolvedAt)] : []
      case 'due':
        return issue.dueDate ? [Date.parse(issue.dueDate)] : []
      case 'flagged':
        return issue.flagged ? ['impediment', 'true', 'yes'] : []
      default:
        return null
    }
  }

  const isDateField = (f: string) => ['created', 'updated', 'resolved', 'due'].includes(f)
  const isUserField = (f: string) => ['assignee', 'reporter', 'watcher'].includes(f)

  function normalise(field: string, v: string): (string | number)[] {
    if (isUserField(field)) return resolveUserValue(v)
    if (field === 'sprint') return sprintFn(v) ?? [v.toLowerCase()]
    if (isDateField(field)) {
      const d = dateValue(v)
      if (d == null) throw new Error(`"${v}" is not a valid date`)
      return [d]
    }
    if (field === 'storypoints') {
      const n = Number(v)
      if (isNaN(n)) throw new Error(`"${v}" is not a number`)
      return [n]
    }
    if (field === 'type' && v.toLowerCase() === 'subtask') return ['sub-task']
    return [v.toLowerCase()]
  }

  function evalNode(n: Node, issue: Issue): boolean {
    switch (n.k) {
      case 'all':
        return true
      case 'and':
        return evalNode(n.a, issue) && evalNode(n.b, issue)
      case 'or':
        return evalNode(n.a, issue) || evalNode(n.b, issue)
      case 'not':
        return !evalNode(n.a, issue)
      case 'clause': {
        const vals = fieldValues(issue, n.field)
        if (vals === null) throw new Error(`Field "${n.field}" does not exist`)
        const raw = n.values
        if (n.op === 'is' || n.op === 'is not') {
          const v = raw[0]!.toLowerCase()
          if (v !== 'empty' && v !== 'null') throw new Error('IS only supports EMPTY or NULL')
          return n.op === 'is' ? vals.length === 0 : vals.length > 0
        }
        if (n.op === '~' || n.op === '!~') {
          const needle = raw[0]!.toLowerCase().replace(/\*/g, '')
          const hit = vals.some((v) => String(v).includes(needle))
          return n.op === '~' ? hit : !hit
        }
        const targets = raw.flatMap((v) => normalise(n.field, v))
        if (['>', '>=', '<', '<='].includes(n.op)) {
          if (n.field === 'priority') {
            const w = priorityWeight(issue.priority)
            const t = priorityWeight(String(targets[0]) as Issue['priority'])
            // higher priority = lower index
            return n.op === '>' ? w < t : n.op === '>=' ? w <= t : n.op === '<' ? w > t : w >= t
          }
          const t = targets[0] as number
          return vals.some((v) => {
            const x = v as number
            return n.op === '>' ? x > t : n.op === '>=' ? x >= t : n.op === '<' ? x < t : x <= t
          })
        }
        // =, !=, in, not in
        let hit: boolean
        if (isDateField(n.field)) {
          const day = (x: number) => new Date(x).toDateString()
          hit = vals.some((v) => targets.some((t) => day(v as number) === day(t as number)))
        } else {
          hit = vals.some((v) => targets.includes(v))
        }
        return n.op === '=' || n.op === 'in' ? hit : !hit
      }
    }
  }

  let result: Issue[]
  try {
    result = ctx.issues.filter((i) => evalNode(ast.node, i))
  } catch (e) {
    error = (e as Error).message
    return { issues: [], error }
  }

  const sortVal = (i: Issue, f: string): string | number => {
    switch (f) {
      case 'priority':
        return priorityWeight(i.priority)
      case 'created':
        return Date.parse(i.createdAt)
      case 'updated':
        return Date.parse(i.updatedAt)
      case 'resolved':
        return i.resolvedAt ? Date.parse(i.resolvedAt) : 0
      case 'due':
        return i.dueDate ? Date.parse(i.dueDate) : Number.MAX_SAFE_INTEGER
      case 'key': {
        const [pk, n] = i.key.split('-')
        return `${pk}-${n!.padStart(6, '0')}`
      }
      case 'storypoints':
        return i.storyPoints ?? -1
      case 'rank':
        return i.rank
      case 'assignee':
        return userName(i.assigneeId)?.name ?? '~'
      case 'status': {
        const p = projectOf.get(i.projectId)
        return p?.statuses.findIndex((s) => s.id === i.statusId) ?? 0
      }
      case 'summary':
        return i.summary.toLowerCase()
      case 'type':
        return i.type
      default:
        return 0
    }
  }
  const sorts = ast.sort.length ? ast.sort : [{ field: 'created', dir: 'desc' as const }]
  // priority DESC means highest first; our weight is inverted
  result.sort((a, b) => {
    for (const s of sorts) {
      const va = sortVal(a, s.field)
      const vb = sortVal(b, s.field)
      if (va === vb) continue
      let cmp = va < vb ? -1 : 1
      if (s.field === 'priority') cmp = -cmp
      return s.dir === 'desc' ? -cmp : cmp
    }
    return 0
  })
  return { issues: result, error: null }
}

/** Builds a JQL string from basic-mode filter chips. */
export function basicToJql(f: {
  projects?: string[]
  types?: string[]
  statuses?: string[]
  assignees?: string[]
  text?: string
  labels?: string[]
  priorities?: string[]
  sprint?: string | null
}, users: User[], currentUserId: string) {
  const q = (v: string) => (/^[\w-]+$/.test(v) ? v : `"${v.replace(/"/g, '\\"')}"`)
  const parts: string[] = []
  if (f.projects?.length) parts.push(`project IN (${f.projects.map(q).join(', ')})`)
  if (f.types?.length) parts.push(`type IN (${f.types.map(q).join(', ')})`)
  if (f.statuses?.length) parts.push(`status IN (${f.statuses.map(q).join(', ')})`)
  if (f.assignees?.length) {
    const vals = f.assignees.map((id) => (id === currentUserId ? 'currentUser()' : id === '__none' ? 'EMPTY' : q(users.find((u) => u.id === id)?.name ?? id)))
    const hasEmpty = vals.includes('EMPTY')
    const rest = vals.filter((v) => v !== 'EMPTY')
    const clause = [rest.length ? `assignee IN (${rest.join(', ')})` : '', hasEmpty ? 'assignee IS EMPTY' : ''].filter(Boolean).join(' OR ')
    parts.push(hasEmpty && rest.length ? `(${clause})` : clause)
  }
  if (f.priorities?.length) parts.push(`priority IN (${f.priorities.map(q).join(', ')})`)
  if (f.labels?.length) parts.push(`labels IN (${f.labels.map(q).join(', ')})`)
  if (f.sprint) parts.push(`sprint IN ${f.sprint}`)
  if (f.text?.trim()) parts.push(`text ~ ${q(f.text.trim())}`)
  return parts.join(' AND ') + ' ORDER BY created DESC'
}
