import type { VolunteerStatus } from './volunteerStatus'

/**
 * Scan mark on the users list for מתנדב פעיל and חניכה ברכב פרטי.
 *
 * A vehicle counts only when it is not archived — same rule as the רכבים
 * column and `מתנדב ללא רכב`. A map address is a `user_addresses` row with a
 * Google `place_id` and finite `lat`/`lng` (the pin the unit map draws).
 * Those three columns are required on the table, so a stored row is a pin.
 * An address without them would be free text and does not count.
 */

const GAP_STATUSES = new Set<VolunteerStatus>([
  'active_volunteer',
  'personal_vehicle_training',
])

export const USER_GAP_NO_VEHICLE = 'אין רכב'
export const USER_GAP_NO_MAP_ADDRESS = 'אין כתובת על המפה'
export const USER_GAP_BOTH = 'אין רכב ואין כתובת על המפה'

export type UserListGapInput = {
  volunteer_status: VolunteerStatus
  vehicles: { archived?: boolean | null }[]
  addresses: { place_id?: string | null; lat?: number | null; lng?: number | null }[]
}

export type UserListDataGap = {
  missingVehicle: boolean
  missingMapAddress: boolean
  tip: string
}

export function isRecognizedMapAddress(address: {
  place_id?: string | null
  lat?: number | null
  lng?: number | null
}): boolean {
  if (!address.place_id?.trim()) return false
  return Number.isFinite(address.lat) && Number.isFinite(address.lng)
}

export function userListDataGap(user: UserListGapInput): UserListDataGap | null {
  if (!GAP_STATUSES.has(user.volunteer_status)) return null

  const missingVehicle = !user.vehicles.some((vehicle) => !vehicle.archived)
  const missingMapAddress = !user.addresses.some(isRecognizedMapAddress)
  if (!missingVehicle && !missingMapAddress) return null

  const tip =
    missingVehicle && missingMapAddress
      ? USER_GAP_BOTH
      : missingVehicle
        ? USER_GAP_NO_VEHICLE
        : USER_GAP_NO_MAP_ADDRESS

  return { missingVehicle, missingMapAddress, tip }
}
