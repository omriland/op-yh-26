export const SHOW_OTHERS_CREATED_EVENTS_LABEL = 'הצג אירועים שנוצרו על ידי אחרים'

const SHOW_OTHERS_STORAGE_KEY = 'yahpaz:unitEventsShowOthers'

/** אחמ״ש only — not admin, not SuperAdmin. Those roles keep the full unit list. */
export function shouldFilterUnitEventsToOwnCreated(roles: readonly string[]): boolean {
  return roles.includes('shift_lead') && !roles.includes('admin') && !roles.includes('super_admin')
}

/** `shift_lead_id` to push into the unit-list query / search RPC, or null for everyone. */
export function unitEventsCreatedByFilter(input: {
  roles: readonly string[]
  showOthersCreated: boolean
  userId: string | undefined
}): string | null {
  if (!shouldFilterUnitEventsToOwnCreated(input.roles)) return null
  if (input.showOthersCreated) return null
  return input.userId ?? null
}

export function readShowOthersCreatedEvents(storage?: Storage | null): boolean {
  try {
    const store = storage ?? (typeof sessionStorage === 'undefined' ? null : sessionStorage)
    return store?.getItem(SHOW_OTHERS_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function writeShowOthersCreatedEvents(show: boolean, storage?: Storage | null): void {
  try {
    const store = storage ?? (typeof sessionStorage === 'undefined' ? null : sessionStorage)
    if (!store) return
    if (show) store.setItem(SHOW_OTHERS_STORAGE_KEY, '1')
    else store.removeItem(SHOW_OTHERS_STORAGE_KEY)
  } catch {
    // sessionStorage can throw in private mode
  }
}
