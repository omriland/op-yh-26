import { describe, expect, it } from 'vitest'
import { appAnalyticsPath } from './posthogAppPath'

describe('appAnalyticsPath', () => {
  it('skips loading and token-check states', () => {
    expect(appAnalyticsPath({ loading: true, signedIn: false, view: 'mine' })).toBeNull()
    expect(
      appAnalyticsPath({ signedIn: false, tokenFill: 'checking', view: 'mine' }),
    ).toBeNull()
  })

  it('maps legal pages including ios with loading guard', () => {
    expect(
      appAnalyticsPath({ signedIn: false, legalPage: 'ios', view: 'mine' }),
    ).toBe('/ios')
    expect(
      appAnalyticsPath({ loading: true, signedIn: false, legalPage: 'ios', view: 'mine' }),
    ).toBeNull()
  })

  it('maps signed-out and gate screens', () => {
    expect(appAnalyticsPath({ signedIn: false, view: 'mine' })).toBe('/login')
    expect(
      appAnalyticsPath({
        signedIn: false,
        tracking: true,
        view: 'mine',
      }),
    ).toBe('/track')
    expect(appAnalyticsPath({ signedIn: false, passwordSetup: true, view: 'mine' })).toBe(
      '/login/set-password',
    )
    expect(
      appAnalyticsPath({
        signedIn: false,
        tokenFill: 'ready',
        tokenEventId: 'evt-1',
        view: 'mine',
      }),
    ).toBe('/fill/evt-1')
    expect(appAnalyticsPath({ signedIn: true, otp: 'required', view: 'mine' })).toBe(
      '/login/otp',
    )
  })

  it('maps event and shift surfaces onto virtual paths', () => {
    expect(
      appAnalyticsPath({
        signedIn: true,
        otp: 'ok',
        view: 'events',
        eventKind: 'form',
      }),
    ).toBe('/events/new')
    expect(
      appAnalyticsPath({
        signedIn: true,
        otp: 'ok',
        view: 'mine',
        eventKind: 'fill',
        eventId: 'evt-2',
      }),
    ).toBe('/mine/evt-2/fill')
    expect(
      appAnalyticsPath({
        signedIn: true,
        otp: 'ok',
        view: 'my_shifts',
        shiftKind: 'detail',
        shiftId: 'sh-1',
      }),
    ).toBe('/my-shifts/sh-1')
    expect(appAnalyticsPath({ signedIn: true, otp: 'ok', view: 'contacts' })).toBe(
      '/contacts',
    )
    expect(appAnalyticsPath({ signedIn: true, otp: 'ok', view: 'feedback' })).toBe(
      '/feedback',
    )
    expect(appAnalyticsPath({ signedIn: true, otp: 'ok', view: 'event_locations' })).toBe(
      '/event-locations',
    )
    expect(appAnalyticsPath({ signedIn: true, otp: 'ok', view: 'event_audit' })).toBe(
      '/event-audit',
    )
    expect(
      appAnalyticsPath({
        signedIn: true,
        otp: 'ok',
        view: 'shifts',
        shiftKind: 'detail',
        shiftId: 'sh-1',
        eventKind: 'detail',
        eventId: 'evt-2',
      }),
    ).toBe('/shifts/sh-1/event/evt-2')
    expect(
      appAnalyticsPath({
        signedIn: true,
        otp: 'ok',
        oauthAuthorize: true,
        view: 'mine',
      }),
    ).toBe('/oauth/authorize')
  })
})
