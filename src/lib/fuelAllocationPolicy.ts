import type { EventStatus } from './status'

export const FUEL_ALLOCATION_INCLUDES =
  'נספרים רק אירועים שתועדו במלואם.'

export const FUEL_USAGE_INCLUDES =
  'מוצגים כל האירועים עם ק״מ, גם אם תועדו חלקית.'

export const INCOMPLETE_FUEL_REFUND_NOTICE =
  'שימו לב! אירועים שלא תועדו במלואם לא נכללים בהחזר הדלק הרבעוני'

export function includeEventInFuelAllocation(status: EventStatus): boolean {
  return status === 'done'
}

export function shouldShowIncompleteFuelNotice(openCount: number): boolean {
  return openCount >= 3
}
