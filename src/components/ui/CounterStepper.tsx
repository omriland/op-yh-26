import { Minus, Plus } from 'lucide-react'

type CounterStepperProps = {
  label: string
  value: number
  /** Absolute value (legacy). Prefer `onDelta` when parent state can be stale across rapid taps. */
  onChange?: (value: number) => void
  /** Apply +1 / −1 against the latest parent state. */
  onDelta?: (delta: number) => void
  min?: number
  max?: number
}

export function CounterStepper({
  label,
  value,
  onChange,
  onDelta,
  min = 0,
  max = 99,
}: CounterStepperProps) {
  function bump(delta: number) {
    if (onDelta) {
      onDelta(delta)
      return
    }
    onChange?.(Math.min(max, Math.max(min, value + delta)))
  }

  return (
    <div className="stepper">
      <span className="t-body">{label}</span>
      <div className="stepper__controls">
        <button
          type="button"
          className="stepper__btn"
          aria-label={`הפחתת ${label}`}
          disabled={value <= min}
          onClick={() => bump(-1)}
        >
          <Minus size={18} strokeWidth={1.75} />
        </button>
        <span className={['stepper__value', 'mono', value === 0 ? 'text-muted' : ''].join(' ')}>
          {value}
        </span>
        <button
          type="button"
          className="stepper__btn"
          aria-label={`הוספת ${label}`}
          disabled={value >= max}
          onClick={() => bump(1)}
        >
          <Plus size={18} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  )
}
