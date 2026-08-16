import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { digitsOnly, formatDateWithWeekday, formatLastLogin, hebrewWeekdayLetter } from './format'

const NOW = new Date('2026-08-10T12:00:00')

describe('hebrewWeekdayLetter', () => {
  it('uses א׳–ו׳ and ש׳ for Saturday', () => {
    expect(hebrewWeekdayLetter('2026-08-16')).toBe("א'")
    expect(hebrewWeekdayLetter('2026-08-17')).toBe("ב'")
    expect(hebrewWeekdayLetter('2026-08-21')).toBe("ו'")
    expect(hebrewWeekdayLetter('2026-08-15')).toBe("ש'")
  })
})

describe('formatDateWithWeekday', () => {
  it('puts the weekday letter in brackets after the date', () => {
    expect(formatDateWithWeekday('2026-08-16')).toBe("16.08.2026 (א')")
  })
})

describe('digitsOnly', () => {
  it('keeps digits and strips letters, signs, and decimals', () => {
    expect(digitsOnly('12a3.5')).toBe('1235')
    expect(digitsOnly('-10 +2')).toBe('102')
    expect(digitsOnly('')).toBe('')
  })
})

describe('formatLastLogin', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns null for missing values', () => {
    expect(formatLastLogin(null)).toBeNull()
    expect(formatLastLogin(undefined)).toBeNull()
  })

  it('shows relative minutes within the last hour', () => {
    const twentyMinutesAgo = new Date(NOW.getTime() - 20 * 60_000).toISOString()
    expect(formatLastLogin(twentyMinutesAgo)).toBe('לפני 20 דקות')
  })

  it('shows relative hours within the last 24 hours', () => {
    const threeHoursAgo = new Date(NOW.getTime() - 3 * 3_600_000).toISOString()
    expect(formatLastLogin(threeHoursAgo)).toBe('לפני 3 שעות')
  })

  it('treats sub-minute logins as "now"', () => {
    const justNow = new Date(NOW.getTime() - 10_000).toISOString()
    expect(formatLastLogin(justNow)).toBe('עכשיו')
  })

  it('falls back to absolute date-time beyond 24 hours', () => {
    const twoDaysAgo = new Date('2026-08-08T09:30:00')
    expect(formatLastLogin(twoDaysAgo.toISOString())).toBe(
      formatAbsolute(twoDaysAgo),
    )
  })

  it('boundary: exactly 24 hours ago is absolute', () => {
    const exactly = new Date(NOW.getTime() - 24 * 3_600_000)
    expect(formatLastLogin(exactly.toISOString())).toBe(formatAbsolute(exactly))
  })
})

/** Mirrors formatDateTime output (DD.MM.YYYY, HH:mm) without importing internals. */
function formatAbsolute(date: Date): string {
  return new Intl.DateTimeFormat('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(date)
    .replace(/\//g, '.')
}
