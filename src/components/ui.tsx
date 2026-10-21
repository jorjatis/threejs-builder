import type {
  ReactNode,
  InputHTMLAttributes,
  SelectHTMLAttributes,
  ChangeEvent,
} from 'react'
import { Info, ChevronDown, Plus, Minus } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

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
}: {
  label: string
  children: ReactNode
  tip?: string
}) {
  return (
    <div className="field">
      <label>
        {label}
        {tip ? <InfoTip text={tip} /> : null}
      </label>
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
}: {
  value: string
  onChange: (hex: string) => void
  title?: string
}) {
  return (
    <label className="color-field" title={title}>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
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
  title: string
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
