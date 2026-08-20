/** Short-lived HMAC token so the Android WebView can open /privacy without a second login. */

export const PRIVACY_PATH = '/privacy'
export const PRIVACY_TOKEN_TTL_SEC = 15 * 60
export const PRIVACY_TOKEN_PURPOSE = 'privacy-v1'
const CLOCK_SKEW_SEC = 60

export function isPrivacyPath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '') || '/'
  return path === PRIVACY_PATH
}

export function parsePrivacyTokenFromSearch(search: string): string | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const token = params.get('t')?.trim()
  return token || null
}

export function buildPrivacyPolicyUrl(origin: string, token: string): string {
  const url = new URL(PRIVACY_PATH, origin.endsWith('/') ? origin : `${origin}/`)
  url.searchParams.set('t', token)
  return url.toString()
}

export async function createPrivacyPageToken(
  secret: string,
  nowSec: number,
  ttlSec: number = PRIVACY_TOKEN_TTL_SEC,
): Promise<string> {
  const exp = nowSec + ttlSec
  const sig = await hmacSha256Hex(secret, `${PRIVACY_TOKEN_PURPOSE}.${exp}`)
  return `${exp}.${sig}`
}

export async function verifyPrivacyPageToken(
  secret: string,
  token: string,
  nowSec: number,
  ttlSec: number = PRIVACY_TOKEN_TTL_SEC,
): Promise<boolean> {
  const parsed = parsePrivacyToken(token)
  if (!parsed) return false
  const { exp, sig } = parsed
  if (nowSec > exp + CLOCK_SKEW_SEC) return false
  if (exp > nowSec + ttlSec + CLOCK_SKEW_SEC) return false
  const expected = await hmacSha256Hex(secret, `${PRIVACY_TOKEN_PURPOSE}.${exp}`)
  return timingSafeEqualHex(sig, expected)
}

function parsePrivacyToken(token: string): { exp: number; sig: string } | null {
  const trimmed = token.trim()
  const dot = trimmed.indexOf('.')
  if (dot <= 0 || dot === trimmed.length - 1) return null
  const expRaw = trimmed.slice(0, dot)
  const sig = trimmed.slice(dot + 1).toLowerCase()
  if (!/^\d{10,12}$/.test(expRaw)) return null
  if (!/^[0-9a-f]{64}$/.test(sig)) return null
  const exp = Number(expRaw)
  if (!Number.isSafeInteger(exp)) return null
  return { exp, sig }
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function timingSafeEqualHex(left: string, right: string): boolean {
  if (left.length !== right.length) return false
  let diff = 0
  for (let i = 0; i < left.length; i += 1) {
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i)
  }
  return diff === 0
}
