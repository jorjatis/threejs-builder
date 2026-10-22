import type {
  ReactNode,
  InputHTMLAttributes,
  SelectHTMLAttributes,
  ChangeEvent,
} from 'react'
import { Info, ChevronDown, Plus, Minus, RotateCcw, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatColorAlpha, parseColorAlpha } from '../utils/colorAlpha'

export function Switch({
  checked,
  onChange,
  disabled,
  id,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  id?: string
}) {
  return (
    <label className="switch">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="switch__track">
        <span className="switch__thumb" />
      </span>
    </label>
  )
}

export function InfoTip({ text }: { text: string }) {
  const wrapRef = useRef<HTMLSpanElement>(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const tipId = useId()

  useEffect(() => {
    if (!open || !wrapRef.current) return
    const rect = wrapRef.current.getBoundingClientRect()
    const width = Math.min(260, window.innerWidth - 24)
    let left = rect.right - width
    if (left < 12) left = 12
    if (left + width > window.innerWidth - 12) left = window.innerWidth - width - 12
    let top = rect.bottom + 6
    if (top + 120 > window.innerHeight) top = Math.max(12, rect.top - 8)
    setPos({ top, left })
  }, [open])

  return (
    <>
      <span
        ref={wrapRef}
        className="tooltip-wrap"
        tabIndex={0}
        aria-label={text}
        aria-describedby={open ? tipId : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        <Info size={13} />
      </span>
      {open &&
        createPortal(
          <span
            id={tipId}
            className="tooltip tooltip--visible"
            role="tooltip"
            style={{ top: pos.top, left: pos.left }}
          >
            {text}
          </span>,
          document.body,
        )}
    </>
  )
}

export function Field({
  label,
  children,
  tip,
  onReset,
  resetTitle = 'Restablecer valor',
}: {
  label: string
  children: ReactNode
  tip?: string
  onReset?: () => void
  resetTitle?: string
}) {
  return (
    <div className="field">
      <div className="field__label-row">
        <label>
          {label}
          {tip ? <InfoTip text={tip} /> : null}
        </label>
        {onReset ? (
          <button
            type="button"
            className="btn btn--icon field__reset"
            title={resetTitle}
            aria-label={resetTitle}
            onClick={onReset}
          >
            <RotateCcw size={12} />
          </button>
        ) : null}
      </div>
      {children}
    </div>
  )
}

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`text-input${className ? ` ${className}` : ''}`} {...props} />
}

export function NumberInput({
  min = 0,
  max,
  step = 1,
  value,
  onChange,
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { min?: number; max?: number }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const num = typeof value === 'number' ? value : Number(value)
  const stepNum = Number(step) || 1

  function emit(next: number) {
    const el = inputRef.current
    if (!el) return
    let v = next
    if (min != null && v < Number(min)) v = Number(min)
    if (max != null && v > Number(max)) v = Number(max)
    const rounded = Math.round(v / stepNum) * stepNum
    const precision = String(stepNum).includes('.')
      ? (String(stepNum).split('.')[1]?.length ?? 0)
      : 0
    const final = Number(rounded.toFixed(precision))
    el.value = String(final)
    onChange?.({ target: el, currentTarget: el } as ChangeEvent<HTMLInputElement>)
  }

  return (
    <div className={`number-field${className ? ` ${className}` : ''}`}>
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        className="number-field__input"
        value={Number.isFinite(num) ? value : ''}
        onChange={(e) => {
          const raw = e.target.value.replace(',', '.')
          if (raw === '' || raw === '-' || raw === '.') {
            onChange?.(e)
            return
          }
          if (!Number.isFinite(Number(raw))) return
          onChange?.(e)
        }}
        onBlur={() => {
          if (!Number.isFinite(num)) emit(Number(min) || 0)
          else emit(num)
        }}
        {...rest}
      />
      <div className="number-field__steppers">
        <button
          type="button"
          className="number-field__btn"
          tabIndex={-1}
          aria-label="Subir"
          onClick={() => emit((Number.isFinite(num) ? num : Number(min) || 0) + stepNum)}
        >
          <Plus size={12} />
        </button>
        <button
          type="button"
          className="number-field__btn"
          tabIndex={-1}
          aria-label="Bajar"
          onClick={() => emit((Number.isFinite(num) ? num : Number(min) || 0) - stepNum)}
        >
          <Minus size={12} />
        </button>
      </div>
    </div>
  )
}

/** Slider + número (+/−). Ideal para intensidad, exposición, etc. */
export function SliderInput({
  value,
  min,
  max,
  step = 0.05,
  onChange,
  disabled,
}: {
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  disabled?: boolean
}) {
  const safe = Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min
  return (
    <div className="slider-row">
      <input
        type="range"
        className="slider-range"
        min={min}
        max={max}
        step={step}
        value={safe}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <NumberInput
        className="input-compact slider-row__num"
        value={safe}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value) || min)}
      />
    </div>
  )
}

export function Select({
  children,
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={`select-wrap${className ? ` ${className}` : ''}`}>
      <select className="select-native" {...props}>
        {children}
      </select>
      <ChevronDown size={14} className="select-wrap__icon" aria-hidden />
    </div>
  )
}

export function ColorInput({
  value,
  onChange,
  title,
  disabled,
  withAlpha = false,
}: {
  value: string
  onChange: (hex: string) => void
  title?: string
  disabled?: boolean
  /** Si true, al abrir muestra control de opacidad (0 = transparente). */
  withAlpha?: boolean
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const parsed = parseColorAlpha(value)
  const hex = parsed.hex
  const alpha = parsed.alpha

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      // El diálogo nativo de color está fuera del DOM: no cerrar mientras se usa
      const ae = document.activeElement
      if (ae instanceof HTMLInputElement && ae.type === 'color') return
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!withAlpha) {
    return (
      <label className={`color-field${disabled ? ' color-field--disabled' : ''}`} title={title}>
        <input
          type="color"
          value={hex}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    )
  }

  const swatchStyle =
    alpha <= 0.001
      ? undefined
      : { backgroundColor: hex, opacity: Math.max(alpha, 0.15) }

  function commitColor(nextHex: string) {
    // Elegir color siempre deja opacidad usable (si estaba a 0 → 100%)
    onChange(formatColorAlpha(nextHex, alpha <= 0.001 ? 1 : alpha))
  }

  function commitAlpha(nextAlpha: number) {
    onChange(formatColorAlpha(hex, nextAlpha))
  }

  return (
    <div className="color-picker" ref={wrapRef}>
      <button
        type="button"
        className={`color-field color-field--swatch${disabled ? ' color-field--disabled' : ''}${
          alpha <= 0.001 ? ' color-field--clear' : ''
        }`}
        title={title ?? 'Color'}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => !disabled && setOpen((v) => !v)}
      >
        <span className="color-field__fill" style={swatchStyle} />
      </button>
      {open && (
        <div
          className="color-picker__pop"
          role="dialog"
          aria-label="Color y opacidad"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <label className="color-picker__row">
            <span>Color</span>
            <input
              type="color"
              value={hex}
              onInput={(e) => commitColor((e.target as HTMLInputElement).value)}
              onChange={(e) => commitColor(e.target.value)}
            />
          </label>
          <label className="color-picker__row color-picker__row--alpha">
            <span>Opacidad</span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(alpha * 100)}
              onInput={(e) =>
                commitAlpha(Number((e.target as HTMLInputElement).value) / 100)
              }
              onChange={(e) => commitAlpha(Number(e.target.value) / 100)}
            />
            <span className="color-picker__pct">{Math.round(alpha * 100)}%</span>
          </label>
        </div>
      )}
    </div>
  )
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="section-block">
      <div className="section-block__title">{title}</div>
      {children}
    </div>
  )
}

export function Collapse({
  title,
  children,
  defaultOpen = false,
}: {
  title: ReactNode
  children: ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <details
      className="collapse"
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="collapse__summary">
        <span className="collapse__title">{title}</span>
        <ChevronDown className="collapse__chevron" size={16} aria-hidden />
      </summary>
      <div className="collapse__body">{children}</div>
    </details>
  )
}

export function Badge({
  children,
  tone = 'default',
}: {
  children: ReactNode
  tone?: 'default' | 'lossy' | 'ok' | 'err' | 'info'
}) {
  const cls =
    tone === 'lossy'
      ? 'badge badge--lossy'
      : tone === 'ok'
        ? 'badge badge--ok'
        : tone === 'err'
          ? 'badge badge--err'
          : tone === 'info'
            ? 'badge badge--info'
            : 'badge'
  return <span className={cls}>{children}</span>
}

/** Cabecera + cuerpo estándar de los paneles laterales. */
export function PanelShell({
  title,
  children,
  headerExtra,
}: {
  title: ReactNode
  children: ReactNode
  headerExtra?: ReactNode
}) {
  return (
    <>
      <div className="tools-panel__header">
        <h1>{title}</h1>
        {headerExtra}
      </div>
      <div className="tools-panel__body">{children}</div>
    </>
  )
}

export function Stat({
  label,
  value,
  meta,
}: {
  label: string
  value: string
  meta?: string
}) {
  return (
    <div className="stat-item">
      <div className="stat-item__label">{label}</div>
      <div className="stat-item__value">{value}</div>
      {meta ? <div className="stat-item__meta">{meta}</div> : null}
    </div>
  )
}

/** Tabs / segmented control (Optimización, filtros, etc.). */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T
  onChange: (v: T) => void
  options: { id: T; label: ReactNode }[]
  ariaLabel?: string
}) {
  return (
    <div className="tabs" role="tablist" aria-label={ariaLabel}>
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          role="tab"
          aria-selected={value === opt.id}
          className={value === opt.id ? 'active' : undefined}
          onClick={() => onChange(opt.id)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

type ModalSize = 'sm' | 'md' | 'lg' | 'console' | 'pipeline'

/** Modal con backdrop, Escape y clic fuera. */
export function AppModal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  role = 'dialog',
  labelledBy,
  className,
  bodyClassName,
  footerClassName = 'modal__footer modal__footer--actions',
  hideClose,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: ModalSize
  role?: 'dialog' | 'alertdialog'
  labelledBy?: string
  className?: string
  bodyClassName?: string
  footerClassName?: string
  hideClose?: boolean
}) {
  const titleId = useId()
  const labelId = labelledBy ?? titleId

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const sizeClass =
    size === 'sm'
      ? 'modal--sm'
      : size === 'lg'
        ? 'modal--lg'
        : size === 'console'
          ? 'modal--console'
          : size === 'pipeline'
            ? 'modal--pipeline'
            : ''

  return createPortal(
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className={`modal${sizeClass ? ` ${sizeClass}` : ''}${className ? ` ${className}` : ''}`}
        role={role}
        aria-modal="true"
        aria-labelledby={labelId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal__header">
          <h2 id={labelId}>{title}</h2>
          {!hideClose ? (
            <button
              type="button"
              className="btn btn--icon"
              aria-label="Cerrar"
              onClick={onClose}
            >
              <X size={15} />
            </button>
          ) : null}
        </div>
        <div className={`modal__body${bodyClassName ? ` ${bodyClassName}` : ''}`}>{children}</div>
        {footer != null ? <div className={footerClassName}>{footer}</div> : null}
      </div>
    </div>,
    document.body,
  )
}
