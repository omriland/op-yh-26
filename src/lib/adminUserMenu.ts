import type { AppRole } from './auth'

export const SUPER_ADMIN_CAPTION = 'מנהל־על'
export const SUPER_ADMIN_LOCK_ERROR = 'לא ניתן לערוך מנהל־על.'

/** Users-page OTP only applies to people who can open ניהול משתמשים. */
export function canToggleUsersPageOtp(roles: readonly AppRole[]): boolean {
  return roles.includes('admin')
}

export function hasSuperAdminRole(roles: readonly AppRole[]): boolean {
  return roles.includes('super_admin')
}

/** Regular admins cannot mutate a Super Admin row. Super Admins can. */
export function canMutateAdminUser(
  actorIsSuperAdmin: boolean,
  targetRoles: readonly AppRole[],
): boolean {
  return actorIsSuperAdmin || !hasSuperAdminRole(targetRoles)
}

export function shouldShowAdminUserOverflow(options: {
  canMutate: boolean
  hasSetPassword: boolean
  hasImpersonate: boolean
}): boolean {
  return options.canMutate || options.hasSetPassword || options.hasImpersonate
}
