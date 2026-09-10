import { useId, useState, type InputHTMLAttributes, type ReactNode, type Ref } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { FieldLabel } from './FieldLabel'

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> & {
  label: string
  hint?: string
  error?: string
  numeric?: boolean
  /** LTR isolate for plates / phones / emails / URLs — 05-rtl-language.md */
  isolate?: boolean
  affix?: ReactNode
  inputRef?: Ref<HTMLInputElement>
}

export function TextField({
  label,
  hint,
  error,
  numeric = false,
  isolate = false,
  affix,
  inputRef,
  id,
  required,
  value,
  ...rest
}: TextFieldProps) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const describedBy = [error ? `${fieldId}-error` : null, hint ? `${fieldId}-hint` : null]
    .filter(Boolean)
    .join(' ') || undefined
  const isBlank = Boolean(required) && !value

  return (
    <div className="field">
      <FieldLabel htmlFor={fieldId} required={required}>
        {label}
      </FieldLabel>
      <div
        className={['field__control', isolate ? 'ltr' : ''].filter(Boolean).join(' ')}
        dir={isolate ? 'ltr' : undefined}
      >
        <input
          id={fieldId}
          ref={inputRef}
          className={[
            'field__input',
            numeric ? 'field__input--numeric' : '',
            isolate ? 'ltr' : '',
            affix ? 'field__input--with-affix' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          data-blank={isBlank ? 'true' : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          required={required}
          value={value}
          {...rest}
        />
        {affix}
      </div>
      {error ? (
        <p id={`${fieldId}-error`} className="field__hint field__hint--error" role="alert">
          {error}
        </p>
      ) : null}
      {hint ? (
        <p id={`${fieldId}-hint`} className="field__hint">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export function PasswordField(props: Omit<TextFieldProps, 'type' | 'affix' | 'isolate'>) {
  const [visible, setVisible] = useState(false)

  return (
    <TextField
      {...props}
      // Passwords are almost always Latin — only LTR field in the product.
      isolate
      type={visible ? 'text' : 'password'}
      affix={
        <button
          type="button"
          className="field__affix"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? 'הסתרת סיסמה' : 'הצגת סיסמה'}
          title={visible ? 'הסתרת סיסמה' : 'הצגת סיסמה'}
        >
          {visible ? <EyeOff size={20} strokeWidth={1.75} /> : <Eye size={20} strokeWidth={1.75} />}
        </button>
      }
    />
  )
}
