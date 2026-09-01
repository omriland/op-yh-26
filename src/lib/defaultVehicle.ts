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
