import { useEffect, useId, useRef, useState } from 'react'
import { Calendar } from 'lucide-react'
import {
  applyDateKeystroke,
  displayDateToIso,
  isoDateToDisplay,
  isCompleteDateInput,
} from '../../lib/format'
import { FieldLabel } from './FieldLabel'

type DateFieldProps = {
  label: string
  value: string
  onChange: (isoDate: string) => void
  onBlur?: () => void
  required?: boolean
  disabled?: boolean
  error?: string
  hint?: string
  min?: string
  max?: string
}

/**
 * Day-first date field — digit-masked `DD.MM.YYYY` (רשומה), not the native
 * `type="date"` picker which follows the device mm/dd vs dd/mm preference.
 * Stored value stays ISO `YYYY-MM-DD`.
 */
export function DateField({
  label,
  value,
  onChange,
  onBlur,
  required,
  disabled,
  error,
  hint,
  min,
  max,
}: DateFieldProps) {
  const fieldId = useId()
  const pickerRef = useRef<HTMLInputElement>(null)
  const committedIso = useRef(value)
  const [display, setDisplay] = useState(() => isoDateToDisplay(value))

  useEffect(() => {
    if (value === committedIso.current) return
    committedIso.current = value
    setDisplay(isoDateToDisplay(value))
  }, [value])

  const describedBy =
    [error ? `${fieldId}-error` : null, hint ? `${fieldId}-hint` : null]
      .filter(Boolean)
      .join(' ') || undefined
  const isBlank = Boolean(required) && !value

  function commitIso(iso: string) {
    committedIso.current = iso
    onChange(iso)
  }

  function openPicker() {
    const picker = pickerRef.current
    if (!picker || disabled) return
    try {
      if (typeof picker.showPicker === 'function') picker.showPicker()
      else picker.click()
    } catch {
      picker.click()
    }
  }

  return (
    <div className="field">
      <FieldLabel htmlFor={fieldId} required={required}>
        {label}
      </FieldLabel>
      <div className="field__control ltr" dir="ltr">
        <input
          id={fieldId}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={10}
          className="field__input field__input--numeric field__input--with-affix ltr"
          dir="ltr"
          required={required}
          disabled={disabled}
          data-blank={isBlank ? 'true' : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          aria-label={`${label} (יום.חודש.שנה)`}
          value={display}
          onChange={(event) => {
            const next = applyDateKeystroke(display, event.target.value)
            setDisplay(next)
            if (!next) {
              commitIso('')
              return
            }
            const iso = displayDateToIso(next)
            if (iso) commitIso(iso)
          }}
          onBlur={() => {
            if (display && !isCompleteDateInput(display)) {
              setDisplay(isoDateToDisplay(committedIso.current))
            }
            onBlur?.()
          }}
        />
        <button
          type="button"
          className="field__affix"
          disabled={disabled}
          aria-label={`בחירת ${label} בלוח שנה`}
          onClick={openPicker}
        >
          <Calendar size={20} strokeWidth={1.75} />
        </button>
        <input
          ref={pickerRef}
          type="date"
          className="visually-hidden"
          tabIndex={-1}
          aria-hidden="true"
          disabled={disabled}
          min={min}
          max={max}
          value={value}
          onChange={(event) => {
            const iso = event.target.value
            commitIso(iso)
            setDisplay(isoDateToDisplay(iso))
          }}
        />
      </div>
      {error ? (
        <p id={`${fieldId}-error`} className="field__hint field__hint--error" role="alert">
          {error}
        </p>
      ) : null}
      {hint ? (
        <p id={`${fieldId}-hint`} className="field__hint">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
