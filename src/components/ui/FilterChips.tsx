type Option<T extends string> = { value: T; label: string }

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
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="chip"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
