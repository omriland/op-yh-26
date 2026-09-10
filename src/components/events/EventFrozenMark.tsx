import { Snowflake } from 'lucide-react'
import {
  freezeTooltipHe,
  freezeViewFor,
  type FreezeSource,
  type FreezeViewer,
} from '../../lib/eventFreeze'
import { HoverTip } from '../ui/HoverTip'

type EventFrozenMarkProps = {
  /** Event row, with its participations when the projection carries them. */
  event: FreezeSource | null | undefined
  /** Omitted viewer shows nothing — freeze is never public to a screen. */
  viewer?: FreezeViewer | null
  theme?: 'command' | 'field'
}

/**
 * Small snowflake next to a frozen record. Tooltip explains the pending-review
 * reason(s). An admin sees it when any participation on the event is frozen; a
 * responder only for their own; a shift-lead never.
 */
export function EventFrozenMark({ event, viewer, theme = 'field' }: EventFrozenMarkProps) {
  const view = freezeViewFor(viewer, event)
  if (!view) return null
  const tip = freezeTooltipHe(view.flags, view.scope)
  if (!tip) return null

  return (
    <HoverTip text={tip} mode="always" className="event-frozen-mark" theme={theme}>
      <span className="event-frozen-mark__hit" aria-label={tip}>
        <Snowflake size={20} strokeWidth={1.75} aria-hidden="true" />
      </span>
    </HoverTip>
  )
}
