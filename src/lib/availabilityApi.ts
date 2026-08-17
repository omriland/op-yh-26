import { supabase } from './supabase'
import {
  buildAvailabilityWrite,
  israelToday,
  type AvailabilityStatus,
} from './availability'

export async function saveAvailability(
  userId: string,
  input: { status: AvailabilityStatus; availableFrom: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const write = buildAvailabilityWrite({
    status: input.status,
    availableFrom: input.availableFrom,
    today: israelToday(),
  })
  if (!write.ok) return write

  const { error } = await supabase
    .from('profiles')
    .update({
      availability: write.availability,
      available_from: write.available_from,
    })
    .eq('id', userId)

  if (error) {
    const message = error.message ?? ''
    if (message.includes('בחרו תאריך') || message.includes('אין הרשאה')) {
      return { ok: false, error: message }
    }
    return { ok: false, error: 'עדכון הזמינות נכשל.' }
  }

  return { ok: true }
}
