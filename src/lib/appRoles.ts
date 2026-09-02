import type { AppRole } from './auth'
import { SUPER_ADMIN_CAPTION } from './adminUserMenu'

export type AssignableRole = Exclude<AppRole, 'super_admin'>

const ROLE_RANK: AppRole[] = ['responder', 'shift_lead', 'admin', 'super_admin']

const ASSIGNABLE_RANK: AssignableRole[] = ['responder', 'shift_lead', 'admin']

const ROLE_LABEL: Record<AppRole, string> = {
  super_admin: SUPER_ADMIN_CAPTION,
  admin: 'מנהל',
  shift_lead: 'אחמ״ש',
  responder: 'מתנדב',
}

export function highestRole(roles: readonly AppRole[]): AppRole | null {
  let found: AppRole | null = null
  for (const role of ROLE_RANK) {
    if (roles.includes(role)) found = role
  }
  return found
}

export function roleLabel(role: AppRole): string {
  return ROLE_LABEL[role]
}

export function highestRoleLabel(roles: readonly AppRole[]): string | null {
  const role = highestRole(roles)
  return role ? roleLabel(role) : null
}

export function impliedAssignableRoles(role: AssignableRole): AssignableRole[] {
  const index = ASSIGNABLE_RANK.indexOf(role)
  return ASSIGNABLE_RANK.filter((_, i) => i <= index).reverse()
}

export function withImpliedAssignableRoles(roles: readonly AppRole[]): AssignableRole[] {
  const highest = ASSIGNABLE_RANK.filter((role) => roles.includes(role)).at(-1)
  return highest ? impliedAssignableRoles(highest) : []
}

export function isAssignableRoleLocked(
  roles: readonly AppRole[],
  role: AssignableRole,
): boolean {
  const roleIndex = ASSIGNABLE_RANK.indexOf(role)
  return ASSIGNABLE_RANK.some((candidate, index) => index > roleIndex && roles.includes(candidate))
}

export function toggleAssignableRole(
  current: readonly AppRole[],
  role: AssignableRole,
  checked: boolean,
): AssignableRole[] {
  if (checked) {
    const next = new Set<AssignableRole>([
      ...withImpliedAssignableRoles(current),
      ...impliedAssignableRoles(role),
    ])
    return impliedAssignableRoles(
      ASSIGNABLE_RANK.filter((item) => next.has(item)).at(-1) ?? role,
    )
  }

  return withImpliedAssignableRoles(current).filter((item) => item !== role)
}
