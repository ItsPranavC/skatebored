import { Modal } from '@/components/ui/overlay'
import { Kbd } from '@/components/ui/primitives'

const FIELDS: [string, string][] = [
  ['project', 'Project key or name — project = SKB'],
  ['key', 'Issue key — key = SKB-12'],
  ['type', 'Story, Task, Bug, Epic, Sub-task'],
  ['status', 'Workflow status name — status = "In Review"'],
  ['statusCategory', '"To Do", "In Progress", Done'],
  ['priority', 'Highest, High, Medium, Low, Lowest (supports > and <)'],
  ['assignee / reporter / watcher', 'Name, email or currentUser()'],
  ['summary / description / text', 'Use ~ for contains'],
  ['labels', 'labels IN (webgl, ml)'],
  ['sprint', 'Sprint name or openSprints() / closedSprints() / futureSprints()'],
  ['epic / parent', 'Epic or parent key'],
  ['component / fixVersion', 'Component or version name'],
  ['storyPoints', 'Number — storyPoints >= 5'],
  ['created / updated / resolved / due', 'Date, relative (-7d, -2w) or startOfDay()'],
  ['flagged', 'flagged = Impediment'],
]

const OPERATORS: [string, string][] = [
  ['=  !=', 'Equals / not equals'],
  ['~  !~', 'Contains text / does not contain'],
  ['>  >=  <  <=', 'Comparisons for numbers, dates and priority'],
  ['IN (…)  NOT IN (…)', 'Matches any value in a list'],
  ['IS EMPTY  IS NOT EMPTY', 'Field has no value / has a value'],
  ['AND  OR  NOT  ( )', 'Combine and group clauses'],
  ['ORDER BY f [ASC|DESC], …', 'Sort results'],
]

const EXAMPLES: [string, string][] = [
  ['My open work', 'assignee = currentUser() AND statusCategory != Done ORDER BY priority DESC'],
  ['Bugs in the active sprint', 'type = Bug AND sprint IN openSprints() ORDER BY priority DESC'],
  ['Unassigned high priority', 'assignee IS EMPTY AND priority >= High ORDER BY created DESC'],
  ['Resolved this week', 'resolved >= startOfWeek() ORDER BY resolved DESC'],
  ['WebGL or ML work', 'labels IN (webgl, ml) AND statusCategory != Done'],
  ['Big stories without an epic', 'type = Story AND storyPoints >= 5 AND epic IS EMPTY'],
  ['Mentions “mastery”', 'text ~ "mastery" ORDER BY updated DESC'],
]

export function JqlHelp({ open, onClose, onApply }: { open: boolean; onClose: () => void; onApply: (jql: string) => void }) {
  return (
    <Modal open={open} onClose={onClose} title="JQL reference" width={860}>
      <p className="mb-5 text-sm text-muted">
        skatebored query language — a JQL-compatible way to search everything. Press <Kbd>Tab</Kbd> in the editor to accept a suggestion and <Kbd>Enter</Kbd> to search.
      </p>
      <div className="grid gap-8 md:grid-cols-2">
        <section>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-subtle uppercase">Fields</h3>
          <dl className="space-y-1.5 text-[13px]">
            {FIELDS.map(([f, d]) => (
              <div key={f} className="grid grid-cols-[150px_1fr] gap-3">
                <dt className="font-mono text-[12px] text-accent">{f}</dt>
                <dd className="text-muted">{d}</dd>
              </div>
            ))}
          </dl>
        </section>
        <div className="space-y-8">
          <section>
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-subtle uppercase">Operators & keywords</h3>
            <dl className="space-y-1.5 text-[13px]">
              {OPERATORS.map(([f, d]) => (
                <div key={f} className="grid grid-cols-[170px_1fr] gap-3">
                  <dt className="font-mono text-[12px] text-accent">{f}</dt>
                  <dd className="text-muted">{d}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section>
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-subtle uppercase">Examples — click to run</h3>
            <div className="space-y-1.5">
              {EXAMPLES.map(([label, jql]) => (
                <button
                  key={label}
                  onClick={() => {
                    onApply(jql)
                    onClose()
                  }}
                  className="block w-full rounded-lg border border-line px-3 py-2 text-left transition hover:border-accent hover:bg-hover"
                >
                  <span className="block text-[13px] font-medium">{label}</span>
                  <code className="block truncate font-mono text-[11.5px] text-muted">{jql}</code>
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>
    </Modal>
  )
}
