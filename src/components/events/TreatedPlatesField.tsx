import { useId, type KeyboardEvent } from 'react'
import { X } from 'lucide-react'
import { Button, IconButton } from '../ui/Button'
import { LicensePlate } from '../ui/LicensePlate'
import { TextField } from '../ui/TextField'
import { digitsOnly, plateDigits } from '../../lib/format'
import { treatedPlateCaption, type TreatedPlate } from '../../lib/treatedPlates'

type TreatedPlatesFieldProps = {
  plates: TreatedPlate[]
  pending: string
  error?: string
  disabled?: boolean
  onPendingChange: (value: string) => void
  onCommit: () => void
  onRemove: (plateDigitsKey: string) => void
}

export function TreatedPlatesField({
  plates,
  pending,
  error,
  disabled = false,
  onPendingChange,
  onCommit,
  onRemove,
}: TreatedPlatesFieldProps) {
  const fieldId = useId()

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter' || event.metaKey || event.ctrlKey) return
    event.preventDefault()
    onCommit()
  }

  if (disabled) {
    if (plates.length === 0) return null
    return (
      <div className="treated-plates-field">
        <p className="field__label">מספרי כלי רכב</p>
        <ul className="treated-plates">
          {plates.map((row) => (
            <li key={plateDigits(row.plate_number)} className="treated-plates__item">
              <LicensePlate plate={row.plate_number} />
              {treatedPlateCaption(row.model, row.color) ? (
                <span className="treated-plates__caption t-caption text-secondary">
                  {treatedPlateCaption(row.model, row.color)}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div className="treated-plates-field">
      {plates.length > 0 ? (
        <ul className="treated-plates" aria-label="מספרי כלי רכב שנוספו">
          {plates.map((row) => {
            const key = plateDigits(row.plate_number)
            const caption = treatedPlateCaption(row.model, row.color)
            return (
              <li key={key} className="treated-plates__item">
                <LicensePlate plate={row.plate_number} />
                {caption ? (
                  <span className="treated-plates__caption t-caption text-secondary">
                    {caption}
                  </span>
                ) : null}
                <IconButton
                  className="treated-plates__remove"
                  label={`הסרת מספר ${row.plate_number}`}
                  onClick={() => onRemove(key)}
                >
                  <X size={20} strokeWidth={1.75} aria-hidden="true" />
                </IconButton>
              </li>
            )
          })}
        </ul>
      ) : null}

      <div className="treated-plates__compose">
        <TextField
          id={fieldId}
          label="מספרי כלי רכב"
          placeholder="מספר רישוי"
          numeric
          isolate
          inputMode="numeric"
          value={pending}
          error={error}
          onChange={(event) => onPendingChange(digitsOnly(event.target.value))}
          onKeyDown={onKeyDown}
        />
        <Button variant="secondary" className="treated-plates__add" onClick={onCommit}>
          הוספה
        </Button>
      </div>
    </div>
  )
}
