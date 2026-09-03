import { useRef } from 'react'
import { formatDate, monoClass } from '../../lib/format'
import { doneFraction, type EventListItem } from '../../lib/events'
import { mapSecondaryLeadRows } from '../../lib/eventShiftLeads'
import { HoverTip } from '../ui/HoverTip'
import { EventListLeadCaption } from './EventListLeadCaption'
import { EventTypeLabel } from './EventTypeLabel'
import { EventFrozenMark } from './EventFrozenMark'
import { EventStatusTrail } from './EventStatusTrail'

type EventsTableProps = {
  events: EventListItem[]
  onOpen: (eventId: string) => void
  onContextDelete?: (event: EventListItem, pointer: { x: number; y: number }) => void
}

/** Command desktop only — mobile renders the same data as cards. */
export function EventsTable({ events, onOpen, onContextDelete }: EventsTableProps) {
  const skipOpenUntil = useRef(0)

  return (
    <div className="table-wrap">
      <table className="table table--events">
        <thead>
          <tr>
            <th scope="col">תאריך</th>
            <th scope="col">מספר אירוע</th>
            <th scope="col">סוג אירוע</th>
            <th scope="col">כביש / מיקום</th>
            <th scope="col">אחמ״ש</th>
            <th scope="col">מתנדבים</th>
            <th scope="col">סטטוס תיעוד</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => {
            const locationLabel =
              [event.road?.name, event.location].filter(Boolean).join(' · ') || '—'
            return (
              <tr
                key={event.id}
                className={event.status === 'done' ? 'table-row--done' : undefined}
                onClick={(click) => {
                  if (click.button !== 0 || Date.now() < skipOpenUntil.current) return
                  onOpen(event.id)
                }}
                onContextMenu={
                  onContextDelete
                    ? (click) => {
                        click.preventDefault()
                        click.stopPropagation()
                        skipOpenUntil.current = Date.now() + 400
                        onContextDelete(event, { x: click.clientX, y: click.clientY })
                      }
                    : undefined
                }
              >
                <td className="num mono">{formatDate(event.event_date)}</td>
                <td className={`num ${monoClass(event.police_event_id)}`}>
                  {event.police_event_id ?? '—'}
                </td>
                <td>
                  <span className="event-card__type">
                    <EventFrozenMark flags={event} />
                    <EventTypeLabel event={event} />
                  </span>
                </td>
                <td className="table-col--location">
                  <HoverTip
                    text={locationLabel === '—' ? '' : locationLabel}
                    className="table-col--location__text"
                  >
                    {locationLabel}
                  </HoverTip>
                </td>
                <td>
                  {event.origin === 'shift' ? (
                    '—'
                  ) : (
                    <EventListLeadCaption
                      main={event.shift_lead}
                      secondaries={mapSecondaryLeadRows(event.secondary_leads)}
                      showOverflow
                    />
                  )}
                </td>
                <td className="num mono">{doneFraction(event)}</td>
                <td className="table-cell--status">
                  <EventStatusTrail
                    status={event.status}
                    responders={event.responders.map((row) => ({
                      id: row.id,
                      status: row.status,
                      name: row.profile?.full_name ?? row.profile?.callsign ?? 'מתנדב',
                    }))}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
