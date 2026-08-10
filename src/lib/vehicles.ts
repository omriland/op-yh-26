import { plateDigits } from './format'
import { supabase } from './supabase'

export type VehicleRow = {
  id: string
  plate_number: string
  model: string
  archived: boolean
}

/** True when this plate/user appears on an event participation or a shift personal vehicle. */
export async function isVehicleAttachedToEvents(
  userId: string,
  vehicleId: string,
  plateNumber: string,
): Promise<boolean> {
  const digits = plateDigits(plateNumber)
  if (!digits && !vehicleId) return false

  const { data: participations, error: participationError } = await supabase
    .from('event_responders')
    .select('vehicle_plate')
    .eq('responder_id', userId)
    .not('vehicle_plate', 'is', null)

  if (participationError) {
    throw new Error(participationError.message)
  }

  const usedOnEvent = (participations ?? []).some(
    (row) => plateDigits(String(row.vehicle_plate ?? '')) === digits,
  )
  if (usedOnEvent) return true

  const { data: shifts, error: shiftError } = await supabase
    .from('shifts')
    .select('id')
    .eq('personal_vehicle_id', vehicleId)
    .limit(1)

  // Shifts table may not exist yet in older environments — treat as not attached.
  if (shiftError) {
    if (/does not exist|relation|42P01/i.test(shiftError.message)) return false
    throw new Error(shiftError.message)
  }

  return (shifts ?? []).length > 0
}
