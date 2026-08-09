import { StampChip } from '../ui/StampChip'
import { Button } from '../ui/Button'
import { formatDate, monoClass } from '../../lib/format'
import type { StampDescriptor } from '../../lib/status'
import type { EventListItem } from '../../lib/events'

type EventCardProps = {
  event: EventListItem
  stamp: StampDescriptor
  onOpen: (eventId: string) => void
  /** Mine list: open participation → footer CTA */
  onFill?: (eventId: string) => void
  fillLabel?: string
}

export function EventCard({ event, stamp, onOpen, onFill, fillLabel }: EventCardProps) {
  const place = [event.road?.name, event.location].filter(Boolean).join(' · ')

  return (
    <li className="card stack-3">
      <button type="button" className="event-card" onClick={() => onOpen(event.id)}>
        <span className="event-card__top">
          <span className="t-section">{event.event_type?.name ?? 'אירוע'}</span>
          <StampChip {...stamp} />
        </span>
        <span className="t-body text-secondary">{place || '—'}</span>
        <span className="event-card__meta">
          <span className="mono">{formatDate(event.event_date)}</span>
          {event.district?.name ? <span>· {event.district.name}</span> : null}
          {event.police_event_id ? (
            <span>
              · אירוע{' '}
              <span className={monoClass(event.police_event_id)}>{event.police_event_id}</span>
            </span>
          ) : null}
        </span>
      </button>
      {onFill && fillLabel ? (
        <Button
          block
          onClick={(eventClick) => {
            eventClick.stopPropagation()
            onFill(event.id)
          }}
        >
          {fillLabel}
        </Button>
      ) : null}
    </li>
  )
}
