import { useState, useSyncExternalStore } from 'react'
import {
  answerCobrowseConsent,
  cobrowseSupportLabel,
  getCobrowseState,
  subscribeCobrowse,
} from '../../lib/cobrowse'
import { endCobrowseSession } from '../../lib/useCobrowse'
import { AlertDialog } from '../ui/AlertDialog'
import { Button } from '../ui/Button'
import { useToast } from '../ui/Toast'

/** Consent dialog + "support is viewing" bar for a Cobrowse.io session. */
export function CobrowseSupport() {
  const { show } = useToast()
  const { pending, session } = useSyncExternalStore(subscribeCobrowse, getCobrowseState)
  const [ending, setEnding] = useState(false)

  async function onEnd() {
    setEnding(true)
    try {
      await endCobrowseSession()
      show('התמיכה הסתיימה.', 'done')
    } catch {
      show('לא הצלחנו לסיים את התמיכה. נסו שוב.', 'alert')
    } finally {
      setEnding(false)
    }
  }

  const support = cobrowseSupportLabel(pending?.agentName ?? '')

  return (
    <>
      {session?.active ? (
        <div className="impersonation-bar" role="status" data-theme="field">
          <p className="impersonation-bar__text t-caption">
            {cobrowseSupportLabel(session.agentName)}{' '}
            {session.remoteControl ? 'צופה ושולטת במסך שלכם' : 'צופה במסך שלכם'}
          </p>
          <Button variant="secondary" loading={ending} onClick={() => void onEnd()}>
            סיום תמיכה
          </Button>
        </div>
      ) : null}
      <AlertDialog
        open={pending !== null}
        status="accent"
        title={pending?.kind === 'control' ? 'בקשה לשליטה במסך' : 'בקשת תמיכה'}
        onClose={() => answerCobrowseConsent(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => answerCobrowseConsent(false)}>
              דחייה
            </Button>
            <Button variant="primary" onClick={() => answerCobrowseConsent(true)}>
              אישור
            </Button>
          </>
        }
      >
        <p className="t-body">
          {pending?.kind === 'control'
            ? `${support} מבקשת לשלוט במסך שלכם וללחוץ ולהקליד בשבילכם. תוכלו לעצור בכל רגע.`
            : `${support} מבקשת לצפות במסך שלכם. סיסמאות וקודי אימות לא יוצגו. תוכלו לסיים בכל רגע.`}
        </p>
      </AlertDialog>
    </>
  )
}
