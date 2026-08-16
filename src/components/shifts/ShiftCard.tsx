import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { formatDate, formatPlate, hebrewWeekdayLetter, monoClass } from '../../lib/format'
import {
  lastSavedByLabel,
  policeEventLabel,
  shiftBornFillStamp,
} from '../../lib/shiftBornEvents'
import {
  SHIFT_KIND_LABELS,
  VEHICLE_TYPE_LABELS,
  type ShiftBornEventSummary,
  type ShiftListItem,
} from '../../lib/shifts'
import { Button } from '../ui/Button'
import { StampChip } from '../ui/StampChip'

type ShiftCardProps = {
  shift: ShiftListItem
  onOpen: (shiftId: string) => void
  onFill?: (shiftId: string) => void
  onOpenEvent?: (eventId: string) => void
}

function bornSnapshot(event: ShiftBornEventSummary) {
  return {
    status: event.status,
    police_event_id: event.police_event_id,
    treatment_detail: event.treatment_detail,
    treatment_notes: event.treatment_notes,
    treated_count: event.treated?.length ?? 0,
  }
}

export function ShiftCard({ shift, onOpen, onFill, onOpenEvent }: ShiftCardProps) {
  const [open, setOpen] = useState(false)
  const responderCount = shift.responders.length
  const born = shift.born_events ?? []
  const eventCount = born.length
  const kindLabel = SHIFT_KIND_LABELS[shift.shift_kind]
  const vehicleLabel = VEHICLE_TYPE_LABELS[shift.vehicle_type]
  const plate =
    shift.vehicle_type === 'personal' && shift.personal_vehicle?.plate_number
      ? formatPlate(shift.personal_vehicle.plate_number)
      : null
  const saved = lastSavedByLabel(shift.last_saved?.full_name)

  return (
    <li className={['card', 'stack-3', open ? 'assignment-card--open' : ''].join(' ')}>
      <div className="assignment-card__head">
        <button
          type="button"
          className="assignment-card__toggle"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          <span className="assignment-card__identity">
            <span className="t-section">
              {kindLabel} · {vehicleLabel}
              {plate ? (
                <>
                  {' · '}
                  <span className={monoClass(plate)}>{plate}</span>
                </>
              ) : null}
            </span>
            <span className="t-body text-secondary">
              {responderCount} כוננים · {eventCount} אירועים
            </span>
            <span className="event-card__meta">
              <span className="mono">{formatDate(shift.shift_date)}</span>
              {` (${hebrewWeekdayLetter(shift.shift_date)})`}
              {saved ? <span> · {saved}</span> : null}
            </span>
          </span>
          <ChevronDown
            size={20}
            strokeWidth={1.75}
            className={['assignment-card__chevron', open ? 'is-rotated' : ''].join(' ')}
            aria-hidden="true"
          />
        </button>
      </div>
      <Button block onClick={() => (onFill ?? onOpen)(shift.id)}>
        תיעוד משמרת
      </Button>
      {open ? (
        <ul className="assignment-card__body stack-3">
          {born.length === 0 ? (
            <li className="t-body text-secondary">אין אירועים ממשמרת זו.</li>
          ) : (
            born.map((event) => {
              const stamp = shiftBornFillStamp(bornSnapshot(event))
              const savedBy = lastSavedByLabel(event.last_saved?.full_name)
              return (
                <li key={event.id}>
                  <button
                    type="button"
                    className="event-card"
                    onClick={() => onOpenEvent?.(event.id)}
                  >
                    <span className="event-card__top">
                      <span className="t-body-strong">{event.event_type?.name ?? 'אירוע'}</span>
                      <StampChip {...stamp} />
                    </span>
                    <span className="t-caption text-muted">
                      {policeEventLabel(event.police_event_id)}
                      {savedBy ? ` · ${savedBy}` : ''}
                    </span>
                  </button>
                </li>
              )
            })
          )}
        </ul>
      ) : null}
    </li>
  )
}
