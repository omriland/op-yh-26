type ToggleProps = {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}

export function Toggle({ label, checked, onChange, disabled }: ToggleProps) {
  return (
    <label className={['toggle-row', disabled ? 'is-disabled' : ''].filter(Boolean).join(' ')}>
      <span className="t-body">{label}</span>
      <button
        type="button"
        role="switch"
        className="toggle"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
      >
        <span className="toggle__thumb" />
      </button>
    </label>
  )
}
