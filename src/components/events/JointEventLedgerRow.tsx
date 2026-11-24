import { useEffect, useState, type MouseEvent } from 'react'
import { LedgerRow } from '../ui/Ledger'
import {
  JOINT_EVENT_LINE_LABEL,
  fetchJointPartner,
  jointPartnerHref,
  type JointEventPartner,
} from '../../lib/jointEvents'

/** Moves the app to the partner event the same way Back / Forward would. */
function openPartner(event: MouseEvent<HTMLAnchorElement>, href: string) {
  event.preventDefault()
  window.history.pushState({}, '', href)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

/** "אירוע משותף עם" row, shown only when the event has a joint partner. */
export function JointEventLedgerRow({ eventId }: { eventId: string }) {
  const [partner, setPartner] = useState<JointEventPartner | null>(null)

  useEffect(() => {
    let active = true
    setPartner(null)
    fetchJointPartner(eventId)
      .then((found) => {
        if (active) setPartner(found)
      })
      .catch(() => {
        if (active) setPartner(null)
      })
    return () => {
      active = false
    }
  }, [eventId])

  if (!partner) return null
  const href = jointPartnerHref(partner)
  return (
    <LedgerRow
      label={JOINT_EVENT_LINE_LABEL}
      value={
        <a href={href} onClick={(event) => openPartner(event, href)}>
          {partner.origin === 'shift' ? 'דיווח המשמרת' : 'אירוע מתנדב'}
        </a>
      }
    />
  )
}
