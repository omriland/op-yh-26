import { barText, type CurrentShift } from '../../lib/currentShift'
import type { ShiftPhase } from '../../lib/shiftWindow'
import { Button } from '../ui/Button'

type OnShiftBarProps = {
  shift: CurrentShift
  phase: ShiftPhase
  now: Date
  onOpenShift: () => void
}

export function OnShiftBar({ shift, phase, now, onOpenShift }: OnShiftBarProps) {
  const className = phase === 'finishing' ? 'on-shift-bar on-shift-bar--finishing' : 'on-shift-bar'
  return (
    <div className={className} role="status" data-theme="field">
      <p className="on-shift-bar__text t-caption">{barText(shift, phase, now)}</p>
      <Button variant="secondary" onClick={onOpenShift}>
        למשמרת
      </Button>
    </div>
  )
}
