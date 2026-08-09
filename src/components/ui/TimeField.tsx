import { useId } from 'react'

type TimeFieldProps = {
  label: string
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
}

/** Current time in Asia/Jerusalem as `HH:MM`. */
export function nowTimeJerusalem(): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date())
  const hour = parts.find((part) => part.type === 'hour')?.value ?? '00'
  const minute = parts.find((part) => part.type === 'minute')?.value ?? '00'
  return `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`
}

/** Native time input + עכשיו — previous field chrome, keep now action. */
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
          type="time"
          className="field__input field__input--numeric ltr"
          dir="ltr"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
        />
      </div>
    </div>
  )
}
