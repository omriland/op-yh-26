import { plateDigits, plateNumberForSave } from './format'
import { queryVehiclesWithDefaultFallback } from './defaultVehicle'
import { supabase } from './supabase'

export type VehicleRow = {
  id: string
  plate_number: string
  model: string
  archived: boolean
  is_default: boolean
}

export type VehicleRemoveMode = 'archive' | 'delete'

export const SET_DEFAULT_VEHICLE_LABEL = 'הגדר כרכב ברירת מחדל'
export const DEFAULT_VEHICLE_LABEL = 'רכב ראשי'

export const VEHICLE_DELETE_CONFIRM =
  'האם למחוק את הרכב הזה? לא ניתן לשחזר אותו לאחר המחיקה.'

export const VEHICLE_ARCHIVE_CONFIRM =
  'לא ניתן למחוק רכב זה כי הוא מקושר לאירוע קיים. האם להעביר אותו לארכיון כדי שאיש לא יוכל להשתמש בו יותר במערכת?'

const DUPLICATE_PLATE_ERROR =
  'לא ניתן לשייך את אותה לוחית רישוי יותר מפעם אחת לאותו משתמש.'

export function vehicleRemoveMode(attached: boolean): VehicleRemoveMode {
  return attached ? 'archive' : 'delete'
}

export function isProfileVehicleEditing(
  vehicle: { key: string; id?: string },
  editingKey: string | null,
): boolean {
  return !vehicle.id || vehicle.key === editingKey
}

/**
 * Unsaved add-row drafts that should survive a reload.
 * Drop the row that just persisted (and any leftover whose plate is now saved)
 * so the add form closes instead of staying open with previous values.
 */
export function leftoverUnsavedVehicleDrafts<
  T extends { key: string; id?: string; plate_number: string },
>(
  drafts: T[],
  options?: {
    persistedKeys?: Iterable<string>
    savedPlates?: Iterable<string>
  },
): T[] {
  const persisted = new Set(options?.persistedKeys ?? [])
  const saved = new Set(
    [...(options?.savedPlates ?? [])].map((plate) => plateDigits(plate)).filter(Boolean),
  )
  return drafts.filter((row) => {
    if (row.id || persisted.has(row.key)) return false
    const plate = plateDigits(row.plate_number)
    if (plate && saved.has(plate)) return false
    return true
  })
}

export function vehicleFieldsForSave(
  plateNumber: string,
  model: string,
): { plate_number: string; model: string } | { error: string } {
  const plate = plateNumberForSave(plateNumber)
  const trimmedModel = model.trim()
  if (!plate || !trimmedModel) {
    return { error: 'יש להזין לוחית רישוי ודגם.' }
  }
  return { plate_number: plate, model: trimmedModel }
}

export function ownVehicleWriteError(
  error: { code?: string; message?: string } | null | undefined,
): string {
  if (error?.code === '23505') return DUPLICATE_PLATE_ERROR
  const message = error?.message?.trim()
  return message || 'שמירת הרכב נכשלה.'
}

export async function fetchOwnVehicles(userId: string): Promise<VehicleRow[]> {
  return queryVehiclesWithDefaultFallback(
    'id, plate_number, model, archived, is_default',
    async (select) => {
      const { data, error } = await supabase
        .from('vehicles')
        .select(select)
        .eq('user_id', userId)
      return { data: (data as VehicleRow[] | null) ?? null, error }
    },
  )
}

/** Mark this active vehicle as רכב ראשי. Clears any previous default for the same user. */
export async function setDefaultVehicle(vehicleId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('set_default_vehicle', { p_vehicle_id: vehicleId })
  if (error) {
    const message = error.message?.trim()
    if (error.code === 'PGRST202' || /schema cache/i.test(message ?? '')) {
      return { error: 'עדכון הרכב הראשי אינו זמין כרגע. נסו שוב בעוד רגע.' }
    }
    return { error: message || 'עדכון הרכב הראשי נכשל.' }
  }
  return { error: null }
}

export async function createOwnVehicle(
  userId: string,
  plateNumber: string,
  model: string,
): Promise<{ error: string | null }> {
  const fields = vehicleFieldsForSave(plateNumber, model)
  if ('error' in fields) return { error: fields.error }

  const { error } = await supabase.from('vehicles').insert({
    user_id: userId,
    plate_number: fields.plate_number,
    model: fields.model,
    archived: false,
  })

  if (error) return { error: ownVehicleWriteError(error) }
  return { error: null }
}

export async function updateOwnVehicle(
  vehicleId: string,
  plateNumber: string,
  model: string,
): Promise<{ error: string | null }> {
  const fields = vehicleFieldsForSave(plateNumber, model)
  if ('error' in fields) return { error: fields.error }

  const { error } = await supabase
    .from('vehicles')
    .update({
      plate_number: fields.plate_number,
      model: fields.model,
    })
    .eq('id', vehicleId)

  if (error) return { error: ownVehicleWriteError(error) }
  return { error: null }
}

export async function deleteVehicle(vehicleId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('vehicles').delete().eq('id', vehicleId)
  if (error) return { error: 'מחיקת הרכב נכשלה.' }
  return { error: null }
}

export async function archiveVehicle(vehicleId: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('vehicles')
    .update({ archived: true })
    .eq('id', vehicleId)
  if (error) return { error: 'העברת הרכב לארכיון נכשלה.' }
  return { error: null }
}

export async function unarchiveVehicle(vehicleId: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('vehicles')
    .update({ archived: false })
    .eq('id', vehicleId)
  if (error) return { error: 'שחזור הרכב מהארכיון נכשל.' }
  return { error: null }
}

export const deleteAdminVehicle = deleteVehicle
export const archiveAdminVehicle = archiveVehicle
export const unarchiveAdminVehicle = unarchiveVehicle

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
