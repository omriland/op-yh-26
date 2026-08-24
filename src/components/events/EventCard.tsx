import { Hourglass } from 'lucide-react'
import { StampChip } from '../ui/StampChip'
import { Button } from '../ui/Button'
import { HoverTip } from '../ui/HoverTip'
import { formatDate, monoClass } from '../../lib/format'
import { OVERDUE_FILL_CARD_TIP } from '../../lib/overdueFill'
import type { StampDescriptor } from '../../lib/status'
import type { EventListItem } from '../../lib/events'
import { policeEventLabel } from '../../lib/shiftBornEvents'
import { EventTypeLabel } from './EventTypeLabel'
import { EventFrozenMark } from './EventFrozenMark'
import { EventFrozenNotice } from './EventFrozenNotice'

type EventCardProps = {
  event: EventListItem
  stamp: StampDescriptor
  onOpen: (eventId: string) => void
  /** Mine list: open participation → footer CTA */
  onFill?: (eventId: string) => void
  fillLabel?: string
  /** Inbox cards hide שלוחה on the meta line; tap still opens detail. */
  mode?: 'default' | 'inbox'
  /** Mine inbox: 48h+ since completable. Replaces the origin rail. */
  overdue?: boolean
}

export function EventCard({
  event,
  stamp,
  onOpen,
  onFill,
  fillLabel,
  mode = 'default',
  overdue = false,
}: EventCardProps) {
  const place = [event.road?.name, event.location].filter(Boolean).join(' · ')
  const inbox = mode === 'inbox'
  const manualInbox = inbox && !overdue && event.origin === 'manual'
  const open = () => onOpen(event.id)
  const fill = () => onFill?.(event.id)

  return (
    <li
      className={[
        'card',
        'event-card-shell',
        overdue ? 'event-card-shell--overdue' : '',
        manualInbox ? 'event-card-shell--manual' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <button type="button" className="event-card" onClick={open}>
        {overdue ? <span className="visually-hidden">{OVERDUE_FILL_CARD_TIP}</span> : null}
        <span className="event-card__type">
          {overdue ? (
            <HoverTip
              text={OVERDUE_FILL_CARD_TIP}
              mode="always"
              className="event-card__overdue-mark"
              tipClassName="hover-tip--overdue"
              theme="field"
            >
              <span className="event-card__overdue-mark-hit">
                <Hourglass size={20} strokeWidth={1.75} aria-hidden="true" />
              </span>
            </HoverTip>
          ) : null}
          <EventFrozenMark flags={event} />
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
      <EventFrozenNotice flags={event} />
      <button type="button" className="event-card__stamp" onClick={open} tabIndex={-1}>
        <StampChip {...stamp} />
      </button>
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
    </li>
  )
}
