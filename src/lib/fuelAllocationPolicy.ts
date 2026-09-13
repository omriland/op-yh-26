import type { ParticipationStatus } from './status'

export const FUEL_ALLOCATION_INCLUDES =
  'נספרים אירועים שתועדו על ידי המתנדב ויש להם ק״מ.'

export const FUEL_USAGE_INCLUDES =
  'מוצגים כל האירועים עם ק״מ, גם אם תועדו חלקית.'

export const INCOMPLETE_FUEL_REFUND_NOTICE =
  'אירועים שטרם תועדו על ידי המתנדב, או ללא ק״מ, אינם נכללים בהחזר הדלק הרבעוני.'

/**
 * Quarterly allocation / refund gate for one assignment.
 * Lead-entered `total_km` + that responder’s completed log.
 * Event status and other lead blanks (end time, police id, …) do not matter.
 */
export function includeParticipationInFuelAllocation(input: {
  totalKm: number | null | undefined
  participationStatus: ParticipationStatus | null | undefined
  frozen?: boolean
}): boolean {
  if (input.frozen) return false
  if (input.totalKm == null) return false
  return input.participationStatus === 'done'
}

/**
 * Shown for any open event, not from the third onward: a volunteer with two
 * undocumented events forfeits the same refund and was previously told nothing.
 */
export function shouldShowIncompleteFuelNotice(openCount: number): boolean {
  return openCount > 0
}
