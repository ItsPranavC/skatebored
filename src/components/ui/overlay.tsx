import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { Check, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

// ───────────────────────────── Popover ─────────────────────────────

type Placement = 'bottom-start' | 'bottom-end' | 'top-start' | 'right-start'

export interface PopoverProps {
  /** Element that toggles the popover; must accept onClick + ref. */
  trigger: ReactElement<{ onClick?: (e: ReactMouseEvent) => void; ref?: unknown }>
  children: ReactNode | ((close: () => void) => ReactNode)
  placement?: Placement
  className?: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
  width?: number | 'trigger'
}

export function Popover({ trigger, children, placement = 'bottom-start', className, open: controlled, onOpenChange, width }: PopoverProps) {
  const [uncontrolled, setUncontrolled] = useState(false)
  const open = controlled ?? uncontrolled
  const setOpen = useCallback(
    (v: boolean) => {
      if (controlled === undefined) setUncontrolled(v)
      onOpenChange?.(v)
    },
    [controlled, onOpenChange],
  )
  const anchorRef = useRef<HTMLElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState<{ top: number; left: number; minWidth?: number; maxHeight: number } | null>(null)

  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const a = anchorRef.current?.getBoundingClientRect()
      const p = panelRef.current
      if (!a || !p) return
      const pw = p.offsetWidth
      const ph = p.offsetHeight
      const vw = window.innerWidth
      const vh = window.innerHeight
      let top = placement.startsWith('top') ? a.top - ph - 6 : placement === 'right-start' ? a.top : a.bottom + 6
      let left = placement.endsWith('end') ? a.right - pw : placement === 'right-start' ? a.right + 6 : a.left
      // flip vertically when there's no room below
      if (!placement.startsWith('top') && top + ph > vh - 8 && a.top - ph - 6 > 8) top = a.top - ph - 6
      left = Math.max(8, Math.min(left, vw - pw - 8))
      top = Math.max(8, top)
      setPos({ top, left, minWidth: width === 'trigger' ? a.width : undefined, maxHeight: vh - top - 12 })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, placement, width])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (panelRef.current?.contains(t) || anchorRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open, setOpen])

  useEffect(() => {
    if (!open) setPos(null)
  }, [open])

  const close = () => setOpen(false)
  const triggerEl = isValidElement(trigger)
    ? cloneElement(trigger, {
        ref: (el: HTMLElement | null) => {
          anchorRef.current = el
        },
        onClick: (e: ReactMouseEvent) => {
          e.stopPropagation()
          trigger.props.onClick?.(e)
          setOpen(!open)
        },
      } as never)
    : trigger

  return (
    <>
      {triggerEl}
      {open &&
        createPortal(
          <div
            ref={panelRef}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className={cn('animate-pop fixed z-[1000] overflow-auto rounded-xl border border-line bg-surface-2 shadow-pop', className)}
            style={{
              top: pos?.top ?? -9999,
              left: pos?.left ?? -9999,
              minWidth: pos?.minWidth,
              width: typeof width === 'number' ? width : undefined,
              maxHeight: pos?.maxHeight,
              visibility: pos ? 'visible' : 'hidden',
            }}
          >
            {typeof children === 'function' ? children(close) : children}
          </div>,
          document.body,
        )}
    </>
  )
}

// ───────────────────────────── Menu ─────────────────────────────

export interface MenuItem {
  label: ReactNode
  icon?: ReactNode
  onClick?: () => void
  danger?: boolean
  disabled?: boolean
  checked?: boolean
  shortcut?: string
  divider?: boolean
  heading?: boolean
}

export function Menu({ trigger, items, placement = 'bottom-end', width = 220 }: { trigger: PopoverProps['trigger']; items: MenuItem[]; placement?: Placement; width?: number }) {
  return (
    <Popover trigger={trigger} placement={placement} width={width} className="py-1.5">
      {(close) => (
        <div role="menu">
          {items.map((it, i) =>
            it.divider ? (
              <div key={i} className="my-1.5 h-px bg-line" />
            ) : it.heading ? (
              <div key={i} className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-subtle uppercase">
                {it.label}
              </div>
            ) : (
              <button
                key={i}
                role="menuitem"
                disabled={it.disabled}
                onClick={() => {
                  close()
                  it.onClick?.()
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] transition hover:bg-hover disabled:opacity-40',
                  it.danger ? 'text-accent' : 'text-fg',
                )}
              >
                {it.icon && <span className="grid w-4 place-items-center text-muted">{it.icon}</span>}
                <span className="flex-1 truncate">{it.label}</span>
                {it.checked && <Check className="size-4 text-accent" />}
                {it.shortcut && <span className="text-[11px] text-subtle">{it.shortcut}</span>}
              </button>
            ),
          )}
        </div>
      )}
    </Popover>
  )
}

// ───────────────────────────── Select (searchable) ─────────────────────────────

export interface Option<T extends string = string> {
  value: T
  label: string
  icon?: ReactNode
  hint?: ReactNode
  group?: string
}

export function SelectList<T extends string>({
  options,
  value,
  onSelect,
  multi,
  placeholder = 'Search…',
  searchable = true,
  footer,
  emptyText = 'No matches',
}: {
  options: Option<T>[]
  value: T | T[] | null
  onSelect: (v: T) => void
  multi?: boolean
  placeholder?: string
  searchable?: boolean
  footer?: ReactNode
  emptyText?: string
}) {
  const [q, setQ] = useState('')
  const [hi, setHi] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const filtered = options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase()))
  const selected = (v: T) => (Array.isArray(value) ? value.includes(v) : value === v)
  useEffect(() => setHi(0), [q])
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${hi}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [hi])
  let lastGroup: string | undefined
  return (
    <div className="flex max-h-[360px] flex-col">
      {searchable && (
        <div className="border-b border-line p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-subtle" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setHi((h) => Math.min(h + 1, filtered.length - 1))
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setHi((h) => Math.max(h - 1, 0))
                } else if (e.key === 'Enter' && filtered[hi]) {
                  e.preventDefault()
                  onSelect(filtered[hi]!.value)
                }
              }}
              placeholder={placeholder}
              className="h-8 w-full rounded-md border border-line bg-surface px-2 pl-8 text-[13px] outline-none focus:border-accent"
            />
          </div>
        </div>
      )}
      <div ref={listRef} className="overflow-auto py-1" role="listbox" aria-multiselectable={multi}>
        {filtered.length === 0 && <div className="px-3 py-3 text-center text-[13px] text-subtle">{emptyText}</div>}
        {filtered.map((o, i) => {
          const header = o.group && o.group !== lastGroup ? o.group : null
          lastGroup = o.group
          return (
            <div key={o.value}>
              {header && <div className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-subtle uppercase">{header}</div>}
              <button
                data-idx={i}
                role="option"
                aria-selected={selected(o.value)}
                onMouseEnter={() => setHi(i)}
                onClick={() => onSelect(o.value)}
                className={cn('flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px]', i === hi && 'bg-hover', selected(o.value) && 'text-accent')}
              >
                {multi && (
                  <span className={cn('grid size-4 place-items-center rounded border', selected(o.value) ? 'border-accent bg-accent text-ink' : 'border-line-strong')}>
                    {selected(o.value) && <Check className="size-3" />}
                  </span>
                )}
                {o.icon}
                <span className="flex-1 truncate text-fg">{o.label}</span>
                {o.hint && <span className="text-[11px] text-subtle">{o.hint}</span>}
                {!multi && selected(o.value) && <Check className="size-4 text-accent" />}
              </button>
            </div>
          )
        })}
      </div>
      {footer && <div className="border-t border-line p-1">{footer}</div>}
    </div>
  )
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  className,
  renderValue,
  searchable,
  width = 260,
  disabled,
}: {
  value: T | null
  onChange: (v: T) => void
  options: Option<T>[]
  placeholder?: string
  className?: string
  renderValue?: (o: Option<T> | undefined) => ReactNode
  searchable?: boolean
  width?: number
  disabled?: boolean
}) {
  const current = options.find((o) => o.value === value)
  const [open, setOpen] = useState(false)
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      width={width}
      trigger={
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'flex h-9 w-full items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 text-left text-sm transition hover:bg-surface-3 disabled:opacity-50',
            className,
          )}
        >
          {renderValue ? (
            renderValue(current)
          ) : current ? (
            <>
              {current.icon}
              <span className="flex-1 truncate">{current.label}</span>
            </>
          ) : (
            <span className="flex-1 text-subtle">{placeholder}</span>
          )}
          <svg viewBox="0 0 16 16" className="size-3.5 shrink-0 text-subtle" fill="currentColor">
            <path d="M4 6l4 4 4-4z" />
          </svg>
        </button>
      }
    >
      <SelectList
        options={options}
        value={value}
        searchable={searchable ?? options.length > 7}
        onSelect={(v) => {
          onChange(v)
          setOpen(false)
        }}
      />
    </Popover>
  )
}

// ───────────────────────────── Modal ─────────────────────────────

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = 600,
  className,
  bodyClassName,
  hideClose,
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  footer?: ReactNode
  width?: number
  className?: string
  bodyClassName?: string
  hideClose?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-[900] flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-[6vh] backdrop-blur-[2px]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
        className={cn('animate-pop relative flex max-h-[88vh] w-full flex-col rounded-2xl border border-line bg-surface shadow-pop', className)}
        style={{ maxWidth: width }}
      >
        {(title || !hideClose) && (
          <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-3">
            <h2 className="display text-xl">{title}</h2>
            {!hideClose && (
              <button onClick={onClose} aria-label="Close" className="-mr-2 grid size-8 place-items-center rounded-lg text-muted hover:bg-hover hover:text-fg">
                <X className="size-4" />
              </button>
            )}
          </div>
        )}
        <div className={cn('min-h-0 flex-1 overflow-y-auto px-6 pb-5', bodyClassName)}>{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-line px-6 py-3.5">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  children,
  confirmLabel = 'Delete',
  danger = true,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: ReactNode
  children?: ReactNode
  confirmLabel?: string
  danger?: boolean
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width={460}
      footer={
        <>
          <button className="h-8 rounded-lg px-3 text-[13px] font-medium text-muted hover:bg-hover hover:text-fg" onClick={onClose}>
            Cancel
          </button>
          <button
            autoFocus
            className={cn('h-8 rounded-lg px-3 text-[13px] font-semibold', danger ? 'bg-[#c92a2a] text-white hover:bg-[#e03131]' : 'bg-accent text-ink hover:bg-accent-hover')}
            onClick={() => {
              onConfirm()
              onClose()
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-sm text-muted">{children}</div>
    </Modal>
  )
}

// ───────────────────────────── Tooltip ─────────────────────────────

export function Tooltip({ label, children, side = 'top' }: { label: ReactNode; children: ReactNode; side?: 'top' | 'bottom' }) {
  return (
    <span className="group/tt relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute left-1/2 z-[1100] -translate-x-1/2 rounded-md bg-fg px-2 py-1 text-[11px] font-medium whitespace-nowrap text-canvas opacity-0 transition-opacity delay-300 group-hover/tt:opacity-100',
          side === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5',
        )}
      >
        {label}
      </span>
    </span>
  )
}
