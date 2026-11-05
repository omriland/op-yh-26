import { useState } from 'react'
import { UserX } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { canDeleteOwnAccount, deleteOwnAccount } from '../lib/deleteAccount'
import { isImpersonating } from '../lib/impersonationStash'
import { readRolePreviewStash } from '../lib/rolePreviewStash'
import { Button } from './ui/Button'
import { AlertDialog } from './ui/AlertDialog'

type Step = 'closed' | 'explain' | 'confirm' | 'done'

/** "מחיקת חשבון" with a two-step confirmation. Renders nothing in "view as" or a role preview. */
export function DeleteAccountSection() {
  const { signOut } = useAuth()
  const [step, setStep] = useState<Step>('closed')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [simulated, setSimulated] = useState(false)

  if (!canDeleteOwnAccount({ impersonating: isImpersonating(), previewingRole: readRolePreviewStash() !== null })) {
    return null
  }

  const close = () => {
    if (busy) return
    setStep('closed')
    setError(null)
  }

  const onDelete = async () => {
    setBusy(true)
    setError(null)
    const result = await deleteOwnAccount()
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setSimulated(result.simulated)
    setStep('done')
  }

  const finish = () => void signOut()

  return (
    <>
      <Button
        variant="destructive"
        onClick={() => setStep('explain')}
        icon={<UserX size={20} strokeWidth={1.75} />}
      >
        מחיקת חשבון
      </Button>

      <AlertDialog
        open={step === 'explain'}
        status="danger"
        title="למחוק את החשבון?"
        onClose={close}
        footer={
          <>
            <Button variant="destructive" onClick={() => setStep('confirm')}>
              המשך
            </Button>
            <Button variant="secondary" onClick={close}>
              ביטול
            </Button>
          </>
        }
      >
        <p className="t-body">מחיקת החשבון תסיר לצמיתות:</p>
        <ul className="privacy__list">
          <li className="t-body">את פרטי הפרופיל והקשר: שם, אות קריאה, דוא״ל וטלפון.</li>
          <li className="t-body">את הרכבים והכתובות שלך.</li>
          <li className="t-body">תמונות, סרטונים ומשובים שהעלית.</li>
          <li className="t-body">את הכניסה לחשבון, בכל המכשירים.</li>
        </ul>
        <p className="t-body">תיעוד אירועים ומשמרות שהשתתפת בהם נשמר ביחידה, ללא הפרטים האישיים שלך.</p>
      </AlertDialog>

      <AlertDialog
        open={step === 'confirm'}
        status="danger"
        title="אישור סופי"
        busy={busy}
        onClose={close}
        footer={
          <>
            <Button variant="destructive" loading={busy} loadingLabel="מוחק…" onClick={() => void onDelete()}>
              מחיקת החשבון לצמיתות
            </Button>
            <Button variant="secondary" disabled={busy} onClick={close}>
              ביטול
            </Button>
          </>
        }
      >
        <p className="t-body">המחיקה סופית ואי אפשר לבטל אותה.</p>
        {error ? (
          <p className="t-body text-danger" role="alert">
            {error}
          </p>
        ) : null}
      </AlertDialog>

      <AlertDialog
        open={step === 'done'}
        status="success"
        title="החשבון נמחק"
        onClose={finish}
        footer={
          <Button variant="primary" onClick={finish}>
            סיום
          </Button>
        }
      >
        {simulated ? (
          <p className="t-body">
            זהו חשבון הדמו של App Review, ולכן הוא לא נמחק בפועל, כדי שהבדיקה תוכל להמשיך. בחשבון רגיל, החשבון
            והמידע האישי נמחקים עכשיו.
          </p>
        ) : (
          <p className="t-body">החשבון והמידע האישי שלך נמחקו. תודה על הפעילות ביחידה.</p>
        )}
      </AlertDialog>
    </>
  )
}
