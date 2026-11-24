import { formatNumber } from './format'

/**
 * One odometer order rule for every surface that logs two readings.
 *
 * An equal pair is a real record: a vehicle that never left the spot, or a
 * responder who logs 0 in both fields. Only a reversed pair is a typo, so the
 * copy names the rule it enforces — smaller, not equal.
 */
export const ODOMETER_ORDER_ERROR = 'מד אוץ סיום אינו יכול להיות קטן ממד אוץ התחלה'

/**
 * End reading, then the trip in parentheses: `(6 ק״מ סה״כ)`.
 *
 * The number is end − start from the two readings they filled in. It is never
 * the אחמ״ש kilometer (`total_km`), which stays a separate field and stays
 * hidden from a plain כונן. A missing end reading stays blank. A missing start,
 * or an end that is smaller than the start, shows the end figure alone.
 */
export function formatOdometerEndReading(
  start: number | null | undefined,
  end: number | null | undefined,
): string | undefined {
  const parts = odometerEndReading(start, end)
  if (!parts) return undefined
  if (parts.trip == null) return parts.end
  return `${parts.end} (${parts.trip} ק״מ סה״כ)`
}

export function odometerEndReading(
  start: number | null | undefined,
  end: number | null | undefined,
): { end: string; trip: string | null } | undefined {
  if (end == null || !Number.isFinite(end)) return undefined
  const endText = formatNumber(end)
  if (start == null || !Number.isFinite(start) || end < start) {
    return { end: endText, trip: null }
  }
  return { end: endText, trip: formatNumber(end - start) }
}
