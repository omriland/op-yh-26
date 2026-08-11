import type { AppRole } from './auth'

/** Roles that must never be added/removed via the admin users UI sync. */
const PROTECTED_ROLES = new Set<AppRole>(['super_admin'])

/**
 * Diff current vs next assignable roles, ignoring `super_admin` so admin
 * edits cannot grant or strip DB-only privileges.
 */
export function syncUserRolesDiff(
  current: AppRole[],
  next: AppRole[],
): { toAdd: AppRole[]; toRemove: AppRole[] } {
  const currentSet = new Set(current)
  const nextAssignable = next.filter((role) => !PROTECTED_ROLES.has(role))
  const nextSet = new Set(nextAssignable)

  const toRemove = [...currentSet].filter(
    (role) => !PROTECTED_ROLES.has(role) && !nextSet.has(role),
  )
  const toAdd = nextAssignable.filter((role) => !currentSet.has(role))

  return { toAdd, toRemove }
}
