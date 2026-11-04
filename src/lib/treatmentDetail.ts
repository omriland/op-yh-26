/** Minimum trimmed length for פירוט הטיפול on complete. Typing past this is allowed. */
export const TREATMENT_DETAIL_MIN_CHARS = 25

export const TREATMENT_DETAIL_MIN_ERROR = 'יש להזין לפחות 25 תווים בפירוט הטיפול.'

/** Characters that count toward the minimum. Leading and trailing whitespace do not. */
export function treatmentDetailCharCount(value: string): number {
  return value.trim().length
}

export function treatmentDetailMeetsMinimum(value: string): boolean {
  return treatmentDetailCharCount(value) >= TREATMENT_DETAIL_MIN_CHARS
}

/**
 * Complete-mode error for פירוט הטיפול.
 * A cancelled event has no minimum: blank and short text are both valid.
 * Any other event still needs TREATMENT_DETAIL_MIN_CHARS trimmed characters.
 */
export function treatmentDetailCompleteError(
  value: string,
  cancelled = false,
): string | undefined {
  if (cancelled) return undefined
  return treatmentDetailMeetsMinimum(value) ? undefined : TREATMENT_DETAIL_MIN_ERROR
}

/** Compact Hebrew counter: current trimmed length against the minimum. */
export function treatmentDetailCounter(value: string): { text: string; met: boolean } {
  const count = treatmentDetailCharCount(value)
  return {
    text: `${count} מתוך ${TREATMENT_DETAIL_MIN_CHARS}`,
    met: count >= TREATMENT_DETAIL_MIN_CHARS,
  }
}
