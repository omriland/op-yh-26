import type { AppRole } from './auth'

/** SuperAdmin chrome (nav + tools). Hidden while impersonating or role-previewing. */
export function canAccessSuperAdminNav(input: {
  roles: readonly AppRole[]
  impersonating: boolean
  previewing: boolean
}): boolean {
  return input.roles.includes('super_admin') && !input.impersonating && !input.previewing
}
