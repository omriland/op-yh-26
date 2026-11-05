import { useEffect, useState } from 'react'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { TextField } from '../ui/TextField'
import {
  personalVehicleWhatsAppHref,
  readPersonalVehiclePromptDismissed,
  userNeedsPersonalVehiclePrompt,
  writePersonalVehiclePromptDismissed,
} from '../../lib/personalVehiclePrompt'

type PersonalVehiclePromptProps = {
  userId: string | null
  /** False while another login dialog is up, so the two do not stack. */
  enabled: boolean
}

export function PersonalVehiclePrompt({ userId, enabled }: PersonalVehiclePromptProps) {
  const [open, setOpen] = useState(false)
  const [vehicleNumber, setVehicleNumber] = useState('')
  const [error, setError] = useState<string | undefined>()

  useEffect(() => {
    if (!enabled || !userId || readPersonalVehiclePromptDismissed()) {
      setOpen(false)
      return
    }
    let active = true
    void userNeedsPersonalVehiclePrompt(userId).then((needs) => {
      if (active) setOpen(needs)
    })
    return () => {
      active = false
    }
  }, [enabled, userId])

  function dismiss() {
    writePersonalVehiclePromptDismissed()
    setOpen(false)
  }

  function confirm() {
    const href = personalVehicleWhatsAppHref(vehicleNumber)
    if (!href) {
      setError('יש להזין מספר רכב.')
      return
    }
    writePersonalVehiclePromptDismissed()
    setOpen(false)
    window.open(href, '_blank', 'noopener,noreferrer')
  }

  return (
    <Dialog
      open={open}
      title="רכב פרטי"
      onClose={dismiss}
      footer={
        <>
          <Button type="button" onClick={confirm}>
            שליחה לתמיכה
          </Button>
          <Button type="button" variant="secondary" onClick={dismiss}>
            ביטול
          </Button>
        </>
      }
    >
      <div className="stack-4">
        <p className="t-body">
          לא נמצא רכב המשוייך למשתמש שלך, ועל כן - לא ניתן להציב אותך לאירועים.
        </p>
        <p className="t-body">
          יש להזין מספר רכב על מנת לבקש מהתמיכה להוסיף אותו
        </p>
        <TextField
          label="מספר רכב"
          name="personal-vehicle-number"
          isolate
          required
          value={vehicleNumber}
          error={error}
          autoComplete="off"
          onChange={(event) => {
            setVehicleNumber(event.target.value)
            if (error) setError(undefined)
          }}
        />
      </div>
    </Dialog>
  )
}
