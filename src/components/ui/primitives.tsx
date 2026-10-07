import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type Variant = 'primary' | 'default' | 'subtle' | 'ghost' | 'danger' | 'link'
type Size = 'xs' | 'sm' | 'md'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: ReactNode
  iconRight?: ReactNode
  active?: boolean
}

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-accent text-ink font-semibold hover:bg-accent-hover shadow-[inset_0_1px_0_rgb(255_255_255/.22)] disabled:opacity-50',
  default: 'bg-surface-3 text-fg hover:bg-active border border-line disabled:opacity-50',
  subtle: 'bg-transparent text-fg hover:bg-hover disabled:opacity-40',
  ghost: 'bg-transparent text-muted hover:text-fg hover:bg-hover disabled:opacity-40',
  danger: 'bg-[#c92a2a] text-white font-semibold hover:bg-[#e03131] disabled:opacity-50',
  link: 'bg-transparent text-accent hover:underline px-0! h-auto!',
}
const SIZES: Record<Size, string> = {
  xs: 'h-6 px-1.5 text-xs gap-1 rounded-md',
  sm: 'h-8 px-2.5 text-[13px] gap-1.5 rounded-lg',
  md: 'h-9 px-3.5 text-sm gap-2 rounded-lg',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'default', size = 'sm', icon, iconRight, active, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex shrink-0 items-center justify-center whitespace-nowrap font-medium tracking-[-0.01em] transition-colors duration-150 select-none',
        VARIANTS[variant],
        SIZES[size],
        !children && (size === 'xs' ? 'w-6 px-0' : size === 'sm' ? 'w-8 px-0' : 'w-9 px-0'),
        active && 'bg-active text-fg',
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
      {iconRight}
    </button>
  )
})

/** The brand's signature pill (red, with arrow chip) — used for hero CTAs. */
export function PillButton({ children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        'group inline-flex h-11 items-center gap-3 rounded-full bg-accent pr-1.5 pl-5 text-[15px] font-semibold tracking-[-0.01em] text-ink transition hover:-translate-y-px hover:bg-accent-hover',
        'shadow-[inset_0_1px_0_rgb(255_255_255/.22),0_10px_28px_-14px_rgb(240_76_76/.7)]',
        className,
      )}
      {...rest}
    >
      {children}
      <span className="grid size-8 place-items-center rounded-full bg-ink text-fg transition group-hover:translate-x-0.5">→</span>
    </button>
  )
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input(
  { className, invalid, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        'h-9 w-full rounded-lg border bg-surface-2 px-3 text-sm text-fg placeholder:text-subtle transition outline-none',
        'hover:bg-surface-3 focus:border-accent focus:bg-surface focus:ring-2 focus:ring-accent-soft',
        invalid ? 'border-accent' : 'border-line',
        className,
      )}
      {...rest}
    />
  )
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      className={cn(
        'w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-fg placeholder:text-subtle outline-none transition',
        'hover:bg-surface-3 focus:border-accent focus:bg-surface focus:ring-2 focus:ring-accent-soft',
        className,
      )}
      {...rest}
    />
  )
})

export function Field({ label, required, hint, error, children, className }: { label: ReactNode; required?: boolean; hint?: ReactNode; error?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1 block text-xs font-semibold text-muted">
        {label}
        {required && <span className="ml-0.5 text-accent">*</span>}
      </span>
      {children}
      {error ? <span className="mt-1 block text-xs text-accent">{error}</span> : hint ? <span className="mt-1 block text-xs text-subtle">{hint}</span> : null}
    </label>
  )
}

export function Checkbox({ checked, onChange, label, className }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; className?: string }) {
  return (
    <label className={cn('inline-flex cursor-pointer items-center gap-2 text-sm select-none', className)}>
      <span
        className={cn(
          'grid size-4 place-items-center rounded border transition',
          checked ? 'border-accent bg-accent text-ink' : 'border-line-strong bg-surface-2',
        )}
      >
        {checked && (
          <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M2.5 6.5l2.2 2L9.5 3.5" />
          </svg>
        )}
      </span>
      <input type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="inline-flex items-center gap-2 text-sm">
      <span className={cn('relative h-5 w-9 rounded-full transition', checked ? 'bg-accent' : 'bg-surface-3 ring-1 ring-line-strong')}>
        <span className={cn('absolute top-0.5 size-4 rounded-full bg-fg transition-all', checked ? 'left-[18px] bg-ink' : 'left-0.5')} />
      </span>
      {label}
    </button>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-grid min-w-5 place-items-center rounded border border-line-strong bg-surface-3 px-1 font-sans text-[11px] text-muted">{children}</kbd>
}

export function Badge({ children, className, tone = 'neutral' }: { children: ReactNode; className?: string; tone?: 'neutral' | 'accent' | 'info' | 'success' }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold',
        tone === 'neutral' && 'bg-surface-3 text-muted',
        tone === 'accent' && 'bg-accent text-ink',
        tone === 'info' && 'bg-progress text-progress-fg',
        tone === 'success' && 'bg-done text-done-fg',
        className,
      )}
    >
      {children}
    </span>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cn('inline-block size-4 animate-spin rounded-full border-2 border-line-strong border-t-accent', className)} />
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      {icon && <div className="mb-4 text-5xl">{icon}</div>}
      <h3 className="display text-2xl">{title}</h3>
      {children && <p className="mt-2 max-w-md text-sm text-muted">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Tabs<T extends string>({ value, onChange, tabs, className }: { value: T; onChange: (v: T) => void; tabs: { id: T; label: ReactNode }[]; className?: string }) {
  return (
    <div role="tablist" className={cn('flex gap-1 border-b border-line', className)}>
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            '-mb-px border-b-2 px-2.5 pt-1 pb-2 text-sm font-medium transition',
            value === t.id ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

export function ProgressBar({ segments, className }: { segments: { value: number; color: string; label?: string }[]; className?: string }) {
  const total = segments.reduce((n, s) => n + s.value, 0) || 1
  return (
    <div className={cn('flex h-2 w-full overflow-hidden rounded-full bg-surface-3', className)}>
      {segments.map((s, i) =>
        s.value > 0 ? <div key={i} title={s.label ? `${s.label}: ${s.value}` : undefined} style={{ width: `${(s.value / total) * 100}%`, background: s.color }} /> : null,
      )}
    </div>
  )
}

export function PageHeader({ breadcrumbs, title, actions, children }: { breadcrumbs?: ReactNode; title: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="px-8 pt-6 pb-4">
      {breadcrumbs && <div className="mb-2 flex items-center gap-1.5 text-[13px] text-muted">{breadcrumbs}</div>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="display text-[28px]">{title}</h1>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </div>
  )
}
