import type { EventListItem } from '../../lib/events'

type EventTypeLabelProps = {
  event: Pick<EventListItem, 'event_type' | 'is_cancelled'>
  /** Card title uses section tone; table cell uses body. */
  as?: 'section' | 'body'
  fallback?: string
}

/** Event type name; cancelled → strikethrough + inline בוטל. */
export function EventTypeLabel({
  event,
  as = 'body',
  fallback = '—',
}: EventTypeLabelProps) {
  const name = event.event_type?.name ?? fallback
  const cancelled = Boolean(event.is_cancelled)

  return (
    <span
      className={[
        'event-type-label',
        as === 'section' ? 'event-type-label--section' : '',
        cancelled ? 'event-type-label--cancelled' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className="event-type-label__name">{name}</span>
      {cancelled ? <span className="event-type-label__tag">בוטל</span> : null}
    </span>
  )
}
