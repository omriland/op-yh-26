import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Button } from '../ui/Button'
import { formatDate, formatPlate, hebrewWeekdayLetter, monoClass } from '../../lib/format'
import {
  lastSavedByLabel,
  policeEventLabel,
  shiftBornFillStamp,
} from '../../lib/shiftBornEvents'
import {
  SHIFT_KIND_LABELS,
  VEHICLE_TYPE_LABELS,
  isShiftPendingLog,
  type ShiftBornEventSummary,
  type ShiftListItem,
} from '../../lib/shifts'
import { shiftRecordLogStatus } from '../../lib/shiftLogStatus'
import { shiftStamp } from '../../lib/status'
import { StampChip } from '../ui/StampChip'
import { EventFrozenMark } from '../events/EventFrozenMark'

type ShiftCardProps = {
  shift: ShiftListItem
  onOpen: (shiftId: string) => void
  onFill?: (shiftId: string) => void
  onOpenEvent?: (eventId: string) => void
  fillDisabled?: boolean
  fillDisabledReason?: string
}

function bornSnapshot(event: ShiftBornEventSummary) {
  return {
    status: event.status,
    police_event_id: event.police_event_id,
    treatment_detail: event.treatment_detail,
    treatment_notes: event.treatment_notes,
    road_id: event.road_id,
    location: event.location,
    treated_count: event.treated?.length ?? 0,
  }
}

export function ShiftCard({
  shift,
  onOpen,
  onFill,
  onOpenEvent,
  fillDisabled = false,
  fillDisabledReason,
}: ShiftCardProps) {
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
  const pending = isShiftPendingLog(shift)
  const stamp = shiftStamp(shiftRecordLogStatus(shift))

  return (
    <li className={['card', 'stack-3', open ? 'assignment-card--open' : ''].join(' ')}>
      <div className="assignment-card__head">
        <button
          type="button"
          className="assignment-card__toggle"
          onClick={() => onOpen(shift.id)}
        >
          <span className="assignment-card__identity">
            <span className="t-section">
              {kindLabel} · {vehicleLabel}
            </span>
            <span className="t-body text-secondary">
              {responderCount} כוננים · {eventCount} אירועים
            </span>
            <span className="event-card__meta">
              <span className="mono">{formatDate(shift.shift_date)}</span>
              {` (${hebrewWeekdayLetter(shift.shift_date)})`}
              {plate ? (
                <span>
                  {' · '}
                  <span className={monoClass(plate)}>{plate}</span>
                </span>
              ) : null}
              {saved ? <span> · {saved}</span> : null}
            </span>
          </span>
        </button>
        <StampChip {...stamp} />
        <button
          type="button"
          className="shift-card__disclose"
          aria-expanded={open}
          aria-label={open ? 'הסתרת אירועי המשמרת' : 'הצגת אירועי המשמרת'}
          onClick={() => setOpen((current) => !current)}
        >
          <ChevronDown
            size={20}
            strokeWidth={1.75}
            className={['assignment-card__chevron', open ? 'is-rotated' : ''].join(' ')}
            aria-hidden="true"
          />
        </button>
      </div>
      {fillDisabled || pending ? (
        <Button
          block
          disabled={fillDisabled}
          title={fillDisabled ? fillDisabledReason : undefined}
          aria-label={
            fillDisabled && fillDisabledReason
              ? `תיעוד משמרת. ${fillDisabledReason}`
              : undefined
          }
          onClick={() => (onFill ?? onOpen)(shift.id)}
        >
          תיעוד משמרת
        </Button>
      ) : null}
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
                      <span className="event-card__type">
                        <EventFrozenMark flags={event} />
                        <span className="t-body-strong">{event.event_type?.name ?? 'אירוע'}</span>
                      </span>
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
