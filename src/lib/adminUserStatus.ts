/** Invite not completed — Auth email not confirmed yet. */
export function isInvitePending(user: {
  active: boolean
  email_confirmed_at: string | null
}): boolean {
  return user.active && !user.email_confirmed_at
}

/**
 * Sort: pending invitees → active confirmed → inactive.
 * Stable name order within each group (caller should pre-sort by name).
 */
export function compareAdminUsers(
  a: { active: boolean; email_confirmed_at: string | null; full_name: string },
  b: { active: boolean; email_confirmed_at: string | null; full_name: string },
): number {
  const rank = (user: typeof a) => {
    if (!user.active) return 2
    if (!user.email_confirmed_at) return 0
    return 1
  }
  const byRank = rank(a) - rank(b)
  if (byRank !== 0) return byRank
  return a.full_name.localeCompare(b.full_name, 'he')
}
