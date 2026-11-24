import { barText, type CurrentShift } from '../../lib/currentShift'
import type { ShiftPhase } from '../../lib/shiftWindow'
import { Button } from '../ui/Button'

type OnShiftBarProps = {
  shift: CurrentShift
  phase: ShiftPhase
  now: Date
  onOpenShift: () => void
}

const NUMBER_PATTERN = /(\d+(?::\d+)?)/

function textWithMonoNumbers(text: string) {
  return text.split(NUMBER_PATTERN).map((part, index) =>
    index % 2 === 1 ? (
      <span key={index} className="mono">
        {part}
      </span>
    ) : (
      part
    ),
  )
}

export function OnShiftBar({ shift, phase, now, onOpenShift }: OnShiftBarProps) {
  const className = phase === 'finishing' ? 'on-shift-bar on-shift-bar--finishing' : 'on-shift-bar'
  return (
    <div className={className} role="status" data-theme="field">
      <p className="on-shift-bar__text t-caption">{textWithMonoNumbers(barText(shift, phase, now))}</p>
      <Button variant="secondary" onClick={onOpenShift}>
        למשמרת
      </Button>
    </div>
  )
}
