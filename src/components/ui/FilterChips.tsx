import { HoverTip } from './HoverTip'

type Option<T extends string> = { value: T; label: string; tip?: string }

type FilterChipsProps<T extends string> = {
  options: Option<T>[]
  value: T
  onChange: (value: T) => void
  label: string
}

export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  label,
}: FilterChipsProps<T>) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map((option) => {
        const chip = (
          <button
            type="button"
            className="chip"
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        )
        if (!option.tip) {
          return (
            <span key={option.value} className="chip-tip">
              {chip}
            </span>
          )
        }
        return (
          <HoverTip key={option.value} text={option.tip} mode="always" className="chip-tip">
            {chip}
          </HoverTip>
        )
      })}
    </div>
  )
}
