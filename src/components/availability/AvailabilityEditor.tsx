import { useState } from 'react'
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
import { Button } from '../ui/Button'
import { FilterChips } from '../ui/FilterChips'
import { TextField } from '../ui/TextField'

export function AvailabilityEditor({
  formId = 'availability-form',
  initialStatus,
  initialAvailableFrom,
  disabled = false,
  disabledCaption,
  saving = false,
  showActions = true,
  onSave,
  onCancel,
}: {
  formId?: string
  initialStatus: AvailabilityStatus
  initialAvailableFrom: string | null
  disabled?: boolean
  disabledCaption?: string
  saving?: boolean
  showActions?: boolean
  onSave: (write: Extract<AvailabilityWrite, { ok: true }>) => void
  onCancel?: () => void
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

  function submit() {
    if (disabled) return
    const write = buildAvailabilityWrite({
      status,
      availableFrom: status === 'unavailable' ? availableFrom : null,
      today,
    })
    if (!write.ok) {
      setError(write.error)
      return
    }
    onSave(write)
  }

  return (
    <form
      id={formId}
      className="stack-4"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      {disabled && disabledCaption ? (
        <p className="alert alert--info" role="status">
          {disabledCaption}
        </p>
      ) : null}
      <FilterChips
        label="זמינות"
        value={status}
        options={AVAILABILITY_OPTIONS}
        onChange={(next) => {
          if (disabled) return
          setStatus(next)
          setError(undefined)
          if (next === 'available') setAvailableFrom('')
        }}
      />
      {status === 'unavailable' ? (
        <TextField
          label="תאריך חזרה"
          type="date"
          isolate
          min={tomorrowJerusalem(today)}
          value={availableFrom}
          hint="ללא תאריך — השאירו ריק."
          error={error}
          disabled={disabled}
          onChange={(event) => {
            setAvailableFrom(event.target.value)
            setError(undefined)
          }}
        />
      ) : null}
      {status === 'unavailable' && availableFrom && availableFrom > today ? (
        <p className="t-caption text-muted">{availabilityReturnCaption(availableFrom)}</p>
      ) : null}
      {showActions ? (
        <div className="availability-editor__actions">
          <Button type="submit" loading={saving} disabled={disabled || saving}>
            שמירה
          </Button>
          {onCancel ? (
            <Button type="button" variant="secondary" disabled={saving} onClick={onCancel}>
              ביטול
            </Button>
          ) : null}
        </div>
      ) : null}
    </form>
  )
}
