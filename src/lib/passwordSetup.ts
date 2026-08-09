/** Session flag: invite/recovery URL was opened and password must be chosen. */
const STORAGE_KEY = 'yahpaz:password-setup'

export type PasswordSetupReason = 'invite' | 'recovery'

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

  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const queryParams = new URLSearchParams(window.location.search)
  const type = hashParams.get('type') ?? queryParams.get('type')
  const hasAuthPayload =
    hashParams.has('access_token') ||
    hashParams.has('refresh_token') ||
    hashParams.has('code') ||
    queryParams.has('code')

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

export function markPasswordSetupRequired(reason: PasswordSetupReason): void {
  sessionStorage.setItem(STORAGE_KEY, reason)
}

export function clearPasswordSetupIntent(): void {
  sessionStorage.removeItem(STORAGE_KEY)
}

/** Drop invite/reset query markers so refresh cannot reopen the gate. */
export function stripPasswordSetupFromUrl(): void {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  if (!url.searchParams.has('set_password') && !url.searchParams.has('type')) return
  url.searchParams.delete('set_password')
  url.searchParams.delete('type')
  const next = `${url.pathname}${url.search}${url.hash}`
  window.history.replaceState(window.history.state, '', next || '/')
}

export function getPasswordSetupReason(): PasswordSetupReason | null {
  const value = sessionStorage.getItem(STORAGE_KEY)
  if (value === 'invite' || value === 'recovery') return value
  return null
}
