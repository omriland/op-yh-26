import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import {
  ASSIGNED_VOLUNTEER_EVENT_EDIT_CLOSE,
  ASSIGNED_VOLUNTEER_EVENT_EDIT_ERROR,
} from '../../lib/assignedVolunteerEventEdit'

type AssignedVolunteerEditBlockedDialogProps = {
  open: boolean
  onClose: () => void
}

export function AssignedVolunteerEditBlockedDialog({
  open,
  onClose,
}: AssignedVolunteerEditBlockedDialogProps) {
  return (
    <Dialog
      open={open}
      title={ASSIGNED_VOLUNTEER_EVENT_EDIT_ERROR}
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          {ASSIGNED_VOLUNTEER_EVENT_EDIT_CLOSE}
        </Button>
      }
    >
      {null}
    </Dialog>
  )
}
