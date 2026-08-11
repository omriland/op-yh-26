const STORAGE_KEY = 'yahpaz:impersonation'
export const IMPERSONATION_CHANGE_EVENT = 'yahpaz:impersonation'

export type ImpersonationStash = {
  actorAccessToken: string
  actorRefreshToken: string
  actorUserId: string
  targetUserId: string
  targetFullName: string
  targetCallsign: string
  startedAt: string
}

function notifyImpersonationChange() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(IMPERSONATION_CHANGE_EVENT))
}

export function readImpersonationStash(): ImpersonationStash | null {
  if (typeof sessionStorage === 'undefined') return null
  const raw = sessionStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as ImpersonationStash
    if (
      !parsed?.actorAccessToken ||
      !parsed?.actorRefreshToken ||
      !parsed?.actorUserId ||
      !parsed?.targetUserId
    ) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function writeImpersonationStash(stash: ImpersonationStash): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stash))
  notifyImpersonationChange()
}

export function clearImpersonationStash(): void {
  sessionStorage.removeItem(STORAGE_KEY)
  notifyImpersonationChange()
}

export function isImpersonating(): boolean {
  return readImpersonationStash() !== null
}
