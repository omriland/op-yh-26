import { useId, useRef, type RefObject } from 'react'
import {
  applyTimeKeystroke,
  isCompleteTimeInput,
  shouldAdvanceAfterTimeEntry,
} from '../../lib/format'

type TimeFieldProps = {
  label: string
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  inputRef?: RefObject<HTMLInputElement | null>
  /** Fired once the 4th digit lands — used to hop to the next time field. */
  onComplete?: () => void
}

/** Current time in Asia/Jerusalem as `HH:MM` (24-hour). */
export function nowTimeJerusalem(): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  }).formatToParts(new Date())
  const hour = parts.find((part) => part.type === 'hour')?.value ?? '00'
  const minute = parts.find((part) => part.type === 'minute')?.value ?? '00'
  return `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`
}

/**
 * 24-hour time field — digit-masked `HH:mm` (same pattern as Android), not the
 * native `type="time"` picker which follows the device 12/24 preference.
 */
export function TimeField({
  label,
  value,
  onChange,
  onBlur,
  inputRef,
  onComplete,
}: TimeFieldProps) {
  const fieldId = useId()
  // Auto-advance moves focus inside `onChange`, so the blur that follows still
  // closes over the pre-change `value`. Track the freshest one for the guard
  // below, or it would clear a time the typist just finished.
  const latestValue = useRef(value)
  latestValue.current = value

  return (
    <div className="field">
      <div className="time-field__label-row">
        <label className="field__label" htmlFor={fieldId}>
          {label}
        </label>
        <button
          type="button"
          className="time-field__now"
          onClick={() => {
            const now = nowTimeJerusalem()
            latestValue.current = now
            onChange(now)
            onBlur?.()
          }}
        >
          עכשיו
        </button>
      </div>
      <div className="field__control">
        <input
          id={fieldId}
          ref={inputRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={5}
          className="field__input field__input--numeric ltr"
          dir="ltr"
          aria-label={`${label} (24 שעות)`}
          value={value}
          onChange={(event) => {
            const next = applyTimeKeystroke(value, event.target.value)
            latestValue.current = next
            onChange(next)
            if (shouldAdvanceAfterTimeEntry(value, next)) onComplete?.()
          }}
          onBlur={() => {
            const current = latestValue.current
            if (current && !isCompleteTimeInput(current)) onChange('')
            onBlur?.()
          }}
        />
      </div>
    </div>
  )
}
