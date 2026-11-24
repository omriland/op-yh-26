import { useEffect, useState, type MouseEvent } from 'react'
import { useAuth } from '../../lib/auth'
import { LedgerRow } from '../ui/Ledger'
import {
  JOINT_EVENT_LINE_LABEL,
  fetchJointPartner,
  jointPartnerHref,
  type JointEventPartner,
} from '../../lib/jointEvents'

type JointEventLedgerRowProps = {
  eventId: string
  policeEventId: string | null | undefined
  /** Changes after a save, so the partner is looked up again. */
  refreshKey?: string | null
}

function isPlainLeftClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  if (event.button !== 0) return false
  return !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
}

/** Moves the app to the partner event the same way Back / Forward would. */
function openPartner(event: MouseEvent<HTMLAnchorElement>, href: string) {
  if (!isPlainLeftClick(event)) return
  event.preventDefault()
  window.history.pushState({}, '', href)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

/** "אירוע משותף עם" row, shown only when the event has a joint partner. */
export function JointEventLedgerRow({ eventId, policeEventId, refreshKey }: JointEventLedgerRowProps) {
  const { roles } = useAuth()
  const [partner, setPartner] = useState<JointEventPartner | null>(null)
  const hasNumber = Boolean(policeEventId?.trim())
  const viewerManages =
    roles.includes('admin') || roles.includes('shift_lead') || roles.includes('super_admin')

  useEffect(() => {
    let active = true
    setPartner(null)
    if (!hasNumber) return undefined
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
  }, [eventId, hasNumber, refreshKey])

  if (!partner) return null
  const href = jointPartnerHref(partner, viewerManages)
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
