type FieldLabelProps = {
  htmlFor: string
  required?: boolean
  /** Keep the label for assistive tech only (toolbar / compact rows). */
  hide?: boolean
  children: string
}

/**
 * Shared form label. Required fields show a red `*` plus the existing
 * visually-hidden `שדה חובה` (08-accessibility — not color alone).
 */
export function FieldLabel({ htmlFor, required, hide, children }: FieldLabelProps) {
  return (
    <label className={hide ? 'visually-hidden' : 'field__label'} htmlFor={htmlFor}>
      {children}
      {required ? (
        <>
          <span className="field__required" aria-hidden="true">
            *
          </span>
          <span className="visually-hidden"> שדה חובה</span>
        </>
      ) : null}
    </label>
  )
}
