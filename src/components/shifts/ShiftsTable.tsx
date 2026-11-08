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
import { IconButton } from '../ui/Button'
import { shiftRecordLogStatus } from '../../lib/shiftLogStatus'
import { listShiftEvents, shiftEventCountLabel, shiftListDestination } from '../../lib/shiftListEvents'
import { shiftStamp } from '../../lib/status'
import { StampChip } from '../ui/StampChip'
import { DataTable, type DataTableColumn } from '../ui/DataTable'
import { isoSortValue, type TableSort } from '../../lib/tableSort'
import { EventFrozenMark } from '../events/EventFrozenMark'
import type { FreezeViewer } from '../../lib/eventFreeze'

type ShiftsTableProps = {
  shifts: ShiftListItem[]
  onOpen: (shiftId: string) => void
  /** Freeze reader for the shift-born event rows. */
  viewer?: FreezeViewer | null
  partialSortNote?: string
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

const SHIFT_STATUS_ORDER: Record<ReturnType<typeof shiftRecordLogStatus>, number> = {
  draft: 0,
  in_progress: 1,
  closed: 2,
}

const SHIFT_DATE_DESC: TableSort = { columnId: 'date', direction: 'desc' }

function plateOf(shift: ShiftListItem): string | null {
  return shift.vehicle_type === 'personal' && shift.personal_vehicle?.plate_number
    ? formatPlate(shift.personal_vehicle.plate_number)
    : null
}

/** Command desktop only — mobile renders the same data as cards. */
export function ShiftsTable({ shifts, onOpen, viewer, partialSortNote }: ShiftsTableProps) {
  const [openId, setOpenId] = useState<string | null>(null)

  const columns: DataTableColumn<ShiftListItem>[] = [
    {
      id: 'date',
      header: 'תאריך',
      className: 'num table-cell--nowrap',
      sortValue: (shift) => isoSortValue(shift.shift_date),
      cell: (shift) => {
        const eventLabel = shiftEventCountLabel(listShiftEvents(shift.born_events).length)
        const expanded = openId === shift.id
        return (
          <>
            <IconButton
              label={expanded ? `סגירת אירועים · ${eventLabel}` : `פתיחת אירועים · ${eventLabel}`}
              aria-expanded={expanded}
              onClick={(event) => {
                event.stopPropagation()
                setOpenId(expanded ? null : shift.id)
              }}
            >
              <ChevronDown
                size={20}
                strokeWidth={1.75}
                className={['assignment-card__chevron', expanded ? 'is-rotated' : ''].join(' ')}
                aria-hidden="true"
              />
            </IconButton>
            <span className="mono">{formatDate(shift.shift_date)}</span>
            {` (${hebrewWeekdayLetter(shift.shift_date)})`}
          </>
        )
      },
    },
    {
      id: 'kind',
      header: 'שם משמרת',
      sortValue: (shift) => SHIFT_KIND_LABELS[shift.shift_kind],
      cell: (shift) => SHIFT_KIND_LABELS[shift.shift_kind],
    },
    {
      id: 'vehicle',
      header: 'רכב',
      sortValue: (shift) =>
        [VEHICLE_TYPE_LABELS[shift.vehicle_type], plateOf(shift)].filter(Boolean).join(' '),
      cell: (shift) => {
        const plate = plateOf(shift)
        return (
          <>
            {VEHICLE_TYPE_LABELS[shift.vehicle_type]}
            {plate ? (
              <>
                {' · '}
                <span className={monoClass(plate)}>{plate}</span>
              </>
            ) : null}
          </>
        )
      },
    },
    {
      id: 'lead',
      header: 'אחמ״ש',
      sortValue: (shift) => shift.shift_lead?.full_name,
      cell: (shift) => shift.shift_lead?.full_name ?? '—',
    },
    {
      id: 'responders',
      header: 'מתנדבים',
      className: 'num mono',
      sortValue: (shift) => shift.responders.length,
      cell: (shift) => shift.responders.length,
    },
    {
      id: 'events',
      header: 'אירועים',
      className: 'num mono',
      sortValue: (shift) => listShiftEvents(shift.born_events).length,
      cell: (shift) => {
        const count = listShiftEvents(shift.born_events).length
        return <span title={shiftEventCountLabel(count)}>{count}</span>
      },
    },
    {
      id: 'status',
      header: 'סטטוס',
      sortValue: (shift) => SHIFT_STATUS_ORDER[shiftRecordLogStatus(shift)],
      cell: (shift) => <StampChip {...shiftStamp(shiftRecordLogStatus(shift))} />,
    },
  ]

  const openShift = (shift: ShiftListItem) => {
    const destination = shiftListDestination(listShiftEvents(shift.born_events))
    if (destination.kind === 'shift') onOpen(shift.id)
  }

  return (
    <DataTable
      rows={shifts}
      columns={columns}
      rowKey={(shift) => shift.id}
      defaultSort={SHIFT_DATE_DESC}
      partialSortNote={partialSortNote}
      className="table--shifts"
      onRowClick={openShift}
      rowLabel={(shift) =>
        `פתיחת משמרת ${formatDate(shift.shift_date)} · ${shiftEventCountLabel(listShiftEvents(shift.born_events).length)}`
      }
      rowProps={(shift) => ({ title: shiftEventCountLabel(listShiftEvents(shift.born_events).length) })}
      renderSubRows={(shift, colSpan) => {
        if (openId !== shift.id) return null
        const born = listShiftEvents(shift.born_events)
        return (
          <tr className="is-static">
            <td colSpan={colSpan}>
              {born.length === 0 ? (
                <p className="t-body text-secondary">אין אירועים ממשמרת זו.</p>
              ) : (
                <ul className="stack-3">
                  {born.map((event) => {
                    const stamp = shiftBornFillStamp(bornSnapshot(event))
                    const savedBy = lastSavedByLabel(event.last_saved?.full_name)
                    return (
                      <li key={event.id}>
                        <button type="button" className="event-card" onClick={() => openShift(shift)}>
                          <span className="event-card__top">
                            <span className="event-card__type">
                              <EventFrozenMark event={event} viewer={viewer} />
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
                  })}
                </ul>
              )}
            </td>
          </tr>
        )
      }}
    />
  )
}
