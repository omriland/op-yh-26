/** Partner OAuth + responder-api helpers (URL parse, Telegram redirect, grant rules). */

export const OAUTH_AUTHORIZE_PATH = '/oauth/authorize'
export const PARTNER_SCOPE = 'responder:fill'
export const AUTHORIZATION_CODE_TTL_MS = 5 * 60 * 1000
export const ACCESS_TOKEN_TTL_DAYS = 60
export const ACCESS_TOKEN_TTL_SEC = ACCESS_TOKEN_TTL_DAYS * 24 * 60 * 60
export const START_PARAM_PREFIX = 'yp_'
export const ACCESS_TOKEN_PREFIX = 'ypat_'

const TELEGRAM_USERNAME = /^[A-Za-z0-9_]{5,32}$/
const START_PARAM = /^yp_[A-Za-z0-9_-]{16,61}$/
const ACCESS_TOKEN = /^ypat_[A-Za-z0-9_-]{16,128}$/

export type OAuthAuthorizeRequest = {
  clientId: string
  /** When null, Edge derives https://t.me/<registered_bot>. */
  redirectUri: string | null
  state: string
  scope: string
}

export function isOAuthAuthorizePath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '') || '/'
  return path === OAUTH_AUTHORIZE_PATH
}

function searchParams(search: string): URLSearchParams {
  return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
}

/** Short MCP-style connect URL: client_id + state only. */
export function buildPartnerAuthorizeUrl(input: {
  clientId: string
  state: string
  origin?: string
}): string {
  const origin = (input.origin ?? 'https://yahpz.com').replace(/\/+$/, '')
  const url = new URL(`${origin}${OAUTH_AUTHORIZE_PATH}`)
  url.searchParams.set('client_id', input.clientId)
  url.searchParams.set('state', input.state)
  return url.toString()
}

export function parseOAuthAuthorizeRequest(input: {
  pathname: string
  search: string
}): { ok: true; request: OAuthAuthorizeRequest } | { ok: false; error: string } {
  if (!isOAuthAuthorizePath(input.pathname)) {
    return { ok: false, error: 'כתובת האישור אינה תקינה.' }
  }
  const params = searchParams(input.search)
  const clientId = params.get('client_id')?.trim() ?? ''
  const redirectRaw = params.get('redirect_uri')?.trim() ?? ''
  const state = params.get('state')?.trim() ?? ''
  const scope = params.get('scope')?.trim() || PARTNER_SCOPE
  if (!clientId || !state) {
    return { ok: false, error: 'חסרים פרטי היישום בקישור.' }
  }
  if (scope !== PARTNER_SCOPE) {
    return { ok: false, error: 'ההרשאה המבוקשת אינה נתמכת.' }
  }
  return {
    ok: true,
    request: {
      clientId,
      redirectUri: redirectRaw || null,
      state,
      scope,
    },
  }
}

export function normalizeTelegramBotUsername(raw: string): string {
  return raw.trim().replace(/^@/, '')
}

export function isTelegramBotUsername(raw: string): boolean {
  return TELEGRAM_USERNAME.test(raw.trim())
}

export function redirectUriForBot(botUsername: string): string {
  return `https://t.me/${normalizeTelegramBotUsername(botUsername)}`
}

export function redirectUriMatchesClient(redirectUri: string, botUsername: string): boolean {
  const expected = redirectUriForBot(botUsername).toLowerCase()
  try {
    const url = new URL(redirectUri.trim())
    if (url.protocol !== 'https:') return false
    if (url.hostname.toLowerCase() !== 't.me') return false
    const path = url.pathname.replace(/\/+$/, '')
    const expectedPath = new URL(expected).pathname.replace(/\/+$/, '')
    return path.toLowerCase() === expectedPath.toLowerCase() && !url.search && !url.hash
  } catch {
    return false
  }
}

export function telegramStartRedirect(botUsername: string, startParam: string): string {
  const url = new URL(redirectUriForBot(botUsername))
  url.searchParams.set('start', startParam)
  return url.toString()
}

export function isTelegramStartParam(value: string): boolean {
  return START_PARAM.test(value.trim())
}

export function partnerAccessTokenLooksValid(value: string): boolean {
  return ACCESS_TOKEN.test(value.trim())
}

export function grantIsUsable(
  grant: { expiresAt: string; revokedAt: string | null },
  now: Date = new Date(),
): boolean {
  if (grant.revokedAt) return false
  const expires = Date.parse(grant.expiresAt)
  if (Number.isNaN(expires)) return false
  return expires > now.getTime()
}

export function randomOAuthState(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `st_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`
}

export function liveGrantForBot<T extends { telegram_bot_username: string; expires_at: string }>(
  grants: T[],
  botUsername: string,
  now: Date = new Date(),
): T | null {
  const bot = normalizeTelegramBotUsername(botUsername).toLowerCase()
  return (
    grants.find(
      (grant) =>
        normalizeTelegramBotUsername(grant.telegram_bot_username).toLowerCase() === bot &&
        grantIsUsable({ expiresAt: grant.expires_at, revokedAt: null }, now),
    ) ?? null
  )
}

export function isOpenStandaloneParticipation(row: {
  origin: string
  isCancelled: boolean
  participationStatus: string
}): boolean {
  if (row.origin !== 'manual') return false
  if (row.isCancelled) return false
  return row.participationStatus === 'pending' || row.participationStatus === 'in_progress'
}
