import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Search } from 'lucide-react'
import { isSelectSearchNavKey, nextActiveIndex } from '../../lib/selectFieldNav'
import { filterSelectOptions } from '../../lib/searchQuery'

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
  /** Filter field at the top of the menu — used for long closed lists like כביש. */
  searchable?: boolean
  searchPlaceholder?: string
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
  searchable = false,
  searchPlaceholder = 'חיפוש',
}: SelectFieldProps) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const listboxId = `${fieldId}-listbox`
  const searchId = `${fieldId}-search`
  const describedBy = error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined
  const selectedValue = typeof value === 'string' ? value : value != null ? String(value) : ''
  const isBlank = Boolean(required) && !selectedValue
  const selected = options.find((option) => option.value === selectedValue)

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(-1)
  const [coords, setCoords] = useState<{
    top: number
    left: number
    width: number
    maxHeight: number
  } | null>(null)

  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const visibleOptions = useMemo(
    () => (searchable ? filterSelectOptions(options, query) : options),
    [options, query, searchable],
  )

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
      const maxHeight = Math.min(searchable ? 360 : 280, Math.max(120, openUp ? spaceAbove : spaceBelow))
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
  }, [open, options.length, searchable, visibleOptions.length])

  useEffect(() => {
    if (!open) {
      setQuery('')
      return
    }

    const selectedIndex = options.findIndex((option) => option.value === selectedValue)
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : options.length > 0 ? 0 : -1)
    queueMicrotask(() => {
      if (searchable) searchRef.current?.focus()
      else listRef.current?.focus()
    })

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
  }, [open, options, searchable, selectedValue])

  useEffect(() => {
    if (!open || activeIndex < 0) return
    const option = listRef.current?.querySelector<HTMLElement>(
      `[data-option-index="${activeIndex}"]`,
    )
    option?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, open])

  function closeMenu() {
    setOpen(false)
    setQuery('')
    triggerRef.current?.focus()
  }

  function commit(next: string) {
    onChange?.({ target: { value: next } })
    closeMenu()
  }

  function moveActive(delta: number) {
    setActiveIndex((index) => nextActiveIndex(index, visibleOptions.length, delta))
  }

  function onTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (disabled) return
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setOpen(true)
    }
  }

  function onListKeyDown(event: ReactKeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveActive(1)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveActive(-1)
      return
    }
    if (event.key === 'Home') {
      event.preventDefault()
      setActiveIndex(0)
      return
    }
    if (event.key === 'End') {
      event.preventDefault()
      setActiveIndex(visibleOptions.length - 1)
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      const option = visibleOptions[activeIndex]
      if (option) commit(option.value)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      closeMenu()
    }
  }

  function onSearchKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (!isSelectSearchNavKey(event.key)) return
    event.stopPropagation()
    onListKeyDown(event)
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
          <span className="select-field__value">{selected?.label ?? placeholder}</span>
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
            <div
              ref={menuRef}
              className="select-field__menu"
              style={{
                top: coords.top,
                left: coords.left,
                width: coords.width,
                maxHeight: coords.maxHeight,
              }}
            >
              {searchable ? (
                <div className="select-field__search">
                  <label className="search-field" htmlFor={searchId}>
                    <Search size={20} strokeWidth={1.75} aria-hidden="true" />
                    <input
                      ref={searchRef}
                      id={searchId}
                      type="search"
                      value={query}
                      placeholder={searchPlaceholder}
                      autoComplete="off"
                      aria-label={searchPlaceholder}
                      aria-controls={listboxId}
                      onChange={(event) => {
                        setQuery(event.target.value)
                        setActiveIndex(0)
                      }}
                      onKeyDown={onSearchKeyDown}
                    />
                  </label>
                </div>
              ) : null}
              <ul
                ref={listRef}
                id={listboxId}
                className="select-field__list"
                role="listbox"
                tabIndex={-1}
                aria-labelledby={fieldId}
                onKeyDown={onListKeyDown}
              >
                {visibleOptions.length === 0 ? (
                  <li className="select-field__empty t-caption text-muted" role="presentation">
                    {searchable && query.trim() ? 'אין תוצאות' : 'אין אפשרויות'}
                  </li>
                ) : (
                  visibleOptions.map((option, index) => {
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
              </ul>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
