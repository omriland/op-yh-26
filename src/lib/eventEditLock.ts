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
