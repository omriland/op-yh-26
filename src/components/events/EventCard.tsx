import { type MouseEvent } from 'react'
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
import { IncompleteFieldsNotice } from './IncompleteFieldsNotice'

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
  /** Super Admin unit list: right-click / long-press to delete. */
  onContextDelete?: (event: EventListItem, pointer: { x: number; y: number }) => void
  /** Unit list: missing required fields as a ledger line under the header. */
  incompleteFields?: string[]
  incompleteSpoken?: string
}

export function EventCard({
  event,
  stamp,
  onOpen,
  onFill,
  fillLabel,
  mode = 'default',
  overdue = false,
  onContextDelete,
  incompleteFields,
  incompleteSpoken,
}: EventCardProps) {
  const place = [event.road?.name, event.location].filter(Boolean).join(' · ')
  const inbox = mode === 'inbox'
  const manualInbox = inbox && !overdue && event.origin === 'manual'
  const open = () => onOpen(event.id)
  const fill = () => onFill?.(event.id)
  const onContextMenu = onContextDelete
    ? (click: MouseEvent) => {
        click.preventDefault()
        click.stopPropagation()
        onContextDelete(event, { x: click.clientX, y: click.clientY })
      }
    : undefined

  return (
    <li
      className={[
        'card',
        'event-card-shell',
        overdue ? 'event-card-shell--overdue' : '',
        manualInbox ? 'event-card-shell--manual' : '',
        incompleteFields && incompleteFields.length > 0 && !overdue
          ? 'event-card-shell--incomplete'
          : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onContextMenu={onContextMenu}
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
        {incompleteFields && incompleteFields.length > 0 ? (
          <IncompleteFieldsNotice
            fields={incompleteFields}
            spoken={incompleteSpoken ?? `חסרים: ${incompleteFields.join(' · ')}`}
          />
        ) : null}
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
