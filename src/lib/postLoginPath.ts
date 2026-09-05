/** Safe post-login return path for /ios enrollment (sessionStorage). */

export const POST_LOGIN_PATH_KEY = 'yahpaz:post_login_path'

const ALLOWED = new Set(['/ios', '/ios/enrolled'])

function normalizeAllowedPath(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return null
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return null
  const path = trimmed.replace(/\/+$/, '') || '/'
  if (!ALLOWED.has(path)) return null
  return path
}

export function stashPostLoginPath(path: string): void {
  const safe = normalizeAllowedPath(path)
  if (!safe) return
  sessionStorage.setItem(POST_LOGIN_PATH_KEY, safe)
}

export function takePostLoginPath(): string | null {
  const raw = sessionStorage.getItem(POST_LOGIN_PATH_KEY)
  sessionStorage.removeItem(POST_LOGIN_PATH_KEY)
  if (!raw) return null
  return normalizeAllowedPath(raw)
}
