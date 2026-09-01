import { plateDigits } from './format'

export type DefaultVehicleChoice = {
  plate: string
  isDefault?: boolean
}

export type DefaultPersonalVehicleChoice = {
  id: string
  userId?: string
  isDefault?: boolean
}

/** Plate to pre-select on fill / assignment: saved plate, then starred default, then the only vehicle. */
export function pickDefaultVehiclePlate(
  vehicles: DefaultVehicleChoice[],
  existingPlate?: string | null,
): string {
  const existing = plateDigits(existingPlate ?? '')
  if (existing && vehicles.some((vehicle) => vehicle.plate === existing)) {
    return existing
  }
  const starred = vehicles.find((vehicle) => vehicle.isDefault)?.plate
  if (starred) return starred
  if (vehicles.length === 1) return vehicles[0]!.plate
  return ''
}

/** Personal-shift plate: first assigned responder’s starred car, then any star, then the only option. */
export function pickDefaultPersonalVehicleId(
  vehicles: DefaultPersonalVehicleChoice[],
  responderIds: string[] = [],
): string | null {
  for (const responderId of responderIds) {
    const match = vehicles.find((vehicle) => vehicle.userId === responderId && vehicle.isDefault)
    if (match) return match.id
  }
  const starred = vehicles.find((vehicle) => vehicle.isDefault)
  if (starred) return starred.id
  if (vehicles.length === 1) return vehicles[0]!.id
  return null
}

/** Star control is only useful when the responder has more than one active vehicle. */
export function canChooseDefaultVehicle(
  vehicles: { archived?: boolean | null }[],
): boolean {
  return vehicles.filter((vehicle) => !vehicle.archived).length >= 2
}

/** PostgREST 42703 when `vehicles.is_default` has not been migrated yet. */
export function isMissingDefaultVehicleColumn(
  error: { code?: string; message?: string } | null | undefined,
): boolean {
  if (!error) return false
  return error.code === '42703' && /vehicles\.is_default/.test(error.message ?? '')
}

type VehicleQueryError = { code?: string; message?: string }

/**
 * Select `is_default` when the column exists; otherwise retry without it so
 * profile/fill still list cars instead of looking empty.
 */
export async function queryVehiclesWithDefaultFallback<T extends object>(
  select: string,
  run: (
    select: string,
  ) => Promise<{ data: unknown; error: VehicleQueryError | null }>,
): Promise<Array<T & { is_default: boolean }>> {
  const first = await run(select)
  if (!first.error) {
    return asVehicleRows<T>(first.data)
  }
  if (!isMissingDefaultVehicleColumn(first.error)) {
    throw new Error(first.error.message ?? 'טעינת הרכבים נכשלה.')
  }
  const fallbackSelect = select.replace(/,\s*is_default\b/, '')
  const second = await run(fallbackSelect)
  if (second.error) {
    throw new Error(second.error.message ?? 'טעינת הרכבים נכשלה.')
  }
  return asVehicleRows<T>(second.data).map((row) => ({
    ...row,
    is_default: false,
  }))
}

function asVehicleRows<T extends object>(data: unknown): Array<T & { is_default: boolean }> {
  if (!Array.isArray(data)) return []
  return data.map((row) => {
    const record = (row ?? {}) as T & { is_default?: boolean }
    return { ...record, is_default: Boolean(record.is_default) }
  })
}
