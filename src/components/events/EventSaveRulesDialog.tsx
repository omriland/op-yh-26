import { Button } from '../ui/Button'
import { AlertDialog } from '../ui/AlertDialog'
import { TreatedPlateStack } from './TreatedPlateStack'
import {
  SAVE_RULES_BACK,
  SAVE_RULES_PROCEED_DEFAULT,
  type SaveRuleIssue,
} from '../../lib/eventSaveRules'

type EventSaveRulesDialogProps = {
  open: boolean
  issues: SaveRuleIssue[]
  onBack: () => void
  onProceed: () => void
}

export function EventSaveRulesDialog({
  open,
  issues,
  onBack,
  onProceed,
}: EventSaveRulesDialogProps) {
  const photo = issues.find((issue) => issue.id === 'vehicle_photos')
  const title = photo?.title ?? issues[0]?.title ?? 'לפני השמירה'
  const proceedLabel =
    photo?.proceedLabel ?? issues[0]?.proceedLabel ?? SAVE_RULES_PROCEED_DEFAULT
  const textIssues = issues.filter((issue) => issue.id !== 'vehicle_photos')

  return (
    <AlertDialog
      open={open}
      status="warning"
      title={title}
      onClose={onBack}
      footer={
        <>
          <Button onClick={onProceed}>{proceedLabel}</Button>
          <Button variant="secondary" onClick={onBack}>
            {SAVE_RULES_BACK}
          </Button>
        </>
      }
    >
      <div className="stack-3">
        {textIssues.map((issue) =>
          issue.message && issue.message !== title ? (
            <p key={issue.id} className="t-body">
              {issue.message}
            </p>
          ) : null,
        )}
        {photo?.vehicles && photo.vehicles.length > 0 ? (
          <TreatedPlateStack plates={photo.vehicles} />
        ) : null}
      </div>
    </AlertDialog>
  )
}
