import { HoverTip } from '../ui/HoverTip'
import {
  SECONDARY_LEAD_LABEL,
  formatLeadPerson,
  formatListLeadCaption,
  formatListLeadTooltip,
  type LeadPerson,
} from '../../lib/eventShiftLeads'

type EventListLeadCaptionProps = {
  main: LeadPerson | null | undefined
  secondaries?: readonly LeadPerson[]
  /** Desktop lists: append `+N` and reveal secondary names on hover/focus. */
  showOverflow: boolean
  fallback?: string
}

export function EventListLeadCaption({
  main,
  secondaries = [],
  showOverflow,
  fallback = '—',
}: EventListLeadCaptionProps) {
  const label = formatListLeadCaption(main, secondaries, { overflowCount: showOverflow })
  if (!label) return fallback

  const count = secondaries.length
  if (!showOverflow || count === 0) return label

  const mainText = formatLeadPerson(main)
  const tooltip = formatListLeadTooltip(secondaries)
  const overflow = `+${count}`

  if (!tooltip) {
    return (
      <>
        {mainText} <span className="mono">{overflow}</span>
      </>
    )
  }

  return (
    <>
      {mainText}{' '}
      <HoverTip
        mode="always"
        className="event-list-lead__overflow mono"
        content={
          <div className="hover-tip__section">
            <p className="hover-tip__heading">{SECONDARY_LEAD_LABEL}</p>
            <ul className="hover-tip__list">
              {secondaries.map((row, index) => {
                const name = formatLeadPerson(row)
                if (!name) return null
                const key = 'user_id' in row && typeof row.user_id === 'string' ? row.user_id : `${name}-${index}`
                return <li key={key}>{name}</li>
              })}
            </ul>
          </div>
        }
      >
        {overflow}
      </HoverTip>
    </>
  )
}
