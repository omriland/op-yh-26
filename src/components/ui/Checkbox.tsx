type CheckboxProps = {
  id: string
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}

export function Checkbox({ id, label, checked, onChange, disabled }: CheckboxProps) {
  return (
    <label className={['check-row', disabled ? 'is-disabled' : ''].join(' ')} htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        className="check-row__input"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="check-row__box" aria-hidden="true" />
      <span className="t-body">{label}</span>
    </label>
  )
}
