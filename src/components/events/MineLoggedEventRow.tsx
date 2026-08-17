import { StampChip } from '../ui/StampChip'
import { formatDate, monoClass } from '../../lib/format'
import type { StampDescriptor } from '../../lib/status'
import type { EventListItem } from '../../lib/events'
import { policeEventLabel } from '../../lib/shiftBornEvents'
import { EventTypeLabel } from './EventTypeLabel'

type MineLoggedEventRowProps = {
  event: EventListItem
  stamp: StampDescriptor
  onOpen: (eventId: string) => void
}

export function MineLoggedEventRow({ event, stamp, onOpen }: MineLoggedEventRowProps) {
  const place = [event.road?.name, event.location].filter(Boolean).join(' · ')
  const idLabel =
    event.origin === 'shift'
      ? policeEventLabel(event.police_event_id)
      : event.police_event_id
        ? `אירוע ${event.police_event_id}`
        : null

  return (
    <li className="list-rows__item list-rows__item--stack mine-logged-row">
      <button type="button" className="mine-logged-row__hit" onClick={() => onOpen(event.id)}>
        <span className="list-rows__label">
          <EventTypeLabel event={event} as="body" fallback="אירוע" />
          <span className="t-body text-secondary">{place || '—'}</span>
          <span className="t-caption text-muted mine-logged-row__meta">
            <span className="mono">{formatDate(event.event_date)}</span>
            {idLabel ? (
              <span>
                · <span className={monoClass(event.police_event_id)}>{idLabel}</span>
              </span>
            ) : null}
          </span>
        </span>
        <StampChip {...stamp} />
      </button>
    </li>
  )
}
