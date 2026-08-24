import { useState } from 'react'
import { digitsOnly } from '../../lib/format'
import { saveShiftOdometer, validateShiftOdometer } from '../../lib/shiftOdometer'
import type { ShiftListItem } from '../../lib/shifts'
import { Button } from '../ui/Button'
import { TextField } from '../ui/TextField'
import { useToast } from '../ui/Toast'

type ShiftOdometerFieldsProps = {
  shift: ShiftListItem
  disabled?: boolean
  disabledReason?: string
  onSaved?: () => void
  onOpenForm: () => void
}

function toInput(value: number | null): string {
  return value == null ? '' : String(value)
}

function toNumber(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * The two readings, on the card.
 *
 * A pending shift needs exactly these two numbers, and the volunteer usually knows
 * them while standing at the vehicle. Sending them into a four-section form to type
 * them was the single worst 03:00 friction on this surface. The full form stays one
 * tap away for everything else a shift record holds.
 */
export function ShiftOdometerFields({
  shift,
  disabled = false,
  disabledReason,
  onSaved,
  onOpenForm,
}: ShiftOdometerFieldsProps) {
  const { show } = useToast()
  const [start, setStart] = useState(() => toInput(shift.odometer_start))
  const [end, setEnd] = useState(() => toInput(shift.odometer_end))
  const [error, setError] = useState<string | undefined>()
  const [saving, setSaving] = useState(false)

  async function onSave() {
    const startValue = toNumber(start)
    const endValue = toNumber(end)
    const invalid = validateShiftOdometer(startValue, endValue)
    if (invalid) {
      setError(invalid)
      return
    }
    setError(undefined)
    setSaving(true)
    const result = await saveShiftOdometer({
      shiftId: shift.id,
      odometerStart: startValue,
      odometerEnd: endValue,
    })
    setSaving(false)
    if (!result.ok) {
      setError(result.error)
      show(result.error, 'alert')
      return
    }
    show('מד האוץ נשמר', 'done')
    onSaved?.()
  }

  if (disabled) {
    return (
      <Button block disabled title={disabledReason} aria-label={
        disabledReason ? `תיעוד משמרת. ${disabledReason}` : undefined
      }>
        תיעוד משמרת
      </Button>
    )
  }

  return (
    <div className="shift-odometer">
      <div className="shift-odometer__fields">
        <TextField
          label="מד אוץ התחלה"
          numeric
          inputMode="numeric"
          value={start}
          onChange={(event) => {
            setStart(digitsOnly(event.target.value))
            if (error) setError(undefined)
          }}
        />
        <TextField
          label="מד אוץ סיום"
          numeric
          inputMode="numeric"
          error={error}
          value={end}
          onChange={(event) => {
            setEnd(digitsOnly(event.target.value))
            if (error) setError(undefined)
          }}
        />
      </div>
      <div className="shift-odometer__actions">
        <Button loading={saving} loadingLabel="שומר…" onClick={() => void onSave()}>
          שמירת מד אוץ
        </Button>
        <Button variant="ghost" onClick={onOpenForm}>
          לטופס המלא
        </Button>
      </div>
    </div>
  )
}
