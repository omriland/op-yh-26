export const DISMISSED_VERSION_KEY = 'yahpaz:dismissed_app_version'
export const UPDATE_POLL_MS = 5 * 60 * 1000
/** Fake remote id used by the localhost `?update_notice=1` preview. */
export const PREVIEW_UPDATE_VERSION_ID = 'dev-preview'

export function shouldForceUpdatePreview(search: string, isDev: boolean): boolean {
  if (!isDev) return false
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  return params.get('update_notice') === '1'
}

export function shouldShowUpdateNotice(
  currentId: string,
  remoteId: string | null,
  dismissedId: string | null,
): boolean {
  if (!currentId || !remoteId) return false
  if (remoteId === currentId) return false
  if (dismissedId === remoteId) return false
  return true
}

export function parseVersionPayload(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const id = (data as { id?: unknown }).id
  if (typeof id !== 'string') return null
  const trimmed = id.trim()
  return trimmed || null
}

export function readDismissedVersion(): string | null {
  try {
    const raw = sessionStorage.getItem(DISMISSED_VERSION_KEY)?.trim()
    return raw || null
  } catch {
    return null
  }
}

export function writeDismissedVersion(id: string): void {
  try {
    sessionStorage.setItem(DISMISSED_VERSION_KEY, id)
  } catch {
    // Private mode / quota — notice may reappear; still usable.
  }
}

export function currentAppVersion(raw = import.meta.env.VITE_APP_VERSION): string {
  return typeof raw === 'string' ? raw : ''
}

export async function fetchRemoteVersionId(
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  try {
    const res = await fetchImpl(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return null
    return parseVersionPayload(await res.json())
  } catch {
    return null
  }
}
