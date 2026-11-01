import { useId, type TextareaHTMLAttributes } from 'react'
import { FieldLabel } from './FieldLabel'

type TextAreaFieldProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'> & {
  label: string
  hint?: string
  error?: string
  /** Compact count above the input. `met` switches the caption tone. */
  counter?: { text: string; met: boolean }
}

export function TextAreaField({
  label,
  hint,
  error,
  counter,
  id,
  required,
  value,
  ...rest
}: TextAreaFieldProps) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const describedBy =
    [
      counter ? `${fieldId}-count` : null,
      error ? `${fieldId}-error` : null,
      hint ? `${fieldId}-hint` : null,
    ]
      .filter(Boolean)
      .join(' ') || undefined
  const isBlank = Boolean(required) && !value

  return (
    <div className="field">
      <FieldLabel htmlFor={fieldId} required={required}>
        {label}
      </FieldLabel>
      {counter ? (
        <p
          id={`${fieldId}-count`}
          className={counter.met ? 'field__counter field__counter--met' : 'field__counter'}
        >
          {counter.text}
        </p>
      ) : null}
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
