import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'

type Option = { value: string; label: string }

type SelectFieldProps = {
  label: string
  options: Option[]
  value?: string | number | readonly string[]
  onChange?: (event: { target: { value: string } }) => void
  hint?: string
  error?: string
  placeholder?: string
  required?: boolean
  disabled?: boolean
  id?: string
  name?: string
}

export function SelectField({
  label,
  options,
  hint,
  error,
  placeholder = 'בחירה',
  id,
  required,
  value,
  onChange,
  disabled,
  name,
}: SelectFieldProps) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const listboxId = `${fieldId}-listbox`
  const describedBy = error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined
  const selectedValue = typeof value === 'string' ? value : value != null ? String(value) : ''
  const isBlank = Boolean(required) && !selectedValue
  const selected = options.find((option) => option.value === selectedValue)

  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [coords, setCoords] = useState<{
    top: number
    left: number
    width: number
    maxHeight: number
  } | null>(null)

  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLUListElement>(null)

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setCoords(null)
      return
    }

    function place() {
      const trigger = triggerRef.current
      if (!trigger) return
      const rect = trigger.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom - 8
      const spaceAbove = rect.top - 8
      const openUp = spaceBelow < 160 && spaceAbove > spaceBelow
      const maxHeight = Math.min(280, Math.max(120, openUp ? spaceAbove : spaceBelow))
      const top = openUp ? Math.max(8, rect.top - maxHeight - 4) : rect.bottom + 4
      setCoords({
        top,
        left: rect.left,
        width: rect.width,
        maxHeight,
      })
    }

    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, options.length])

  useEffect(() => {
    if (!open) return

    const selectedIndex = options.findIndex((option) => option.value === selectedValue)
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0)
    // Defer so the portal listbox exists before focusing.
    queueMicrotask(() => menuRef.current?.focus())

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        triggerRef.current?.focus()
      }
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, options, selectedValue])

  useEffect(() => {
    if (!open || activeIndex < 0) return
    const option = menuRef.current?.querySelector<HTMLElement>(
      `[data-option-index="${activeIndex}"]`,
    )
    option?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, open])

  function commit(next: string) {
    onChange?.({ target: { value: next } })
    setOpen(false)
    triggerRef.current?.focus()
  }

  function onTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (disabled) return
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setOpen(true)
    }
  }

  function onMenuKeyDown(event: ReactKeyboardEvent<HTMLUListElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => Math.min(options.length - 1, Math.max(0, index) + 1))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => Math.max(0, (index < 0 ? options.length : index) - 1))
      return
    }
    if (event.key === 'Home') {
      event.preventDefault()
      setActiveIndex(0)
      return
    }
    if (event.key === 'End') {
      event.preventDefault()
      setActiveIndex(options.length - 1)
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      const option = options[activeIndex]
      if (option) commit(option.value)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
      triggerRef.current?.focus()
    }
  }

  return (
    <div className="field select-field" ref={rootRef}>
      <label className="field__label" htmlFor={fieldId}>
        {label}
        {required ? <span className="visually-hidden"> שדה חובה</span> : null}
      </label>
      <div className="field__control">
        {name ? <input type="hidden" name={name} value={selectedValue} /> : null}
        <button
          ref={triggerRef}
          type="button"
          id={fieldId}
          className={[
            'field__input',
            'field__select',
            'select-field__trigger',
            !selectedValue ? 'select-field__trigger--placeholder' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          data-blank={isBlank ? 'true' : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listboxId : undefined}
          disabled={disabled}
          onClick={() => {
            if (!disabled) setOpen((current) => !current)
          }}
          onKeyDown={onTriggerKeyDown}
        >
          <span className="select-field__value">
            {selected?.label ?? placeholder}
          </span>
        </button>
        <span
          className={['field__affix', open ? 'select-field__chevron is-open' : 'select-field__chevron']
            .filter(Boolean)
            .join(' ')}
          aria-hidden="true"
        >
          <ChevronDown size={20} strokeWidth={1.75} />
        </span>
      </div>
      {error ? (
        <p id={`${fieldId}-error`} className="field__hint field__hint--error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${fieldId}-hint`} className="field__hint">
          {hint}
        </p>
      ) : null}

      {open && coords
        ? createPortal(
            <ul
              ref={menuRef}
              id={listboxId}
              className="select-field__menu"
              role="listbox"
              tabIndex={-1}
              aria-labelledby={fieldId}
              style={{
                top: coords.top,
                left: coords.left,
                width: coords.width,
                maxHeight: coords.maxHeight,
              }}
              onKeyDown={onMenuKeyDown}
            >
              {options.length === 0 ? (
                <li className="select-field__empty t-caption text-muted" role="presentation">
                  אין אפשרויות
                </li>
              ) : (
                options.map((option, index) => {
                  const isSelected = option.value === selectedValue
                  const isActive = index === activeIndex
                  return (
                    <li key={option.value} role="presentation">
                      <button
                        type="button"
                        role="option"
                        data-option-index={index}
                        className={[
                          'select-field__option',
                          isSelected ? 'is-selected' : '',
                          isActive ? 'is-active' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        aria-selected={isSelected}
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => commit(option.value)}
                      >
                        <span className="select-field__option-label">{option.label}</span>
                        {isSelected ? (
                          <Check size={18} strokeWidth={2} aria-hidden="true" />
                        ) : null}
                      </button>
                    </li>
                  )
                })
              )}
            </ul>,
            document.body,
          )
        : null}
    </div>
  )
}
