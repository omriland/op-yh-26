import { AlertDialog } from '../ui/AlertDialog'
import { Button } from '../ui/Button'
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
    <AlertDialog
      open={open}
      status="warning"
      title={ASSIGNED_VOLUNTEER_EVENT_EDIT_ERROR}
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          {ASSIGNED_VOLUNTEER_EVENT_EDIT_CLOSE}
        </Button>
      }
    />
  )
}
