import { useId } from 'react'
import { applyTimeKeystroke, isCompleteTimeInput } from '../../lib/format'

type TimeFieldProps = {
  label: string
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
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
export function TimeField({ label, value, onChange, onBlur }: TimeFieldProps) {
  const fieldId = useId()

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
            onChange(nowTimeJerusalem())
            onBlur?.()
          }}
        >
          עכשיו
        </button>
      </div>
      <div className="field__control">
        <input
          id={fieldId}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="14:30"
          maxLength={5}
          className="field__input field__input--numeric ltr"
          dir="ltr"
          aria-label={`${label} (24 שעות)`}
          value={value}
          onChange={(event) => onChange(applyTimeKeystroke(value, event.target.value))}
          onBlur={() => {
            if (value && !isCompleteTimeInput(value)) onChange('')
            onBlur?.()
          }}
        />
      </div>
    </div>
  )
}
