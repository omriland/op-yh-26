import type { AppRole } from './auth'
import { roleLabel, type AssignableRole } from './appRoles'

export const PREVIEWABLE_ROLES: readonly AssignableRole[] = [
  'responder',
  'shift_lead',
  'admin',
]

export function parseRolePreviewRole(value: unknown): AssignableRole | null {
  if (value === 'responder' || value === 'shift_lead' || value === 'admin') {
    return value
  }
  return null
}

export function canStartRolePreview(input: {
  actualRoles: readonly AppRole[]
  impersonating: boolean
  previewing: boolean
}): boolean {
  return (
    input.actualRoles.includes('super_admin') &&
    !input.impersonating &&
    !input.previewing
  )
}

export function effectiveRoles(
  actualRoles: readonly AppRole[],
  previewRole: AssignableRole | null,
): AppRole[] {
  if (!previewRole) return [...actualRoles]
  return [previewRole]
}

export function rolePreviewLabel(role: AssignableRole): string {
  return roleLabel(role)
}
