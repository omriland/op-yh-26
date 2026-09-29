/** Age after which only admin / super_admin may edit an event. */
export const EVENT_EDIT_LOCK_MS = 7 * 24 * 60 * 60 * 1000

export const EVENT_EDIT_LOCKED_TOOLTIP = 'לא ניתן לערוך אירוע שנוצר לפני מעל ל-7 ימים'

export function isEventEditAgeLocked(input: {
  createdAt?: string | null
  roles?: readonly string[]
  now?: number
}): boolean {
  if (input.roles?.includes('admin') || input.roles?.includes('super_admin')) return false
  const created = input.createdAt?.trim()
  if (!created) return false
  const createdMs = new Date(created).getTime()
  if (Number.isNaN(createdMs)) return false
  return (input.now ?? Date.now()) - createdMs > EVENT_EDIT_LOCK_MS
}

export type LockedLeadKmRow = {
  assignmentId?: string
  hasVehicle: boolean
  totalKm: string
}

export type LockedLeadKmWrite = {
  assignmentId: string
  totalKm: number
}

/**
 * After the age lock, קילומטרים stays open only while it is still empty and
 * the volunteer has a car. A stored `0` is filled.
 */
export function lockedLeadKmFillable(row: { hasVehicle: boolean; totalKm: string }): boolean {
  return row.hasVehicle && row.totalKm.trim() === ''
}

function parseLockedLeadKm(totalKm: string): number | null {
  const trimmed = totalKm.trim()
  if (!trimmed) return null
  const value = Number(trimmed)
  if (!Number.isFinite(value) || value < 0) return null
  return value
}

/**
 * Null → number writes for volunteers who already have a car.
 * Skips a stored number (including 0), a volunteer without a car, a row that
 * was not on the event, and every field other than total_km.
 */
export function lockedLeadKmWrites(input: {
  responders: readonly LockedLeadKmRow[]
  stored: readonly LockedLeadKmRow[]
}): LockedLeadKmWrite[] {
  const storedById = new Map(
    input.stored.flatMap((row) => (row.assignmentId ? [[row.assignmentId, row] as const] : [])),
  )
  const writes: LockedLeadKmWrite[] = []
  for (const row of input.responders) {
    if (!row.assignmentId) continue
    const stored = storedById.get(row.assignmentId)
    if (!stored || !lockedLeadKmFillable(stored)) continue
    const totalKm = parseLockedLeadKm(row.totalKm)
    if (totalKm == null) continue
    writes.push({ assignmentId: row.assignmentId, totalKm })
  }
  return writes
}
