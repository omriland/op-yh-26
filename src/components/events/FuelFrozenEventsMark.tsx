import { Snowflake } from 'lucide-react'
import { frozenEventCountTooltipHe } from '../../lib/eventFreeze'
import { HoverTip } from '../ui/HoverTip'

type FuelFrozenEventsMarkProps = {
  count: number
  theme?: 'command' | 'field'
}

/**
 * Snowflake next to a fuel-report name when that volunteer has frozen
 * participations in the viewed period. Tooltip is the count only — the
 * reason lives on the event itself.
 */
export function FuelFrozenEventsMark({
  count,
  theme = 'field',
}: FuelFrozenEventsMarkProps) {
  const tip = frozenEventCountTooltipHe(count)
  if (!tip) return null

  return (
    <HoverTip text={tip} mode="always" className="event-frozen-mark" theme={theme}>
      <span className="event-frozen-mark__hit" aria-label={tip}>
        <Snowflake size={20} strokeWidth={1.75} aria-hidden="true" />
      </span>
    </HoverTip>
  )
}
