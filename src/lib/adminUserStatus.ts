import { hasAvailabilityStatus } from './volunteerStatus'

/** Invite not completed — profile still marked pending in the app. */
export function isInvitePending(user: {
  active: boolean
  invite_pending: boolean
}): boolean {
  return user.active && user.invite_pending
}

/**
 * A password sign-in means registration finished.
 * Opening the invite link signs the person in before they choose a password;
 * that session still has a setup reason and must stay pending.
 */
export function shouldClearInviteOnPasswordSignIn(
  user: { invite_pending?: boolean } | null | undefined,
  passwordSetupReason: string | null,
): boolean {
  return user?.invite_pending === true && !passwordSetupReason
}

/** Invitees who have not registered yet, and statuses outside the duty set, have no duty availability. */
export function hasAvailability(user: {
  active: boolean
  invite_pending: boolean
  volunteer_status: unknown
}): boolean {
  return !isInvitePending(user) && hasAvailabilityStatus(user.volunteer_status)
}

/**
 * Sort: pending invitees → active confirmed → inactive.
 * Stable name order within each group (caller should pre-sort by name).
 */
export function compareAdminUsers(
  a: { active: boolean; invite_pending: boolean; full_name: string },
  b: { active: boolean; invite_pending: boolean; full_name: string },
): number {
  const rank = (user: typeof a) => {
    if (!user.active) return 2
    if (user.invite_pending) return 0
    return 1
  }
  const byRank = rank(a) - rank(b)
  if (byRank !== 0) return byRank
  return a.full_name.localeCompare(b.full_name, 'he')
}
