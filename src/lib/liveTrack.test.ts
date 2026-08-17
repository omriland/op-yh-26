import { describe, expect, it } from 'vitest'
import {
  LIVE_PING_MIN_INTERVAL_MS,
  LIVE_PING_MIN_MOVE_M,
  buildTrackSms,
  canStartTracking,
  isLiveTrackSmsAllowed,
  liveEventLine,
  livePinLabel,
  livePinTooltip,
  parseLiveTrackSmsAllowlist,
  parseTrackTokenFromSearch,
  pingRefusal,
  planLivePinSync,
  planTrackingSync,
  shouldEmitPing,
} from './liveTrack'

describe('parseTrackTokenFromSearch', () => {
  it('reads track_token from search', () => {
    expect(parseTrackTokenFromSearch('?track_token=abc123')).toBe('abc123')
    expect(parseTrackTokenFromSearch('track_token=xyz')).toBe('xyz')
    expect(parseTrackTokenFromSearch('?fill_token=nope')).toBeNull()
    expect(parseTrackTokenFromSearch('')).toBeNull()
  })
})

describe('buildTrackSms', () => {
  it('uses the locked two-line copy with the track URL', () => {
    const url = 'https://yahpz.com/?track_token=tok'
    expect(buildTrackSms(url)).toBe(
      [
        'שובצת לאירוע ביחפצ - לשיתוף מיקום בזמן אמת לחץ על הלינק: https://yahpz.com/?track_token=tok',
        'השאירו את הדף פתוח עד סיום האירוע.',
      ].join('\n'),
    )
  })
})

describe('planTrackingSync', () => {
  it('starts newly attached assignments with no end time', () => {
    expect(
      planTrackingSync({
        previous: [],
        next: [{ id: 'a1', endedAt: null }],
      }),
    ).toEqual({ startIds: ['a1'], stopIds: [] })
  })

  it('does not start an assignment that already has an end time', () => {
    expect(
      planTrackingSync({
        previous: [],
        next: [{ id: 'a1', endedAt: '2026-08-17T10:00:00' }],
      }),
    ).toEqual({ startIds: [], stopIds: [] })
  })

  it('does not re-start an existing open assignment', () => {
    expect(
      planTrackingSync({
        previous: [{ id: 'a1', endedAt: null }],
        next: [{ id: 'a1', endedAt: null }],
      }),
    ).toEqual({ startIds: [], stopIds: [] })
  })

  it('stops when the lead sets an end time', () => {
    expect(
      planTrackingSync({
        previous: [{ id: 'a1', endedAt: null }],
        next: [{ id: 'a1', endedAt: '2026-08-17T10:00:00' }],
      }),
    ).toEqual({ startIds: [], stopIds: ['a1'] })
  })

  it('stops removed assignments', () => {
    expect(
      planTrackingSync({
        previous: [{ id: 'a1', endedAt: null }],
        next: [],
      }),
    ).toEqual({ startIds: [], stopIds: ['a1'] })
  })
})

describe('pingRefusal', () => {
  const now = new Date('2026-08-17T12:00:00.000Z')

  it('rejects a missing assignment or bad hash', () => {
    expect(
      pingRefusal({
        hashMatches: false,
        expiresAt: '2026-08-20T00:00:00.000Z',
        now,
        assignmentExists: true,
        endedAt: null,
      }),
    ).toBe('invalid')
    expect(
      pingRefusal({
        hashMatches: true,
        expiresAt: '2026-08-20T00:00:00.000Z',
        now,
        assignmentExists: false,
        endedAt: null,
      }),
    ).toBe('invalid')
  })

  it('rejects an expired token', () => {
    expect(
      pingRefusal({
        hashMatches: true,
        expiresAt: '2026-08-17T11:00:00.000Z',
        now,
        assignmentExists: true,
        endedAt: null,
      }),
    ).toBe('expired')
  })

  it('rejects after ended_at', () => {
    expect(
      pingRefusal({
        hashMatches: true,
        expiresAt: '2026-08-20T00:00:00.000Z',
        now,
        assignmentExists: true,
        endedAt: '2026-08-17T10:00:00',
      }),
    ).toBe('ended')
  })

  it('allows a live valid token', () => {
    expect(
      pingRefusal({
        hashMatches: true,
        expiresAt: '2026-08-20T00:00:00.000Z',
        now,
        assignmentExists: true,
        endedAt: null,
      }),
    ).toBeNull()
  })
})

describe('shouldEmitPing', () => {
  const origin = { lat: 32.08, lng: 34.78 }

  it('emits the first fix', () => {
    expect(shouldEmitPing(null, { ...origin, atMs: 1_000 })).toBe(true)
  })

  it('waits less than 10s without enough movement', () => {
    expect(
      shouldEmitPing(
        { ...origin, atMs: 1_000 },
        { lat: 32.08001, lng: 34.78, atMs: 1_000 + LIVE_PING_MIN_INTERVAL_MS - 1 },
      ),
    ).toBe(false)
  })

  it('emits after 10s even if still', () => {
    expect(
      shouldEmitPing(
        { ...origin, atMs: 1_000 },
        { ...origin, atMs: 1_000 + LIVE_PING_MIN_INTERVAL_MS },
      ),
    ).toBe(true)
  })

  it('emits sooner when the fix moved at least 50m', () => {
    expect(LIVE_PING_MIN_MOVE_M).toBe(50)
    expect(
      shouldEmitPing(
        { ...origin, atMs: 1_000 },
        { lat: 32.0806, lng: 34.78, atMs: 1_500 },
      ),
    ).toBe(true)
  })
})

describe('live pin copy', () => {
  it('labels with callsign when present', () => {
    expect(livePinLabel({ callsign: '7', fullName: 'דנה כהן' })).toBe('7 · בדרך')
  })

  it('falls back to full name without a callsign', () => {
    expect(livePinLabel({ callsign: '  ', fullName: 'דנה כהן' })).toBe('דנה כהן · בדרך')
  })

  it('joins event one-liner with Jerusalem clock', () => {
    expect(
      livePinTooltip({
        eventLine: 'תאונה · 4 שורק',
        recordedAt: '2026-08-17T11:32:00.000Z',
      }),
    ).toBe('תאונה · 4 שורק · 14:32')
  })

  it('uses only the clock when the event line is empty', () => {
    expect(livePinTooltip({ eventLine: '  ', recordedAt: '2026-08-17T11:32:00.000Z' })).toBe(
      '14:32',
    )
  })

  it('joins type with road number and location', () => {
    expect(
      liveEventLine({ eventType: 'תאונה', road: 'כביש החוף (4)', location: 'שורק' }),
    ).toBe('תאונה · 4 שורק')
  })

  it('returns null when every field is empty', () => {
    expect(liveEventLine({ eventType: ' ', road: null, location: null })).toBeNull()
  })
})

describe('canStartTracking', () => {
  it('starts only for an open assignment with an IL mobile and no prior SMS', () => {
    expect(
      canStartTracking({ endedAt: null, trackingSmsSentAt: null, phone: '0501234567' }),
    ).toBe(true)
  })

  it('skips when ended, already sent, or the phone is not a mobile', () => {
    expect(
      canStartTracking({
        endedAt: '2026-08-17T10:00:00',
        trackingSmsSentAt: null,
        phone: '0501234567',
      }),
    ).toBe(false)
    expect(
      canStartTracking({
        endedAt: null,
        trackingSmsSentAt: '2026-08-17T09:00:00.000Z',
        phone: '0501234567',
      }),
    ).toBe(false)
    expect(
      canStartTracking({ endedAt: null, trackingSmsSentAt: null, phone: '0312345678' }),
    ).toBe(false)
  })
})

describe('live-track SMS allowlist', () => {
  it('defaults to callsign 336 when the env flag is unset', () => {
    const allowlist = parseLiveTrackSmsAllowlist(undefined)
    expect(isLiveTrackSmsAllowed('336', allowlist)).toBe(true)
    expect(isLiveTrackSmsAllowed('7', allowlist)).toBe(false)
    expect(isLiveTrackSmsAllowed(null, allowlist)).toBe(false)
  })

  it('sends to everyone when the flag is *', () => {
    const allowlist = parseLiveTrackSmsAllowlist('*')
    expect(isLiveTrackSmsAllowed('336', allowlist)).toBe(true)
    expect(isLiveTrackSmsAllowed('7', allowlist)).toBe(true)
  })

  it('accepts a comma-separated callsign list', () => {
    const allowlist = parseLiveTrackSmsAllowlist('336, 12')
    expect(isLiveTrackSmsAllowed('12', allowlist)).toBe(true)
    expect(isLiveTrackSmsAllowed('99', allowlist)).toBe(false)
  })
})

describe('planLivePinSync', () => {
  const pin = {
    assignmentId: 'a1',
    lat: 32.08,
    lng: 34.78,
    label: '336 · בדרך',
    tooltip: '14:32',
  }

  it('adds a new pin, updates an existing one, and removes a gone one', () => {
    expect(
      planLivePinSync(['a1', 'gone'], [
        { ...pin, lat: 32.09 },
        { ...pin, assignmentId: 'a2', label: '7 · בדרך' },
      ]),
    ).toEqual({
      add: [{ ...pin, assignmentId: 'a2', label: '7 · בדרך' }],
      update: [{ ...pin, lat: 32.09 }],
      remove: ['gone'],
    })
  })
})
