import { StampChip } from '../ui/StampChip'
import { formatDate, monoClass } from '../../lib/format'
import { doneFraction, type EventListItem } from '../../lib/events'
import type { StampDescriptor } from '../../lib/status'
import { EventTypeLabel } from './EventTypeLabel'

type EventsTableProps = {
  events: EventListItem[]
  stampFor: (event: EventListItem) => StampDescriptor
  onOpen: (eventId: string) => void
}

/** Command desktop only — mobile renders the same data as cards. */
export function EventsTable({ events, stampFor, onOpen }: EventsTableProps) {
  return (
    <div className="table-wrap">
      <table className="table">
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
          {events.map((event) => (
            <tr key={event.id} onClick={() => onOpen(event.id)}>
              <td className="num mono">{formatDate(event.event_date)}</td>
              <td className={`num ${monoClass(event.police_event_id)}`}>
                {event.police_event_id ?? '—'}
              </td>
              <td>
                <EventTypeLabel event={event} />
              </td>
              <td className="truncate">
                {[event.road?.name, event.location].filter(Boolean).join(' · ') || '—'}
              </td>
              <td>{event.shift_lead?.full_name ?? '—'}</td>
              <td className="num mono">{doneFraction(event)}</td>
              <td>
                <StampChip {...stampFor(event)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
