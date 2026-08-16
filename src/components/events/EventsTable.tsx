import { formatDate, monoClass } from '../../lib/format'
import { doneFraction, type EventListItem } from '../../lib/events'
import { eventLeadDisplayName, SHIFT_BORN_CHIP } from '../../lib/shiftBornEvents'
import { HoverTip } from '../ui/HoverTip'
import { EventTypeLabel } from './EventTypeLabel'
import { EventStatusTrail } from './EventStatusTrail'

type EventsTableProps = {
  events: EventListItem[]
  onOpen: (eventId: string) => void
}

/** Command desktop only — mobile renders the same data as cards. */
export function EventsTable({ events, onOpen }: EventsTableProps) {
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
            <th scope="col">כוננים</th>
            <th scope="col">סטטוס תיעוד</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => {
            const locationLabel =
              event.origin === 'shift'
                ? SHIFT_BORN_CHIP
                : [event.road?.name, event.location].filter(Boolean).join(' · ') || '—'
            return (
              <tr key={event.id} onClick={() => onOpen(event.id)}>
                <td className="num mono">{formatDate(event.event_date)}</td>
                <td className={`num ${monoClass(event.police_event_id)}`}>
                  {event.police_event_id ?? '—'}
                </td>
                <td>
                  <EventTypeLabel event={event} />
                </td>
                <td className="table-col--location">
                  <HoverTip
                    text={locationLabel === '—' ? '' : locationLabel}
                    className="table-col--location__text"
                  >
                    {locationLabel}
                  </HoverTip>
                </td>
                <td>{eventLeadDisplayName(event.origin, event.shift_lead?.full_name) ?? '—'}</td>
                <td className="num mono">{doneFraction(event)}</td>
                <td className="table-cell--status">
                  <EventStatusTrail
                    status={event.status}
                    responders={event.responders.map((row) => ({
                      id: row.id,
                      status: row.status,
                      name: row.profile?.full_name ?? row.profile?.callsign ?? 'כונן',
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
