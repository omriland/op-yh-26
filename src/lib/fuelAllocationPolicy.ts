import type { EventStatus } from './status'

export const FUEL_ALLOCATION_INCLUDES =
  'נספרים רק אירועים שתועדו במלואם.'

export const FUEL_USAGE_INCLUDES =
  'מוצגים כל האירועים עם ק״מ, גם אם תועדו חלקית.'

export const INCOMPLETE_FUEL_REFUND_NOTICE =
  'אירועים שלא תועדו במלואם אינם נכללים בהחזר הדלק הרבעוני.'

export function includeEventInFuelAllocation(status: EventStatus): boolean {
  return status === 'done'
}

/**
 * Shown for any open event, not from the third onward: a volunteer with two
 * undocumented events forfeits the same refund and was previously told nothing.
 */
export function shouldShowIncompleteFuelNotice(openCount: number): boolean {
  return openCount > 0
}
