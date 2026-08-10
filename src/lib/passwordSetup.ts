/** Session flag: invite/recovery URL was opened and password must be chosen. */
const STORAGE_KEY = 'yahpaz:password-setup'
/** One-time OTP parked until the user explicitly continues (anti-prefetch). */
const TOKEN_STASH_KEY = 'yahpaz:pending-otp'

export type PasswordSetupReason = 'invite' | 'recovery'

export type AuthTokenFromUrl = {
  token_hash: string
  type: 'invite' | 'recovery' | 'signup' | 'magiclink' | 'email'
}

/**
 * Must run before createClient() processes the auth redirect hash.
 * Invite links sign the user in immediately; we persist intent so the UI
 * can require a password instead of dropping them into the app.
 *
 * Important: `?set_password=1` alone must NOT re-arm the gate on refresh after
 * the auth hash was consumed — only treat it with a fresh auth payload.
 */
export function capturePasswordSetupIntentFromUrl(): void {
  if (typeof window === 'undefined') return
  capturePasswordSetupIntent(
    window.location.hash.replace(/^#/, ''),
    window.location.search,
  )
}

/** Pure helper — used by capturePasswordSetupIntentFromUrl and unit tests. */
export function capturePasswordSetupIntent(hash: string, search: string): void {
  const hashParams = new URLSearchParams(hash.replace(/^#/, ''))
  const queryParams = new URLSearchParams(
    search.startsWith('?') ? search.slice(1) : search,
  )
  const type = hashParams.get('type') ?? queryParams.get('type')
  const hasAuthPayload =
    hashParams.has('access_token') ||
    hashParams.has('refresh_token') ||
    hashParams.has('code') ||
    queryParams.has('code') ||
    queryParams.has('token_hash')

  if (type === 'recovery') {
    sessionStorage.setItem(STORAGE_KEY, 'recovery')
    return
  }

  if (type === 'invite' || type === 'signup') {
    sessionStorage.setItem(STORAGE_KEY, 'invite')
    return
  }

  if (queryParams.get('set_password') === '1' && hasAuthPayload) {
    sessionStorage.setItem(STORAGE_KEY, 'invite')
  }
}

export function readAuthTokenFromUrl(): AuthTokenFromUrl | null {
  if (typeof window === 'undefined') return null
  return readAuthTokenFromSearch(window.location.search)
}

export function readAuthTokenFromSearch(search: string): AuthTokenFromUrl | null {
  const queryParams = new URLSearchParams(
    search.startsWith('?') ? search.slice(1) : search,
  )
  const token_hash = queryParams.get('token_hash')
  const type = queryParams.get('type')
  if (!token_hash || !type) return null
  if (
    type !== 'invite' &&
    type !== 'recovery' &&
    type !== 'signup' &&
    type !== 'magiclink' &&
    type !== 'email'
  ) {
    return null
  }
  return { token_hash, type }
}

export function markPasswordSetupRequired(reason: PasswordSetupReason): void {
  sessionStorage.setItem(STORAGE_KEY, reason)
}

export function clearPasswordSetupIntent(): void {
  sessionStorage.removeItem(STORAGE_KEY)
  clearStashedAuthToken()
}

export function stashAuthToken(token: AuthTokenFromUrl): void {
  sessionStorage.setItem(TOKEN_STASH_KEY, JSON.stringify(token))
}

export function readStashedAuthToken(): AuthTokenFromUrl | null {
  const raw = sessionStorage.getItem(TOKEN_STASH_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as AuthTokenFromUrl
    if (!parsed?.token_hash || !parsed?.type) return null
    return parsed
  } catch {
    return null
  }
}

export function clearStashedAuthToken(): void {
  sessionStorage.removeItem(TOKEN_STASH_KEY)
}

/** Drop invite/reset query markers so refresh cannot reopen the gate. */
export function stripPasswordSetupFromUrl(): void {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  if (
    !url.searchParams.has('set_password') &&
    !url.searchParams.has('type') &&
    !url.searchParams.has('token_hash')
  ) {
    return
  }
  url.searchParams.delete('set_password')
  url.searchParams.delete('type')
  url.searchParams.delete('token_hash')
  const next = `${url.pathname}${url.search}${url.hash}`
  window.history.replaceState(window.history.state, '', next || '/')
}

export function getPasswordSetupReason(): PasswordSetupReason | null {
  const value = sessionStorage.getItem(STORAGE_KEY)
  if (value === 'invite' || value === 'recovery') return value
  return null
}
