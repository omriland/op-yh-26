import { useId, type KeyboardEvent } from 'react'
import { TriangleAlert, X } from 'lucide-react'
import { Button, IconButton } from '../ui/Button'
import { HoverTip } from '../ui/HoverTip'
import { LicensePlate } from '../ui/LicensePlate'
import { Skeleton } from '../ui/Skeleton'
import { TextField } from '../ui/TextField'
import { CarLogo } from './CarLogo'
import { TreatedPlateStack } from './TreatedPlateStack'
import { TreatedPlateSpecs, treatedPlateHasSpecs } from './TreatedPlateSpecs'
import { digitsOnly, plateDigits } from '../../lib/format'
import { TREATED_PLATE_DETAILS_MISS_TIP, type TreatedPlate } from '../../lib/treatedPlates'

type TreatedPlatesFieldProps = {
  plates: TreatedPlate[]
  pending: string
  error?: string
  disabled?: boolean
  onPendingChange: (value: string) => void
  onCommit: () => void
  onRemove: (plateDigitsKey: string) => void
  onLeftWhereChange: (plateDigitsKey: string, value: string) => void
}

function TreatedPlateDetails({ row }: { row: TreatedPlate }) {
  if (row.details_status === 'pending') {
    return (
      <div className="treated-plates__details treated-plates__details--pending" aria-busy="true">
        <span className="visually-hidden">טוען פרטי רכב</span>
        <Skeleton height={16} width="4rem" />
        <Skeleton height={16} width="6rem" />
      </div>
    )
  }

  if (row.details_status === 'failed') {
    return (
      <div className="treated-plates__details treated-plates__details--failed">
        <HoverTip text={TREATED_PLATE_DETAILS_MISS_TIP} mode="always" theme="field">
          <span
            className="treated-plates__miss"
            role="img"
            aria-label={TREATED_PLATE_DETAILS_MISS_TIP}
          >
            <TriangleAlert size={18} strokeWidth={1.75} aria-hidden="true" />
          </span>
        </HoverTip>
        <span className="treated-plates__miss-label text-secondary t-body">
          {TREATED_PLATE_DETAILS_MISS_TIP}
        </span>
      </div>
    )
  }

  if (!treatedPlateHasSpecs(row)) return null
  return <TreatedPlateSpecs model={row.model} color={row.color} />
}

export function TreatedPlatesField({
  plates,
  pending,
  error,
  disabled = false,
  onPendingChange,
  onCommit,
  onRemove,
  onLeftWhereChange,
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
        <TreatedPlateStack plates={plates} />
      </div>
    )
  }

  return (
    <div className="treated-plates-field">
      {plates.length > 0 ? (
        <ul className="treated-plates" aria-label="מספרי כלי רכב שנוספו">
          {plates.map((row) => {
            const key = plateDigits(row.plate_number)
            const leftWhereId = `${fieldId}-left-${key}`
            return (
              <li key={key} className="treated-plates__item">
                <article className="treated-plates__card">
                  <header className="treated-plates__head">
                    <div className="treated-plates__identity">
                      <CarLogo slug={row.logo_slug} />
                      <LicensePlate plate={row.plate_number} />
                    </div>
                    <IconButton
                      className="treated-plates__remove"
                      label={`הסרת מספר ${row.plate_number}`}
                      onClick={() => onRemove(key)}
                    >
                      <X size={20} strokeWidth={1.75} aria-hidden="true" />
                    </IconButton>
                  </header>

                  <TreatedPlateDetails row={row} />

                  <div className="field treated-plates__left-field">
                    <label className="field__label" htmlFor={leftWhereId}>
                      איפה הרכב הושאר
                    </label>
                    <input
                      id={leftWhereId}
                      className="field__input treated-plates__left-where"
                      type="text"
                      placeholder="למשל: שוליים, חניון גרר"
                      value={row.left_where ?? ''}
                      onChange={(event) => onLeftWhereChange(key, event.target.value)}
                    />
                  </div>
                </article>
              </li>
            )
          })}
        </ul>
      ) : null}

      <div className="treated-plates__compose">
        <TextField
          id={fieldId}
          label="מספרי כלי רכב"
          placeholder="xx-xxx-xx"
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
