import { Snowflake } from 'lucide-react'
import { freezeNoticeHe, isEventFrozen, type EventFreezeFlags } from '../../lib/eventFreeze'

type EventFrozenNoticeProps = {
  flags: EventFreezeFlags | null | undefined
}

/**
 * Always-visible freeze line for a card or row.
 *
 * A frozen event is excluded from the quarterly fuel refund, so its reason must
 * be readable without hover or focus — the field device has no pointer. The
 * snowflake stays as the glance-level mark; this line carries the words.
 */
export function EventFrozenNotice({ flags }: EventFrozenNoticeProps) {
  if (!isEventFrozen(flags)) return null
  const notice = freezeNoticeHe(flags)
  if (!notice) return null

  return (
    <p className="event-frozen-notice t-caption">
      <Snowflake size={16} strokeWidth={1.75} aria-hidden="true" />
      <span>{notice}</span>
    </p>
  )
}
