import { formatDate, formatPlate, hebrewWeekdayLetter, monoClass } from '../../lib/format'
import {
  SHIFT_KIND_LABELS,
  VEHICLE_TYPE_LABELS,
  type ShiftListItem,
} from '../../lib/shifts'

type ShiftsTableProps = {
  shifts: ShiftListItem[]
  onOpen: (shiftId: string) => void
}

/** Command desktop only — mobile renders the same data as cards. */
export function ShiftsTable({ shifts, onOpen }: ShiftsTableProps) {
  return (
    <div className="table-wrap">
      <table className="table table--shifts">
        <thead>
          <tr>
            <th scope="col">תאריך</th>
            <th scope="col">שם משמרת</th>
            <th scope="col">רכב</th>
            <th scope="col">אחמ״ש</th>
            <th scope="col">כוננים</th>
            <th scope="col">אירועים</th>
          </tr>
        </thead>
        <tbody>
          {shifts.map((shift) => {
            const vehicleLabel = VEHICLE_TYPE_LABELS[shift.vehicle_type]
            const plate =
              shift.vehicle_type === 'personal' && shift.personal_vehicle?.plate_number
                ? formatPlate(shift.personal_vehicle.plate_number)
                : null
            return (
              <tr key={shift.id} onClick={() => onOpen(shift.id)}>
                <td className="num table-cell--nowrap">
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
                <td className="num mono">{shift.linked_events.length}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
