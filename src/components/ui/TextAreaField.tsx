import { useId, type TextareaHTMLAttributes } from 'react'

type TextAreaFieldProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'> & {
  label: string
  hint?: string
  error?: string
}

export function TextAreaField({
  label,
  hint,
  error,
  id,
  required,
  value,
  ...rest
}: TextAreaFieldProps) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const describedBy = error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined
  const isBlank = Boolean(required) && !value

  return (
    <div className="field">
      <label className="field__label" htmlFor={fieldId}>
        {label}
        {required ? <span className="visually-hidden"> שדה חובה</span> : null}
      </label>
      <div className="field__control">
        <textarea
          id={fieldId}
          className="field__input"
          data-blank={isBlank ? 'true' : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          required={required}
          value={value}
          {...rest}
        />
      </div>
      {error ? (
        <p id={`${fieldId}-error`} className="field__hint field__hint--error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${fieldId}-hint`} className="field__hint">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
