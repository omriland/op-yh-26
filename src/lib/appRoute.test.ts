import { describe, expect, it, vi } from 'vitest'
import {
  appHistoryMethod,
  appPath,
  applyAppUrl,
  isAllowedAppView,
  parseAppPath,
  readBootRoute,
  shouldSyncAppUrl,
  type AppRouteState,
} from './appRoute'

const listState = (view: AppRouteState['view']): AppRouteState => ({
  view,
  eventSurface: { kind: 'list' },
  shiftSurface: { kind: 'list' },
})

describe('parseAppPath', () => {
  it('reads event list, detail, form, and fill', () => {
    expect(parseAppPath('/events')).toEqual({
      kind: 'app',
      state: listState('events'),
    })
    expect(parseAppPath('/mine/evt-2')).toEqual({
      kind: 'app',
      state: {
        view: 'mine',
        eventSurface: { kind: 'detail', eventId: 'evt-2' },
        shiftSurface: { kind: 'list' },
      },
    })
    expect(parseAppPath('/events/new')).toEqual({
      kind: 'app',
      state: {
        view: 'events',
        eventSurface: { kind: 'form' },
        shiftSurface: { kind: 'list' },
      },
    })
    expect(parseAppPath('/reports/evt-9/edit')).toEqual({
      kind: 'app',
      state: {
        view: 'reports',
        eventSurface: { kind: 'form', eventId: 'evt-9' },
        shiftSurface: { kind: 'list' },
      },
    })
    expect(parseAppPath('/mine/evt-2/fill')).toEqual({
      kind: 'app',
      state: {
        view: 'mine',
        eventSurface: { kind: 'fill', eventId: 'evt-2', returnTo: 'list' },
        shiftSurface: { kind: 'list' },
      },
    })
  })

  it('reads shift screens and event overlays', () => {
    expect(parseAppPath('/my-shifts/sh-1')).toEqual({
      kind: 'app',
      state: {
        view: 'my_shifts',
        eventSurface: { kind: 'list' },
        shiftSurface: { kind: 'detail', shiftId: 'sh-1' },
      },
    })
    expect(parseAppPath('/shifts/new')).toEqual({
      kind: 'app',
      state: {
        view: 'shifts',
        eventSurface: { kind: 'list' },
        shiftSurface: { kind: 'form' },
      },
    })
    expect(parseAppPath('/shifts/sh-1/event/evt-2')).toEqual({
      kind: 'app',
      state: {
        view: 'shifts',
        eventSurface: { kind: 'detail', eventId: 'evt-2' },
        shiftSurface: { kind: 'detail', shiftId: 'sh-1' },
      },
    })
    expect(parseAppPath('/my-shifts/event/evt-2/fill')).toEqual({
      kind: 'app',
      state: {
        view: 'my_shifts',
        eventSurface: { kind: 'fill', eventId: 'evt-2', returnTo: 'list' },
        shiftSurface: { kind: 'list' },
      },
    })
  })

  it('keeps reserved and unknown paths out of app views', () => {
    expect(parseAppPath('/')).toEqual({ kind: 'home' })
    expect(parseAppPath('/android')).toEqual({ kind: 'android' })
    expect(parseAppPath('/privacy')).toEqual({ kind: 'privacy' })
    expect(parseAppPath('/oauth/authorize')).toEqual({ kind: 'oauth' })
    expect(parseAppPath('/login')).toEqual({ kind: 'home' })
    expect(parseAppPath('/partner-api')).toEqual({ kind: 'home' })
    expect(parseAppPath('/cockpit/evt-9/edit')).toEqual({ kind: 'home' })
  })

  it('reads the SuperAdmin locations queue', () => {
    expect(parseAppPath('/event-locations')).toEqual({
      kind: 'app',
      state: listState('event_locations'),
    })
  })

  it('reads cockpit the same way as the existing helper', () => {
    expect(parseAppPath('/cockpit')).toEqual({
      kind: 'app',
      state: {
        view: 'cockpit',
        eventSurface: { kind: 'list' },
        shiftSurface: { kind: 'list' },
      },
    })
    expect(parseAppPath('/cockpit/evt-9')).toEqual({
      kind: 'app',
      state: {
        view: 'cockpit',
        eventSurface: { kind: 'list' },
        shiftSurface: { kind: 'list' },
        cockpitEventId: 'evt-9',
      },
    })
  })
})

describe('appPath', () => {
  it('round-trips the analytics-style event and shift URLs', () => {
    expect(appPath(listState('events'))).toBe('/events')
    expect(
      appPath({
        view: 'mine',
        eventSurface: { kind: 'fill', eventId: 'evt-2', returnTo: 'detail' },
        shiftSurface: { kind: 'list' },
      }),
    ).toBe('/mine/evt-2/fill')
    expect(
      appPath({
        view: 'events',
        eventSurface: { kind: 'form' },
        shiftSurface: { kind: 'list' },
      }),
    ).toBe('/events/new')
    expect(
      appPath({
        view: 'my_shifts',
        eventSurface: { kind: 'list' },
        shiftSurface: { kind: 'detail', shiftId: 'sh-1' },
      }),
    ).toBe('/my-shifts/sh-1')
    expect(
      appPath({
        view: 'shifts',
        eventSurface: { kind: 'detail', eventId: 'evt-2' },
        shiftSurface: { kind: 'detail', shiftId: 'sh-1' },
      }),
    ).toBe('/shifts/sh-1/event/evt-2')
    expect(appPath({ ...listState('cockpit'), cockpitEventId: 'evt-9' })).toBe('/cockpit/evt-9')
    expect(appPath(listState('event_locations'))).toBe('/event-locations')
    expect(appPath({ ...listState('profile'), legalPage: 'privacy' })).toBe('/privacy')
  })
})

describe('readBootRoute', () => {
  it('boots legal pages and app screens from the pathname', () => {
    expect(readBootRoute('/android').legalPage).toBe('android')
    expect(readBootRoute('/privacy').legalPage).toBe('privacy')
    expect(readBootRoute('/events/evt-1')).toEqual({
      view: 'events',
      eventSurface: { kind: 'detail', eventId: 'evt-1' },
      shiftSurface: { kind: 'list' },
      cockpitEventId: undefined,
      legalPage: null,
    })
    expect(readBootRoute('/').view).toBeNull()
  })
})

describe('appHistoryMethod', () => {
  it('pushes a deeper screen and replaces a shallower return in the same section', () => {
    expect(appHistoryMethod('/events', '/events/evt-1')).toBe('push')
    expect(appHistoryMethod('/events/evt-1', '/events/evt-1/edit')).toBe('push')
    expect(appHistoryMethod('/events/evt-1/edit', '/events/evt-1')).toBe('replace')
    expect(appHistoryMethod('/events/evt-1', '/events')).toBe('replace')
  })

  it('pushes a different section so Back can return', () => {
    expect(appHistoryMethod('/events/evt-1', '/shifts')).toBe('push')
    expect(appHistoryMethod('/events', '/profile')).toBe('push')
  })

  it('replaces new-form id assignment and cockpit event swaps', () => {
    expect(appHistoryMethod('/events/new', '/events/evt-1/edit')).toBe('replace')
    expect(appHistoryMethod('/shifts/new', '/shifts/sh-1/edit')).toBe('replace')
    expect(appHistoryMethod('/cockpit', '/cockpit/evt-9')).toBe('replace')
    expect(appHistoryMethod('/cockpit/evt-1', '/cockpit/evt-2')).toBe('replace')
  })

  it('adopts / only when asked, so Back can still leave the site', () => {
    expect(appHistoryMethod('/', '/events')).toBeNull()
    expect(appHistoryMethod('/', '/events', { adoptHome: true })).toBe('replace')
    expect(appHistoryMethod('/events', '/events')).toBeNull()
  })
})

describe('applyAppUrl', () => {
  it('pushes, replaces, or no-ops according to the history method', () => {
    const pushState = vi.fn()
    const replaceState = vi.fn()
    const history = { pushState, replaceState, state: { keep: true } }

    applyAppUrl(history, { href: 'https://yahpz.com/events', pathname: '/events' }, {
      view: 'events',
      eventSurface: { kind: 'detail', eventId: 'evt-1' },
      shiftSurface: { kind: 'list' },
    })
    expect(pushState).toHaveBeenCalledWith({ keep: true }, '', '/events/evt-1')
    expect(replaceState).not.toHaveBeenCalled()

    pushState.mockClear()
    applyAppUrl(history, { href: 'https://yahpz.com/events/evt-1/edit', pathname: '/events/evt-1/edit' }, {
      view: 'events',
      eventSurface: { kind: 'detail', eventId: 'evt-1' },
      shiftSurface: { kind: 'list' },
    })
    expect(replaceState).toHaveBeenCalledWith({ keep: true }, '', '/events/evt-1')

    replaceState.mockClear()
    applyAppUrl(history, { href: 'https://yahpz.com/events', pathname: '/events' }, listState('events'))
    expect(pushState).not.toHaveBeenCalled()
    expect(replaceState).not.toHaveBeenCalled()
  })

  it('keeps query and hash when rewriting the path', () => {
    const replaceState = vi.fn()
    applyAppUrl(
      { pushState: vi.fn(), replaceState, state: null },
      { href: 'https://yahpz.com/?fill_event=evt-1#y', pathname: '/' },
      {
        view: 'mine',
        eventSurface: { kind: 'fill', eventId: 'evt-1', returnTo: 'list' },
        shiftSurface: { kind: 'list' },
      },
      { adoptHome: true },
    )
    expect(replaceState).toHaveBeenCalledWith(null, '', '/mine/evt-1/fill?fill_event=evt-1#y')
  })
})

describe('isAllowedAppView', () => {
  const responder = { manages: false, hasMineList: true, isAdmin: false, isSuperAdmin: false }
  const lead = { manages: true, hasMineList: true, isAdmin: false, isSuperAdmin: false }

  it('gates unit and admin screens', () => {
    expect(isAllowedAppView('mine', responder)).toBe(true)
    expect(isAllowedAppView('events', responder)).toBe(false)
    expect(isAllowedAppView('events', lead)).toBe(true)
    expect(isAllowedAppView('users', lead)).toBe(false)
    expect(isAllowedAppView('profile', responder)).toBe(true)
  })

  it('gates SuperAdmin screens to super_admin only', () => {
    const admin = { manages: true, hasMineList: true, isAdmin: true, isSuperAdmin: false }
    const superAdmin = { manages: true, hasMineList: true, isAdmin: true, isSuperAdmin: true }
    expect(isAllowedAppView('feedback', admin)).toBe(false)
    expect(isAllowedAppView('event_locations', admin)).toBe(false)
    expect(isAllowedAppView('feedback', lead)).toBe(false)
    expect(isAllowedAppView('event_locations', lead)).toBe(false)
    expect(isAllowedAppView('feedback', superAdmin)).toBe(true)
    expect(isAllowedAppView('event_locations', superAdmin)).toBe(true)
  })
})

describe('shouldSyncAppUrl', () => {
  it('holds the URL for token, oauth, track, and password-setup routes', () => {
    const ok = {
      trackToken: false,
      oauthPath: false,
      passwordSetup: false,
      fillTokenOwnsUrl: false,
      privacyChecking: false,
    }
    expect(shouldSyncAppUrl(ok)).toBe(true)
    expect(shouldSyncAppUrl({ ...ok, trackToken: true })).toBe(false)
    expect(shouldSyncAppUrl({ ...ok, oauthPath: true })).toBe(false)
    expect(shouldSyncAppUrl({ ...ok, passwordSetup: true })).toBe(false)
    expect(shouldSyncAppUrl({ ...ok, fillTokenOwnsUrl: true })).toBe(false)
    expect(shouldSyncAppUrl({ ...ok, privacyChecking: true })).toBe(false)
  })
})
