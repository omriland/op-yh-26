import { Snowflake } from 'lucide-react'
import { freezeTooltipHe, isEventFrozen, type EventFreezeFlags } from '../../lib/eventFreeze'
import { HoverTip } from '../ui/HoverTip'

type EventFrozenMarkProps = {
  flags: EventFreezeFlags | null | undefined
  theme?: 'command' | 'field'
}

/** Small snowflake next to frozen events. Tooltip explains the pending-review reason(s). */
export function EventFrozenMark({ flags, theme = 'field' }: EventFrozenMarkProps) {
  if (!isEventFrozen(flags)) return null
  const tip = freezeTooltipHe(flags)
  if (!tip) return null

  return (
    <HoverTip text={tip} mode="always" className="event-frozen-mark" theme={theme}>
      <span className="event-frozen-mark__hit" aria-label={tip}>
        <Snowflake size={20} strokeWidth={1.75} aria-hidden="true" />
      </span>
    </HoverTip>
  )
}
