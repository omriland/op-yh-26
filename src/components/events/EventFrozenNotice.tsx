import { Snowflake } from 'lucide-react'
import {
  freezeNoticeHe,
  freezeViewFor,
  participationFreezeView,
  type FreezeSource,
  type FreezeViewer,
  type ResponderFreezeRow,
} from '../../lib/eventFreeze'

type EventFrozenNoticeProps = {
  /** Event row, with its participations when the projection carries them. */
  event?: FreezeSource | null
  /** One volunteer's record — used on the responder sections of event detail. */
  participation?: ResponderFreezeRow | null
  viewer?: FreezeViewer | null
}

/**
 * Always-visible freeze line for a card or row.
 *
 * A frozen participation is excluded from the quarterly fuel refund, so its
 * reason must be readable without hover or focus — the field device has no
 * pointer. The snowflake stays as the glance-level mark; this line carries the
 * words. Same audience rules as `EventFrozenMark`.
 */
export function EventFrozenNotice({ event, participation, viewer }: EventFrozenNoticeProps) {
  const view = participation
    ? participationFreezeView(viewer, participation)
    : freezeViewFor(viewer, event)
  if (!view) return null
  const notice = freezeNoticeHe(view.flags, view.scope)
  if (!notice) return null

  return (
    <p className="event-frozen-notice t-caption">
      <Snowflake size={16} strokeWidth={1.75} aria-hidden="true" />
      <span>{notice}</span>
    </p>
  )
}
