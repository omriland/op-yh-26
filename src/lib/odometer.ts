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
 * End reading with the trip the responder logged, in brackets.
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
  if (end == null || !Number.isFinite(end)) return undefined
  const endText = formatNumber(end)
  if (start == null || !Number.isFinite(start) || end < start) return endText
  return `${endText} (${formatNumber(end - start)})`
}
