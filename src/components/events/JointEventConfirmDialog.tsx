import { Button } from '../ui/Button'
import { AlertDialog } from '../ui/AlertDialog'
import {
  JOINT_EVENT_CONFIRM_CANCEL,
  JOINT_EVENT_CONFIRM_HINT,
  JOINT_EVENT_CONFIRM_PROCEED,
  JOINT_EVENT_CONFIRM_TITLE,
} from '../../lib/jointEvents'

type JointEventConfirmDialogProps = {
  open: boolean
  onProceed: () => void
  onCancel: () => void
}

export function JointEventConfirmDialog({
  open,
  onProceed,
  onCancel,
}: JointEventConfirmDialogProps) {
  return (
    <AlertDialog
      open={open}
      status="warning"
      title={JOINT_EVENT_CONFIRM_TITLE}
      onClose={onCancel}
      footer={
        <>
          <Button onClick={onProceed}>{JOINT_EVENT_CONFIRM_PROCEED}</Button>
          <Button variant="secondary" onClick={onCancel}>
            {JOINT_EVENT_CONFIRM_CANCEL}
          </Button>
        </>
      }
    >
      <p className="t-body text-secondary">{JOINT_EVENT_CONFIRM_HINT}</p>
    </AlertDialog>
  )
}
