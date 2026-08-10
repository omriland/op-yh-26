import { formatDate, formatPlate, monoClass } from '../../lib/format'
import {
  SHIFT_KIND_LABELS,
  VEHICLE_TYPE_LABELS,
  type ShiftListItem,
} from '../../lib/shifts'

type ShiftCardProps = {
  shift: ShiftListItem
  onOpen: (shiftId: string) => void
}

export function ShiftCard({ shift, onOpen }: ShiftCardProps) {
  const responderCount = shift.responders.length
  const eventCount = shift.linked_events.length
  const kindLabel = SHIFT_KIND_LABELS[shift.shift_kind]
  const vehicleLabel = VEHICLE_TYPE_LABELS[shift.vehicle_type]
  const plate =
    shift.vehicle_type === 'personal' && shift.personal_vehicle?.plate_number
      ? formatPlate(shift.personal_vehicle.plate_number)
      : null

  return (
    <li className="card stack-3">
      <button type="button" className="event-card" onClick={() => onOpen(shift.id)}>
        <span className="event-card__top">
          <span className="t-section">
            {kindLabel} · {vehicleLabel}
            {plate ? (
              <>
                {' · '}
                <span className={monoClass(plate)}>{plate}</span>
              </>
            ) : null}
          </span>
        </span>
        <span className="t-body text-secondary">
          {responderCount} כוננים · {eventCount} אירועים
        </span>
        <span className="event-card__meta">
          <span className="mono">{formatDate(shift.shift_date)}</span>
        </span>
      </button>
    </li>
  )
}
