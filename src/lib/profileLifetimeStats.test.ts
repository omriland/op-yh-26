import { describe, expect, it } from 'vitest'
import { formatLifetimeStatsUpdatedAt } from './profileLifetimeStats'

describe('formatLifetimeStatsUpdatedAt', () => {
  it('returns null when never refreshed', () => {
    expect(formatLifetimeStatsUpdatedAt(null, new Date('2026-08-16T10:00:00.000Z'))).toBeNull()
  })

  it('uses היום for the same Jerusalem calendar day', () => {
    // 07:00 IDT = 04:00 UTC; now is 13:00 IDT
    expect(
      formatLifetimeStatsUpdatedAt(
        '2026-08-16T04:00:00.000Z',
        new Date('2026-08-16T10:00:00.000Z'),
      ),
    ).toBe('עודכן היום ב־07:00')
  })

  it('uses אתמול for the previous Jerusalem calendar day', () => {
    // 19:00 IDT 15 Aug = 16:00 UTC
    expect(
      formatLifetimeStatsUpdatedAt(
        '2026-08-15T16:00:00.000Z',
        new Date('2026-08-16T10:00:00.000Z'),
      ),
    ).toBe('עודכן אתמול ב־19:00')
  })

  it('uses אתמול when now has crossed Jerusalem midnight but UTC has not', () => {
    // now 00:30 IDT 17 Aug = 21:30 UTC 16 Aug
    // updated 19:00 IDT 16 Aug = 16:00 UTC 16 Aug
    expect(
      formatLifetimeStatsUpdatedAt(
        '2026-08-16T16:00:00.000Z',
        new Date('2026-08-16T21:30:00.000Z'),
      ),
    ).toBe('עודכן אתמול ב־19:00')
  })

  it('uses an absolute Jerusalem timestamp when older than yesterday', () => {
    expect(
      formatLifetimeStatsUpdatedAt(
        '2026-08-14T16:00:00.000Z',
        new Date('2026-08-16T10:00:00.000Z'),
      ),
    ).toBe('עודכן ב־14.08.2026, 19:00')
  })
})
