import type { AssignableRole } from './appRoles'
import { parseRolePreviewRole } from './rolePreview'

const STORAGE_KEY = 'yahpaz:rolePreview'
export const ROLE_PREVIEW_CHANGE_EVENT = 'yahpaz:rolePreview'

export type RolePreviewStash = {
  role: AssignableRole
  startedAt: string
}

function notifyRolePreviewChange() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(ROLE_PREVIEW_CHANGE_EVENT))
}

export function readRolePreviewStash(): RolePreviewStash | null {
  if (typeof sessionStorage === 'undefined') return null
  const raw = sessionStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { role?: unknown; startedAt?: unknown }
    const role = parseRolePreviewRole(parsed?.role)
    if (!role || typeof parsed.startedAt !== 'string' || !parsed.startedAt) {
      return null
    }
    return { role, startedAt: parsed.startedAt }
  } catch {
    return null
  }
}

export function writeRolePreviewStash(role: AssignableRole): void {
  const stash: RolePreviewStash = {
    role,
    startedAt: new Date().toISOString(),
  }
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stash))
  notifyRolePreviewChange()
}

export function clearRolePreviewStash(): void {
  sessionStorage.removeItem(STORAGE_KEY)
  notifyRolePreviewChange()
}

export function isRolePreviewing(): boolean {
  return readRolePreviewStash() !== null
}
