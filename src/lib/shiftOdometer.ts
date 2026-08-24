import { supabase } from './supabase'
import { SHIFT_ODOMETER_ORDER_ERROR, computeTotalKm, refreshShiftLogStatus } from './shiftForm'

/**
 * Narrow save for the two readings a volunteer usually needs to log.
 *
 * The full shift form is ~24 controls behind one all-or-nothing save, which is the
 * wrong shape for someone standing at the vehicle with the odometer in front of them.
 * This writes only the readings and the derived distance, then refreshes status
 * from those readings plus the shift-born events.
 */

export type ShiftOdometerInput = {
  shiftId: string
  odometerStart: number | null
  odometerEnd: number | null
}

export type ShiftOdometerResult =
  | { ok: true; totalKm: number | null }
  | { ok: false; error: string }

export const SHIFT_ODOMETER_INCOMPLETE_ERROR = 'יש להזין מד אוץ התחלה ומד אוץ סיום'

export function validateShiftOdometer(
  start: number | null,
  end: number | null,
): string | undefined {
  if (start == null || end == null) return SHIFT_ODOMETER_INCOMPLETE_ERROR
  if (end < start) return SHIFT_ODOMETER_ORDER_ERROR
  return undefined
}

export async function saveShiftOdometer(
  input: ShiftOdometerInput,
): Promise<ShiftOdometerResult> {
  const invalid = validateShiftOdometer(input.odometerStart, input.odometerEnd)
  if (invalid) return { ok: false, error: invalid }

  const totalKm = computeTotalKm(input.odometerStart, input.odometerEnd)

  const { data, error } = await supabase
    .from('shifts')
    .update({
      odometer_start: input.odometerStart,
      odometer_end: input.odometerEnd,
      total_km: totalKm,
    })
    .eq('id', input.shiftId)
    .select('id')
    .maybeSingle()

  if (error) {
    return { ok: false, error: 'שמירת מד האוץ נכשלה. בדקו את החיבור ונסו שוב.' }
  }
  if (!data) {
    // RLS filtered the row, or it no longer exists.
    return { ok: false, error: 'לא ניתן לעדכן את המשמרת הזו.' }
  }
  await refreshShiftLogStatus(input.shiftId)
  return { ok: true, totalKm }
}
