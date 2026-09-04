type IncompleteFieldsNoticeProps = {
  fields: string[]
  /** Spoken name: "חסרים: …" */
  spoken: string
}

/**
 * Ledger blanks for a pinned incomplete event.
 * Marker + field names — not a stamp, not an alert wash.
 */
export function IncompleteFieldsNotice({ fields, spoken }: IncompleteFieldsNoticeProps) {
  if (fields.length === 0) return null

  return (
    <div className="incomplete-notice" aria-label={spoken}>
      <span className="incomplete-notice__mark">פרטים חסרים:</span>
      <ul className="incomplete-notice__fields">
        {fields.map((label) => (
          <li key={label} className="incomplete-notice__field">
            {label}
          </li>
        ))}
      </ul>
    </div>
  )
}
