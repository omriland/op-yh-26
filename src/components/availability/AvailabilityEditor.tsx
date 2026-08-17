import { Check } from 'lucide-react'
import { useState, type KeyboardEvent } from 'react'
import {
  AVAILABILITY_OPTIONS,
  availabilityReturnCaption,
  buildAvailabilityWrite,
  effectiveAvailability,
  israelToday,
  tomorrowJerusalem,
  type AvailabilityStatus,
  type AvailabilityWrite,
} from '../../lib/availability'
import { TextField } from '../ui/TextField'
import { AvailabilityDot } from './AvailabilityDot'

export function AvailabilityEditor({
  formId = 'availability-form',
  initialStatus,
  initialAvailableFrom,
  disabled = false,
  disabledCaption,
  saving = false,
  onSave,
}: {
  formId?: string
  initialStatus: AvailabilityStatus
  initialAvailableFrom: string | null
  disabled?: boolean
  disabledCaption?: string
  saving?: boolean
  onSave: (write: Extract<AvailabilityWrite, { ok: true }>) => void
}) {
  const today = israelToday()
  const [status, setStatus] = useState<AvailabilityStatus>(() =>
    effectiveAvailability(initialStatus, initialAvailableFrom, today),
  )
  const [availableFrom, setAvailableFrom] = useState(
    () =>
      status === 'unavailable' &&
      initialAvailableFrom &&
      initialAvailableFrom > today
        ? initialAvailableFrom
        : '',
  )
  const [error, setError] = useState<string | undefined>()

  function commit(next: { status: AvailabilityStatus; availableFrom: string }) {
    if (disabled || saving) return
    const write = buildAvailabilityWrite({
      status: next.status,
      availableFrom: next.status === 'unavailable' ? next.availableFrom : null,
      today,
    })
    if (!write.ok) {
      setError(write.error)
      return
    }
    setError(undefined)
    onSave(write)
  }

  function selectStatus(next: AvailabilityStatus) {
    if (disabled || saving) return
    const from = next === 'available' ? '' : availableFrom
    setStatus(next)
    if (next === 'available') setAvailableFrom('')
    setError(undefined)
    commit({ status: next, availableFrom: from })
  }

  function onChoiceKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    event.preventDefault()
    const next = status === 'available' ? 'unavailable' : 'available'
    selectStatus(next)
    const group = event.currentTarget.closest('[role="radiogroup"]')
    const options = group?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
    if (!options?.length) return
    const current = [...options].indexOf(event.currentTarget)
    options[current === 0 ? 1 : 0]?.focus()
  }

  return (
    <div id={formId} className="availability-editor stack-4">
      {disabled && disabledCaption ? (
        <p className="alert alert--info" role="status">
          {disabledCaption}
        </p>
      ) : null}
      <div className="availability-choice" role="radiogroup" aria-label="זמינות">
        {AVAILABILITY_OPTIONS.map((option) => {
          const selected = status === option.value
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              className="availability-choice__option"
              disabled={disabled || saving}
              onClick={() => selectStatus(option.value)}
              onKeyDown={onChoiceKeyDown}
            >
              <span aria-hidden="true">
                <AvailabilityDot status={option.value} />
              </span>
              <span className="availability-choice__label">{option.label}</span>
              {selected ? (
                <Check
                  className="availability-choice__check"
                  size={20}
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              ) : null}
            </button>
          )
        })}
      </div>
      {status === 'unavailable' ? (
        <TextField
          label="תאריך חזרה"
          type="date"
          isolate
          min={tomorrowJerusalem(today)}
          value={availableFrom}
          hint="ללא תאריך — השאירו ריק."
          error={error}
          disabled={disabled || saving}
          onChange={(event) => {
            const next = event.target.value
            setAvailableFrom(next)
            commit({ status: 'unavailable', availableFrom: next })
          }}
        />
      ) : null}
      {status === 'unavailable' && availableFrom && availableFrom > today ? (
        <p className="t-caption text-muted">{availabilityReturnCaption(availableFrom)}</p>
      ) : null}
    </div>
  )
}
