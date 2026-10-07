import { useMemo, type ReactNode } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { TooltipContentProps, TooltipValueType } from 'recharts'
import type { Issue, Project, Sprint } from '@/types'
import { useStore } from '@/store/store'
import { cn } from '@/lib/utils'
import {
  computeBurndown,
  computeBurnup,
  computeCFD,
  computeControl,
  computeCreatedResolved,
  fmtDay,
  fmtDayTime,
  indexHistory,
  type Estimation,
} from './compute'

// ───────────────────────────── theme ─────────────────────────────

/** Validated categorical order (reference palette), stepped per theme. */
const SERIES = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
}

const THEMES = {
  dark: {
    series: SERIES.dark,
    grid: 'rgba(244,218,200,0.09)',
    axis: 'rgba(244,218,200,0.55)',
    ink: '#f4dac8',
    surface: '#0b0907',
    guide: 'rgba(244,218,200,0.42)',
    band: 'rgba(244,218,200,0.04)',
    now: '#f04c4c',
    status: { todo: '#7d716a', inprogress: '#6ea0ff', done: '#5cc47e' },
  },
  light: {
    series: SERIES.light,
    grid: 'rgba(61,36,18,0.09)',
    axis: 'rgba(31,19,11,0.55)',
    ink: '#1f130b',
    surface: '#ffffff',
    guide: 'rgba(31,19,11,0.4)',
    band: 'rgba(61,36,18,0.05)',
    now: '#e03e3e',
    status: { todo: '#b3a69c', inprogress: '#2a64d6', done: '#1f8a48' },
  },
}
export type ChartTheme = (typeof THEMES)['dark']

export function useChartTheme(): ChartTheme {
  const theme = useStore((s) => s.theme)
  return THEMES[theme]
}

export const axisProps = (th: ChartTheme) => ({
  tick: { fill: th.axis, fontSize: 11 },
  axisLine: false,
  tickLine: false,
  stroke: th.grid,
})

// ───────────────────────────── tooltip & legend ─────────────────────────────

interface TipRow {
  label: string
  value: ReactNode
  color: string
  dashed?: boolean
}

export function TipBox({ title, rows, children }: { title?: ReactNode; rows?: TipRow[]; children?: ReactNode }) {
  return (
    <div className="min-w-[160px] rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs shadow-pop">
      {title && <div className="mb-1.5 font-semibold text-muted">{title}</div>}
      {rows?.map((r) => (
        <div key={r.label} className="flex items-center gap-2 py-0.5">
          <span className="h-0.5 w-3 shrink-0 rounded" style={{ background: r.dashed ? `repeating-linear-gradient(90deg, ${r.color} 0 3px, transparent 3px 5px)` : r.color }} />
          <span className="font-semibold text-fg tabular-nums">{r.value}</span>
          <span className="text-muted">{r.label}</span>
        </div>
      ))}
      {children}
    </div>
  )
}

export function LegendRow({ items, className }: { items: { label: string; color: string; dashed?: boolean; box?: boolean }[]; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted', className)}>
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          {it.box ? (
            <span className="size-2.5 rounded-sm" style={{ background: it.color }} />
          ) : (
            <span
              className="h-0.5 w-4 rounded"
              style={{ background: it.dashed ? `repeating-linear-gradient(90deg, ${it.color} 0 4px, transparent 4px 7px)` : it.color }}
            />
          )}
          {it.label}
        </span>
      ))}
    </div>
  )
}

type RTip = TooltipContentProps<TooltipValueType, string | number>

export const unit = (mode: Estimation) => (mode === 'points' ? 'pts' : 'issues')

function useHistIndex() {
  const history = useStore((s) => s.history)
  return useMemo(() => indexHistory(history), [history])
}

// ───────────────────────────── burndown ─────────────────────────────

export function BurndownChart({ sprint, project, mode, height = 320, compact }: { sprint: Sprint; project: Project; mode: Estimation; height?: number; compact?: boolean }) {
  const th = useChartTheme()
  const issues = useStore((s) => s.issues)
  const hIndex = useHistIndex()
  const data = useMemo(() => computeBurndown(sprint, project, issues, hIndex, mode), [sprint, project, issues, hIndex, mode])
  if (!data) return <div className="grid h-40 place-items-center text-sm text-muted">This sprint hasn’t started yet.</div>
  const { window: win } = data
  return (
    <div>
      {!compact && (
        <LegendRow
          className="mb-3"
          items={[
            { label: 'Remaining', color: th.series[0]! },
            { label: 'Guideline', color: th.guide, dashed: true },
            ...(win.closed ? [] : [{ label: 'Today', color: th.now }]),
          ]}
        />
      )}
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data.series} margin={{ top: 8, right: 12, bottom: 0, left: compact ? -20 : -8 }}>
          <CartesianGrid vertical={false} stroke={th.grid} />
          {data.weekends.map(([a, b]) => (
            <ReferenceArea key={a} x1={a} x2={b} fill={th.band} strokeOpacity={0} ifOverflow="hidden" />
          ))}
          <XAxis dataKey="t" type="number" scale="time" domain={[win.start, win.end]} tickFormatter={fmtDay} {...axisProps(th)} minTickGap={24} />
          <YAxis {...axisProps(th)} allowDecimals={false} width={44} />
          {!win.closed && <ReferenceLine x={win.cutoff} stroke={th.now} strokeDasharray="3 3" strokeWidth={1.5} />}
          <Tooltip
            cursor={{ stroke: th.guide, strokeWidth: 1 }}
            content={(p: RTip) => {
              if (!p.active || !p.payload?.length) return null
              const row = p.payload[0]!.payload as { t: number; remaining: number | null; ideal: number | null }
              if (row.remaining == null) return null
              return <TipBox title={fmtDayTime(row.t)} rows={[{ label: `${unit(mode)} remaining`, value: row.remaining, color: th.series[0]! }]} />
            }}
          />
          <Line dataKey="ideal" stroke={th.guide} strokeDasharray="5 4" strokeWidth={1.5} dot={false} connectNulls isAnimationActive={false} />
          <Line dataKey="remaining" stroke={th.series[0]} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: th.surface, strokeWidth: 2 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ───────────────────────────── burnup ─────────────────────────────

export function BurnupChart({ sprint, project, mode, height = 320 }: { sprint: Sprint; project: Project; mode: Estimation; height?: number }) {
  const th = useChartTheme()
  const issues = useStore((s) => s.issues)
  const hIndex = useHistIndex()
  const data = useMemo(() => computeBurnup(sprint, project, issues, hIndex, mode), [sprint, project, issues, hIndex, mode])
  if (!data) return <div className="grid h-40 place-items-center text-sm text-muted">This sprint hasn’t started yet.</div>
  return (
    <div>
      <LegendRow
        className="mb-3"
        items={[
          { label: 'Work scope', color: th.series[1]! },
          { label: 'Completed', color: th.series[2]! },
          { label: 'Guideline', color: th.guide, dashed: true },
        ]}
      />
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data.points} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
          <CartesianGrid vertical={false} stroke={th.grid} />
          {data.weekends.map(([a, b]) => (
            <ReferenceArea key={a} x1={a} x2={b} fill={th.band} strokeOpacity={0} ifOverflow="hidden" />
          ))}
          <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={fmtDay} {...axisProps(th)} minTickGap={24} />
          <YAxis {...axisProps(th)} allowDecimals={false} width={44} />
          <Tooltip
            cursor={{ stroke: th.guide }}
            content={(p: RTip) => {
              if (!p.active || !p.payload?.length) return null
              const r = p.payload[0]!.payload as { t: number; scope: number | null; done: number | null; guide: number }
              if (r.scope == null) return null
              return (
                <TipBox
                  title={fmtDay(r.t)}
                  rows={[
                    { label: 'scope', value: r.scope, color: th.series[1]! },
                    { label: 'completed', value: r.done, color: th.series[2]! },
                    { label: 'guideline', value: Math.round(r.guide), color: th.guide, dashed: true },
                  ]}
                />
              )
            }}
          />
          <Line dataKey="guide" stroke={th.guide} strokeDasharray="5 4" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          <Line dataKey="scope" type="stepAfter" stroke={th.series[1]} strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line dataKey="done" type="stepAfter" stroke={th.series[2]} strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ───────────────────────────── velocity ─────────────────────────────

export function VelocityChart({ rows, mode, height = 320 }: { rows: { name: string; committed: number; completed: number }[]; mode: Estimation; height?: number }) {
  const th = useChartTheme()
  const committedColor = th.guide
  return (
    <div>
      <LegendRow
        className="mb-3"
        items={[
          { label: 'Commitment', color: committedColor, box: true },
          { label: 'Completed', color: th.series[0]!, box: true },
        ]}
      />
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -8 }} barGap={2} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke={th.grid} />
          <XAxis dataKey="name" {...axisProps(th)} interval={0} tickFormatter={(v: string) => v.replace(/^.*Sprint\s*/, 'Sprint ')} />
          <YAxis {...axisProps(th)} allowDecimals={false} width={44} />
          <Tooltip
            cursor={{ fill: th.band }}
            content={(p: RTip) =>
              p.active && p.payload?.length ? (
                <TipBox
                  title={String(p.label)}
                  rows={[
                    { label: `${unit(mode)} committed`, value: p.payload[0]?.value ?? 0, color: committedColor },
                    { label: `${unit(mode)} completed`, value: p.payload[1]?.value ?? 0, color: th.series[0]! },
                  ]}
                />
              ) : null
            }
          />
          <Bar dataKey="committed" fill={committedColor} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
          <Bar dataKey="completed" fill={th.series[0]} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ───────────────────────────── CFD ─────────────────────────────

export function CFDChart({ project, days, height = 360, hidden = [] }: { project: Project; days: number; height?: number; hidden?: string[] }) {
  const th = useChartTheme()
  const issues = useStore((s) => s.issues)
  const hIndex = useHistIndex()
  const rows = useMemo(() => computeCFD(project, issues, hIndex, days), [project, issues, hIndex, days])
  // Done at the bottom, To Do on top — the standard CFD stacking.
  const statuses = [...project.statuses].reverse().filter((s) => !hidden.includes(s.id))
  const colorOf = (id: string) => th.series[project.statuses.findIndex((s) => s.id === id) % th.series.length]!
  return (
    <div>
      <LegendRow className="mb-3" items={project.statuses.filter((s) => !hidden.includes(s.id)).map((s) => ({ label: s.name, color: colorOf(s.id), box: true }))} />
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
          <CartesianGrid vertical={false} stroke={th.grid} />
          <XAxis dataKey="label" {...axisProps(th)} minTickGap={28} />
          <YAxis {...axisProps(th)} allowDecimals={false} width={44} />
          <Tooltip
            cursor={{ stroke: th.guide }}
            content={(p: RTip) =>
              p.active && p.payload?.length ? (
                <TipBox
                  title={String(p.label)}
                  rows={[...p.payload].reverse().map((r) => ({
                    label: project.statuses.find((s) => s.id === r.dataKey)?.name ?? String(r.dataKey),
                    value: r.value ?? 0,
                    color: colorOf(String(r.dataKey)),
                  }))}
                />
              ) : null
            }
          />
          {statuses.map((s) => (
            <Area
              key={s.id}
              dataKey={s.id}
              stackId="1"
              type="stepAfter"
              stroke={th.surface}
              strokeWidth={1}
              fill={colorOf(s.id)}
              fillOpacity={0.85}
              isAnimationActive={false}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// ───────────────────────────── control chart ─────────────────────────────

export function ControlChart({ project, days, height = 360, onPick }: { project: Project; days: number; height?: number; onPick?: (i: Issue) => void }) {
  const th = useChartTheme()
  const issues = useStore((s) => s.issues)
  const hIndex = useHistIndex()
  const d = useMemo(() => computeControl(project, issues, hIndex, days), [project, issues, hIndex, days])
  const merged = useMemo(
    () => d.pts.map((p, k) => ({ t: p.t, days: +p.days.toFixed(2), avg: +d.rolling[k]!.avg.toFixed(2), key: p.issue.key, summary: p.issue.summary, issue: p.issue })),
    [d],
  )
  if (!d.pts.length) return <div className="grid h-40 place-items-center text-sm text-muted">No issues resolved in this period.</div>
  // Pad the time axis: issues resolved moments apart would otherwise give a zero-width domain with duplicate ticks.
  const ts = merged.map((m) => m.t)
  const lo = Math.min(...ts)
  const hi = Math.max(...ts)
  const pad = Math.max((hi - lo) * 0.05, 12 * 3_600_000)
  return (
    <div>
      <LegendRow
        className="mb-3"
        items={[
          { label: 'Issue', color: th.series[0]!, box: true },
          { label: `Rolling average (${d.window} issues)`, color: th.series[1]! },
          { label: 'Median', color: th.guide, dashed: true },
        ]}
      />
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={merged} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
          <CartesianGrid vertical={false} stroke={th.grid} />
          <XAxis dataKey="t" type="number" scale="time" domain={[lo - pad, hi + pad]} tickFormatter={fmtDay} {...axisProps(th)} minTickGap={24} />
          <YAxis {...axisProps(th)} width={44} unit="d" />
          <ReferenceLine y={d.median} stroke={th.guide} strokeDasharray="5 4" />
          <Tooltip
            cursor={{ stroke: th.guide }}
            content={(p: RTip) => {
              if (!p.active || !p.payload?.length) return null
              const r = p.payload[0]!.payload as { key: string; summary: string; days: number; avg: number; t: number }
              return (
                <TipBox
                  title={`${r.key} · resolved ${fmtDay(r.t)}`}
                  rows={[
                    { label: 'days cycle time', value: r.days, color: th.series[0]! },
                    { label: 'days rolling avg', value: r.avg, color: th.series[1]! },
                  ]}
                >
                  <div className="mt-1 max-w-[240px] truncate text-muted">{r.summary}</div>
                </TipBox>
              )
            }}
          />
          <Line dataKey="avg" stroke={th.series[1]} strokeWidth={2} dot={false} isAnimationActive={false} />
          <Scatter
            dataKey="days"
            fill={th.series[0]}
            stroke={th.surface}
            strokeWidth={2}
            isAnimationActive={false}
            cursor={onPick ? 'pointer' : undefined}
            onClick={(e: unknown) => {
              const issue = (e as { payload?: { issue?: Issue } })?.payload?.issue
              if (issue && onPick) onPick(issue)
            }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

// ───────────────────────────── created vs resolved ─────────────────────────────

export function CreatedResolvedChart({ issues, days, cumulative, height = 320 }: { issues: Issue[]; days: number; cumulative: boolean; height?: number }) {
  const th = useChartTheme()
  const d = useMemo(() => computeCreatedResolved(issues, days, cumulative), [issues, days, cumulative])
  return (
    <div>
      <LegendRow
        className="mb-3"
        items={[
          { label: `Created (${d.totalCreated})`, color: th.series[7]! },
          { label: `Resolved (${d.totalResolved})`, color: th.series[2]! },
        ]}
      />
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={d.rows} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
          <CartesianGrid vertical={false} stroke={th.grid} />
          <XAxis dataKey="label" {...axisProps(th)} minTickGap={28} />
          <YAxis {...axisProps(th)} allowDecimals={false} width={44} />
          <Tooltip
            cursor={{ stroke: th.guide }}
            content={(p: RTip) =>
              p.active && p.payload?.length ? (
                <TipBox
                  title={String(p.label)}
                  rows={[
                    { label: 'created', value: p.payload[0]?.value ?? 0, color: th.series[7]! },
                    { label: 'resolved', value: p.payload[1]?.value ?? 0, color: th.series[2]! },
                  ]}
                />
              ) : null
            }
          />
          <Line dataKey="created" type={cumulative ? 'monotone' : 'linear'} stroke={th.series[7]} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: th.surface, strokeWidth: 2 }} isAnimationActive={false} />
          <Line dataKey="resolved" type={cumulative ? 'monotone' : 'linear'} stroke={th.series[2]} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: th.surface, strokeWidth: 2 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ───────────────────────────── donut ─────────────────────────────

export function Donut({ rows, height = 240, showTable = true, colorFor }: { rows: { name: string; value: number }[]; height?: number; showTable?: boolean; colorFor?: (name: string, idx: number) => string }) {
  const th = useChartTheme()
  const total = rows.reduce((n, r) => n + r.value, 0)
  const color = (name: string, i: number) => colorFor?.(name, i) ?? th.series[i % th.series.length]!
  if (!total) return <div className="grid h-40 place-items-center text-sm text-muted">No issues match.</div>
  return (
    <div className={cn('flex flex-col gap-4', showTable && 'sm:flex-row sm:items-center')}>
      <div className="relative shrink-0" style={{ width: height, height, maxWidth: '100%' }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip
              content={(p: RTip) =>
                p.active && p.payload?.length ? (
                  <TipBox
                    rows={[
                      {
                        label: `${p.payload[0]!.name} · ${Math.round(((p.payload[0]!.value as number) / total) * 100)}%`,
                        value: p.payload[0]!.value,
                        color: (p.payload[0]!.payload?.fill as string) ?? th.series[0]!,
                      },
                    ]}
                  />
                ) : null
              }
            />
            <Pie data={rows} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="96%" paddingAngle={rows.length > 1 ? 1.5 : 0} stroke={th.surface} strokeWidth={2} isAnimationActive={false}>
              {rows.map((r, i) => (
                <Cell key={r.name} fill={color(r.name, i)} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <div className="display text-3xl">{total}</div>
            <div className="text-[11px] text-muted">issues</div>
          </div>
        </div>
      </div>
      {showTable && (
        <table className="w-full min-w-0 text-[13px]">
          <thead>
            <tr className="text-left text-[11px] tracking-wide text-subtle uppercase">
              <th className="pb-1.5 font-semibold">Value</th>
              <th className="pb-1.5 text-right font-semibold">Count</th>
              <th className="pb-1.5 text-right font-semibold">%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.name} className="border-t border-line">
                <td className="py-1.5">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="size-2.5 shrink-0 rounded-sm" style={{ background: color(r.name, i) }} />
                    <span className="truncate">{r.name}</span>
                  </span>
                </td>
                <td className="py-1.5 text-right tabular-nums">{r.value}</td>
                <td className="py-1.5 text-right text-muted tabular-nums">{Math.round((r.value / total) * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ───────────────────────────── workload ─────────────────────────────

export function WorkloadChart({
  rows,
  mode,
  height,
}: {
  rows: { name: string; todo: number; inprogress: number; done: number }[]
  mode: Estimation
  height?: number
}) {
  const th = useChartTheme()
  const h = height ?? Math.max(120, rows.length * 34 + 30)
  return (
    <div>
      <LegendRow
        className="mb-3"
        items={[
          { label: 'To do', color: th.status.todo, box: true },
          { label: 'In progress', color: th.status.inprogress, box: true },
          { label: 'Done', color: th.status.done, box: true },
        ]}
      />
      <ResponsiveContainer width="100%" height={h}>
        <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }} barCategoryGap="30%">
          <CartesianGrid horizontal={false} stroke={th.grid} />
          <XAxis type="number" {...axisProps(th)} allowDecimals={false} />
          <YAxis type="category" dataKey="name" {...axisProps(th)} width={110} tick={{ fill: th.ink, fontSize: 12 }} />
          <Tooltip
            cursor={{ fill: th.band }}
            content={(p: RTip) =>
              p.active && p.payload?.length ? (
                <TipBox
                  title={String(p.label)}
                  rows={[
                    { label: `${unit(mode)} to do`, value: p.payload[0]?.value ?? 0, color: th.status.todo },
                    { label: `${unit(mode)} in progress`, value: p.payload[1]?.value ?? 0, color: th.status.inprogress },
                    { label: `${unit(mode)} done`, value: p.payload[2]?.value ?? 0, color: th.status.done },
                  ]}
                />
              ) : null
            }
          />
          <Bar dataKey="todo" stackId="a" fill={th.status.todo} stroke={th.surface} strokeWidth={1} isAnimationActive={false} />
          <Bar dataKey="inprogress" stackId="a" fill={th.status.inprogress} stroke={th.surface} strokeWidth={1} isAnimationActive={false} />
          <Bar dataKey="done" stackId="a" fill={th.status.done} stroke={th.surface} strokeWidth={1} radius={[0, 4, 4, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ───────────────────────────── status bar ─────────────────────────────

/** Done / in progress / to do segmented bar (Jira's epic & version progress). */
export function StatusSplitBar({ todo, inprogress, done, className, labels }: { todo: number; inprogress: number; done: number; className?: string; labels?: boolean }) {
  const th = useChartTheme()
  const total = todo + inprogress + done
  const seg = (v: number, c: string, name: string) =>
    v > 0 ? <div title={`${name}: ${v}`} style={{ width: `${(v / total) * 100}%`, background: c }} className="h-full first:rounded-l-full last:rounded-r-full" /> : null
  return (
    <div className={className}>
      <div className="flex h-2 w-full gap-[2px] overflow-hidden rounded-full bg-surface-3">
        {total > 0 && (
          <>
            {seg(done, th.status.done, 'Done')}
            {seg(inprogress, th.status.inprogress, 'In progress')}
            {seg(todo, th.status.todo, 'To do')}
          </>
        )}
      </div>
      {labels && total > 0 && (
        <div className="mt-1 flex gap-3 text-[11px] text-muted tabular-nums">
          <span>{Math.round((done / total) * 100)}% done</span>
          <span>{inprogress} in progress</span>
          <span>{todo} to do</span>
        </div>
      )}
    </div>
  )
}
