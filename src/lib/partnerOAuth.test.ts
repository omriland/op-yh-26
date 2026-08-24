import { describe, expect, it } from 'vitest'
import {
  OAUTH_AUTHORIZE_PATH,
  PARTNER_SCOPE,
  ACCESS_TOKEN_TTL_SEC,
  AUTHORIZATION_CODE_TTL_MS,
  grantIsUsable,
  isOAuthAuthorizePath,
  isOpenStandaloneParticipation,
  isTelegramBotUsername,
  isTelegramStartParam,
  liveGrantForBot,
  normalizeTelegramBotUsername,
  parseOAuthAuthorizeRequest,
  partnerAccessTokenLooksValid,
  randomOAuthState,
  redirectUriForBot,
  redirectUriMatchesClient,
  telegramStartRedirect,
} from './partnerOAuth'

describe('isOAuthAuthorizePath', () => {
  it('matches /oauth/authorize with optional trailing slash', () => {
    expect(isOAuthAuthorizePath('/oauth/authorize')).toBe(true)
    expect(isOAuthAuthorizePath('/oauth/authorize/')).toBe(true)
    expect(isOAuthAuthorizePath('/oauth/authorize/extra')).toBe(false)
    expect(isOAuthAuthorizePath('/privacy')).toBe(false)
    expect(OAUTH_AUTHORIZE_PATH).toBe('/oauth/authorize')
  })
})

describe('parseOAuthAuthorizeRequest', () => {
  it('reads client_id, redirect_uri, state, and default scope', () => {
    const parsed = parseOAuthAuthorizeRequest({
      pathname: '/oauth/authorize',
      search:
        '?client_id=ypb_abc&redirect_uri=https%3A%2F%2Ft.me%2FYahpazBot&state=csrf-1&scope=responder%3Afill',
    })
    expect(parsed).toEqual({
      ok: true,
      request: {
        clientId: 'ypb_abc',
        redirectUri: 'https://t.me/YahpazBot',
        state: 'csrf-1',
        scope: PARTNER_SCOPE,
      },
    })
  })

  it('rejects missing fields, wrong path, and wrong scope', () => {
    expect(
      parseOAuthAuthorizeRequest({ pathname: '/', search: '?client_id=x' }).ok,
    ).toBe(false)
    expect(
      parseOAuthAuthorizeRequest({
        pathname: '/oauth/authorize',
        search: '?client_id=x&redirect_uri=https://t.me/Bot',
      }).ok,
    ).toBe(false)
    expect(
      parseOAuthAuthorizeRequest({
        pathname: '/oauth/authorize',
        search: '?client_id=x&redirect_uri=https://t.me/Bot&state=s&scope=admin',
      }).ok,
    ).toBe(false)
  })
})

describe('Telegram bot username and redirect', () => {
  it('accepts Telegram usernames without @', () => {
    expect(isTelegramBotUsername('YahpazFillBot')).toBe(true)
    expect(isTelegramBotUsername('ab')).toBe(false)
    expect(isTelegramBotUsername('@YahpazFillBot')).toBe(false)
    expect(normalizeTelegramBotUsername('@YahpazFillBot')).toBe('YahpazFillBot')
  })

  it('builds and matches https://t.me/<bot> only', () => {
    expect(redirectUriForBot('YahpazFillBot')).toBe('https://t.me/YahpazFillBot')
    expect(redirectUriMatchesClient('https://t.me/YahpazFillBot', 'yahpazfillbot')).toBe(
      true,
    )
    expect(redirectUriMatchesClient('https://t.me/YahpazFillBot/', 'YahpazFillBot')).toBe(
      true,
    )
    expect(redirectUriMatchesClient('https://evil.example/callback', 'YahpazFillBot')).toBe(
      false,
    )
    expect(telegramStartRedirect('YahpazFillBot', 'yp_abc')).toBe(
      'https://t.me/YahpazFillBot?start=yp_abc',
    )
  })
})

describe('token shapes and grant expiry', () => {
  it('accepts yp_ start params in Telegram charset', () => {
    expect(isTelegramStartParam('yp_abcdefghijklmnopABCDEFG0123456')).toBe(true)
    expect(isTelegramStartParam('yp_short')).toBe(false)
    expect(isTelegramStartParam('not-ours')).toBe(false)
    expect(AUTHORIZATION_CODE_TTL_MS).toBe(5 * 60 * 1000)
  })

  it('accepts ypat_ access tokens', () => {
    expect(partnerAccessTokenLooksValid('ypat_abcdefghijklmnopqrstuvwx')).toBe(true)
    expect(partnerAccessTokenLooksValid('secret')).toBe(false)
    expect(ACCESS_TOKEN_TTL_SEC).toBe(60 * 24 * 60 * 60)
  })

  it('treats revoked or expired grants as unusable', () => {
    const now = new Date('2026-08-24T10:00:00.000Z')
    expect(
      grantIsUsable(
        { expiresAt: '2026-08-31T10:00:00.000Z', revokedAt: null },
        now,
      ),
    ).toBe(true)
    expect(
      grantIsUsable(
        { expiresAt: '2026-08-24T09:00:00.000Z', revokedAt: null },
        now,
      ),
    ).toBe(false)
    expect(
      grantIsUsable(
        { expiresAt: '2026-08-31T10:00:00.000Z', revokedAt: '2026-08-24T09:59:00.000Z' },
        now,
      ),
    ).toBe(false)
  })

  it('finds a live grant for a bot username', () => {
    const now = new Date('2026-08-24T10:00:00.000Z')
    const grants = [
      { telegram_bot_username: 'YahpazFillBot', expires_at: '2026-08-31T10:00:00.000Z' },
      { telegram_bot_username: 'OtherBot', expires_at: '2026-08-24T09:00:00.000Z' },
    ]
    expect(liveGrantForBot(grants, 'yahpazfillbot', now)?.telegram_bot_username).toBe(
      'YahpazFillBot',
    )
    expect(liveGrantForBot(grants, 'OtherBot', now)).toBeNull()
  })

  it('returns a non-empty oauth state', () => {
    expect(randomOAuthState().length).toBeGreaterThan(8)
  })
})

describe('isOpenStandaloneParticipation', () => {
  it('keeps open manual events and drops shift-born, cancelled, and done', () => {
    expect(
      isOpenStandaloneParticipation({
        origin: 'manual',
        isCancelled: false,
        participationStatus: 'pending',
      }),
    ).toBe(true)
    expect(
      isOpenStandaloneParticipation({
        origin: 'manual',
        isCancelled: false,
        participationStatus: 'in_progress',
      }),
    ).toBe(true)
    expect(
      isOpenStandaloneParticipation({
        origin: 'shift',
        isCancelled: false,
        participationStatus: 'pending',
      }),
    ).toBe(false)
    expect(
      isOpenStandaloneParticipation({
        origin: 'manual',
        isCancelled: true,
        participationStatus: 'pending',
      }),
    ).toBe(false)
    expect(
      isOpenStandaloneParticipation({
        origin: 'manual',
        isCancelled: false,
        participationStatus: 'done',
      }),
    ).toBe(false)
  })
})
