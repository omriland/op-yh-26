import type { AppRole } from './auth'

export type ImpersonationTarget = {
  id: string
  active: boolean
  roles: AppRole[]
}

/** Client + shared rules for who a Super Admin may become. */
export function canImpersonateTarget(
  actorUserId: string | null | undefined,
  target: ImpersonationTarget,
): boolean {
  if (!actorUserId) return false
  if (!target.active) return false
  if (target.id === actorUserId) return false
  if (target.roles.includes('super_admin')) return false
  return true
}
