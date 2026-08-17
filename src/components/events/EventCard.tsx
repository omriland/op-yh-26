import { StampChip } from '../ui/StampChip'
import { Button } from '../ui/Button'
import { formatDate, monoClass } from '../../lib/format'
import type { StampDescriptor } from '../../lib/status'
import type { EventListItem } from '../../lib/events'
import { policeEventLabel } from '../../lib/shiftBornEvents'
import { EventTypeLabel } from './EventTypeLabel'

type EventCardProps = {
  event: EventListItem
  stamp: StampDescriptor
  onOpen: (eventId: string) => void
  /** Mine list: open participation → footer CTA */
  onFill?: (eventId: string) => void
  fillLabel?: string
  /** Inbox cards fill on tap; unit list cards open detail. */
  mode?: 'default' | 'inbox'
}

export function EventCard({
  event,
  stamp,
  onOpen,
  onFill,
  fillLabel,
  mode = 'default',
}: EventCardProps) {
  const place = [event.road?.name, event.location].filter(Boolean).join(' · ')
  const inbox = mode === 'inbox'
  const fillOnTap = inbox && onFill
  const open = () => onOpen(event.id)
  const fill = () => onFill?.(event.id)

  return (
    <li className="card event-card-shell">
      <button type="button" className="event-card" onClick={fillOnTap ? fill : open}>
        <span className="event-card__type">
          <EventTypeLabel event={event} as="section" fallback="אירוע" />
        </span>
        <span className="event-card__place t-body text-secondary">{place || '—'}</span>
        <span className="event-card__meta">
          <span className="mono">{formatDate(event.event_date)}</span>
          {!inbox && event.district?.name ? <span>· {event.district.name}</span> : null}
          {event.origin === 'shift' ? (
            <span>
              · <span className={monoClass(event.police_event_id)}>{policeEventLabel(event.police_event_id)}</span>
            </span>
          ) : event.police_event_id ? (
            <span>
              · אירוע{' '}
              <span className={monoClass(event.police_event_id)}>{event.police_event_id}</span>
            </span>
          ) : null}
        </span>
      </button>
      {fillOnTap ? (
        <span className="event-card__stamp">
          <StampChip {...stamp} />
        </span>
      ) : (
        <button type="button" className="event-card__stamp" onClick={open} tabIndex={-1}>
          <StampChip {...stamp} />
        </button>
      )}
      {onFill && fillLabel ? (
        <div className="event-card__fill">
          <Button
            onClick={(eventClick) => {
              eventClick.stopPropagation()
              fill()
            }}
          >
            {fillLabel}
          </Button>
        </div>
      ) : null}
      {inbox && onFill ? (
        <div className="event-card__detail">
          <Button
            variant="ghost"
            onClick={(eventClick) => {
              eventClick.stopPropagation()
              open()
            }}
          >
            פרטי האירוע
          </Button>
        </div>
      ) : null}
    </li>
  )
}
