import { useState } from 'react'
import type { AssignableRole } from '../../lib/appRoles'
import { PREVIEWABLE_ROLES, rolePreviewLabel } from '../../lib/rolePreview'
import { isImpersonating } from '../../lib/impersonationStash'
import { isRolePreviewing, writeRolePreviewStash } from '../../lib/rolePreviewStash'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'

type RolePreviewPickerDialogProps = {
  open: boolean
  onClose: () => void
  onStarted: () => void
}

export function RolePreviewPickerDialog({
  open,
  onClose,
  onStarted,
}: RolePreviewPickerDialogProps) {
  const [selected, setSelected] = useState<AssignableRole>('responder')

  function onConfirm() {
    if (isImpersonating() || isRolePreviewing()) return
    writeRolePreviewStash(selected)
    onClose()
    onStarted()
  }

  return (
    <Dialog
      open={open}
      title="צפייה בתפקיד אחר"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            ביטול
          </Button>
          <Button onClick={onConfirm}>המשך כ־{rolePreviewLabel(selected)}</Button>
        </>
      }
    >
      <div className="stack-4">
        <p className="t-caption text-muted">
          תראו את הניווט והכרטיסים כפי שמופיעים בתפקיד שנבחר. לחצו «חזרה לתפקיד שלי» כדי
          לשוב.
        </p>
        <ul className="impersonation-picker__list">
          {PREVIEWABLE_ROLES.map((role) => {
            const checked = role === selected
            return (
              <li key={role}>
                <label className={['impersonation-picker__row', checked ? 'is-selected' : ''].join(' ')}>
                  <input
                    type="radio"
                    name="role-preview-target"
                    checked={checked}
                    onChange={() => setSelected(role)}
                  />
                  <span className="t-body-strong">{rolePreviewLabel(role)}</span>
                </label>
              </li>
            )
          })}
        </ul>
      </div>
    </Dialog>
  )
}
