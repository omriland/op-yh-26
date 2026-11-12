import { Fragment, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { formatDate, formatDayHeading, formatPlate, hebrewWeekdayLetter, monoClass } from '../../lib/format'
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
import { IconButton } from '../ui/Button'
import { shiftRecordLogStatus } from '../../lib/shiftLogStatus'
import { listShiftEvents, shiftEventCountLabel, shiftListDestination } from '../../lib/shiftListEvents'
import { shiftStamp } from '../../lib/status'
import { StampChip } from '../ui/StampChip'
import { EventFrozenMark } from '../events/EventFrozenMark'
import type { FreezeViewer } from '../../lib/eventFreeze'

type ShiftsTableProps = {
  shifts: ShiftListItem[]
  onOpen: (shiftId: string) => void
  /** Freeze reader for the shift-born event rows. */
  viewer?: FreezeViewer | null
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

/** Command desktop only — mobile renders the same data as cards. */
export function ShiftsTable({ shifts, onOpen, viewer }: ShiftsTableProps) {
  const [openId, setOpenId] = useState<string | null>(null)

  return (
    <div className="table-wrap">
      <table className="table table--shifts">
        <thead>
          <tr>
            <th scope="col">תאריך</th>
            <th scope="col">שם משמרת</th>
            <th scope="col">רכב</th>
            <th scope="col">אחמ״ש</th>
            <th scope="col">מתנדבים</th>
            <th scope="col">אירועים</th>
            <th scope="col">סטטוס</th>
          </tr>
        </thead>
        <tbody>
          {shifts.map((shift, index) => {
            const startsDay = index === 0 || shifts[index - 1].shift_date !== shift.shift_date
            const vehicleLabel = VEHICLE_TYPE_LABELS[shift.vehicle_type]
            const plate =
              shift.vehicle_type === 'personal' && shift.personal_vehicle?.plate_number
                ? formatPlate(shift.personal_vehicle.plate_number)
                : null
            const born = listShiftEvents(shift.born_events)
            const eventLabel = shiftEventCountLabel(born.length)
            const expanded = openId === shift.id
            const openShift = () => {
              const destination = shiftListDestination(born)
              if (destination.kind === 'shift') onOpen(shift.id)
            }
            return (
              <Fragment key={shift.id}>
                {startsDay ? (
                  <tr className="is-static table-row--day">
                    <th scope="colgroup" colSpan={7}>
                      {formatDayHeading(shift.shift_date)}
                    </th>
                  </tr>
                ) : null}
                <tr
                  tabIndex={0}
                  role="button"
                  title={eventLabel}
                  aria-label={`פתיחת משמרת ${formatDate(shift.shift_date)} · ${eventLabel}`}
                  onClick={openShift}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return
                    if (event.target !== event.currentTarget) return
                    event.preventDefault()
                    openShift()
                  }}
                >
                  <td className="num table-cell--nowrap">
                    <IconButton
                      label={
                        expanded
                          ? `סגירת אירועים · ${eventLabel}`
                          : `פתיחת אירועים · ${eventLabel}`
                      }
                      aria-expanded={expanded}
                      onClick={(event) => {
                        event.stopPropagation()
                        setOpenId(expanded ? null : shift.id)
                      }}
                    >
                      <ChevronDown
                        size={20}
                        strokeWidth={1.75}
                        className={['assignment-card__chevron', expanded ? 'is-rotated' : ''].join(
                          ' ',
                        )}
                        aria-hidden="true"
                      />
                    </IconButton>
                    <span className="mono">{formatDate(shift.shift_date)}</span>
                    {` (${hebrewWeekdayLetter(shift.shift_date)})`}
                  </td>
                  <td>{SHIFT_KIND_LABELS[shift.shift_kind]}</td>
                  <td>
                    {vehicleLabel}
                    {plate ? (
                      <>
                        {' · '}
                        <span className={monoClass(plate)}>{plate}</span>
                      </>
                    ) : null}
                  </td>
                  <td>{shift.shift_lead?.full_name ?? '—'}</td>
                  <td className="num mono">{shift.responders.length}</td>
                  <td className="num mono" title={eventLabel}>
                    {born.length}
                  </td>
                  <td>
                    <StampChip {...shiftStamp(shiftRecordLogStatus(shift))} />
                  </td>
                </tr>
                {expanded ? (
                  <tr className="is-static">
                    <td colSpan={7}>
                      {born.length === 0 ? (
                        <p className="t-body text-secondary">אין אירועים ממשמרת זו.</p>
                      ) : (
                        <ul className="stack-3">
                          {born.map((event) => {
                            const stamp = shiftBornFillStamp(bornSnapshot(event))
                            const savedBy = lastSavedByLabel(event.last_saved?.full_name)
                            return (
                              <li key={event.id}>
                                <button
                                  type="button"
                                  className="event-card"
                                  onClick={openShift}
                                >
                                  <span className="event-card__top">
                                    <span className="event-card__type">
                                      <EventFrozenMark event={event} viewer={viewer} />
                                      <span className="t-body-strong">
                                        {event.event_type?.name ?? 'אירוע'}
                                      </span>
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
                          })}
                        </ul>
                      )}
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
