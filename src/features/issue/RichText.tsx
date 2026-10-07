import { Fragment, type ReactNode } from 'react'
import { useStore } from '@/store/store'
import { useIssueModal } from '@/components/jira'

/**
 * Safe, tiny markdown-ish renderer: headings (#), bullet/numbered lists, **bold**, *italic*,
 * `code`, URLs, @mentions and issue keys. Builds React nodes — never injects raw HTML.
 */
export function RichText({ text, className }: { text: string; className?: string }) {
  const users = useStore((s) => s.users)
  const issues = useStore((s) => s.issues)
  const { open } = useIssueModal()
  const firstNames = new Set(users.map((u) => u.name.split(' ')[0]!))
  const keys = new Set(issues.map((i) => i.key))

  const inline = (line: string, lk: string): ReactNode[] => {
    const re = /(\*\*[^*]+\*\*|`[^`]+`|https?:\/\/[^\s)]+|@[\p{L}]+|\b[A-Z][A-Z0-9]+-\d+\b|\*[^*\s][^*]*\*)/gu
    const out: ReactNode[] = []
    let last = 0
    let m: RegExpExecArray | null
    let n = 0
    while ((m = re.exec(line))) {
      if (m.index > last) out.push(line.slice(last, m.index))
      const tok = m[0]
      const k = `${lk}-${n++}`
      if (tok.startsWith('**')) out.push(<strong key={k} className="font-semibold">{tok.slice(2, -2)}</strong>)
      else if (tok.startsWith('`')) out.push(<code key={k}>{tok.slice(1, -1)}</code>)
      else if (tok.startsWith('http'))
        out.push(
          <a key={k} href={tok} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
            {tok}
          </a>,
        )
      else if (tok.startsWith('@') && firstNames.has(tok.slice(1)))
        out.push(
          <span key={k} className="rounded bg-accent-soft px-1 font-medium text-accent">
            {tok}
          </span>,
        )
      else if (keys.has(tok))
        out.push(
          <button
            key={k}
            onClick={(e) => {
              e.stopPropagation()
              open(tok)
            }}
            className="font-medium text-accent hover:underline"
          >
            {tok}
          </button>,
        )
      else if (tok.startsWith('*') && tok.length > 2) out.push(<em key={k}>{tok.slice(1, -1)}</em>)
      else out.push(tok)
      last = m.index + tok.length
    }
    if (last < line.length) out.push(line.slice(last))
    return out
  }

  const lines = text.split('\n')
  const blocks: ReactNode[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i]!)) items.push(lines[i++]!.replace(/^\s*[-*]\s+/, ''))
      blocks.push(
        <ul key={i} className="my-1 list-disc space-y-0.5 pl-5">
          {items.map((it, k) => (
            <li key={k}>{inline(it, `${i}-${k}`)}</li>
          ))}
        </ul>,
      )
      continue
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i]!)) items.push(lines[i++]!.replace(/^\s*\d+\.\s+/, ''))
      blocks.push(
        <ol key={i} className="my-1 list-decimal space-y-0.5 pl-5">
          {items.map((it, k) => (
            <li key={k}>{inline(it, `${i}-${k}`)}</li>
          ))}
        </ol>,
      )
      continue
    }
    const h = line.match(/^(#{1,3})\s+(.*)$/)
    if (h) {
      const size = h[1]!.length === 1 ? 'text-lg' : h[1]!.length === 2 ? 'text-base' : 'text-sm'
      blocks.push(
        <div key={i} className={`mt-2 mb-1 font-semibold tracking-[-0.01em] ${size}`}>
          {inline(h[2]!, String(i))}
        </div>,
      )
      i++
      continue
    }
    if (!line.trim()) {
      blocks.push(<div key={i} className="h-2" />)
      i++
      continue
    }
    blocks.push(<Fragment key={i}>{<p>{inline(line, String(i))}</p>}</Fragment>)
    i++
  }
  return <div className={className ?? 'text-sm leading-relaxed [&_a]:text-accent [&_a]:underline [&_code]:rounded [&_code]:bg-surface-3 [&_code]:px-1 [&_code]:text-[12.5px]'}>{blocks}</div>
}
