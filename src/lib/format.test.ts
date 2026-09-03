import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyTimeKeystroke,
  digitsOnly,
  formatDateWithWeekday,
  formatLastLogin,
  formatPlate,
  formatTimeInput,
  hebrewWeekdayLetter,
  isCompleteTimeInput,
  isValidOptionalPhone,
  plateNumberForSave,
} from './format'

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

describe('isValidOptionalPhone', () => {
  it('accepts empty and a full 10-digit number', () => {
    expect(isValidOptionalPhone('')).toBe(true)
    expect(isValidOptionalPhone('   ')).toBe(true)
    expect(isValidOptionalPhone('050-1234567')).toBe(true)
  })

  it('rejects a partial number', () => {
    expect(isValidOptionalPhone('050-123')).toBe(false)
    expect(isValidOptionalPhone('050')).toBe(false)
  })
})

describe('digitsOnly', () => {
  it('keeps digits and strips letters, signs, and decimals', () => {
    expect(digitsOnly('12a3.5')).toBe('1235')
    expect(digitsOnly('-10 +2')).toBe('102')
    expect(digitsOnly('')).toBe('')
  })
})

describe('formatPlate', () => {
  it('formats 7 digits as XX-XXX-XX', () => {
    expect(formatPlate('1234567')).toBe('12-345-67')
  })

  it('formats 8 digits as XXX-XX-XXX', () => {
    expect(formatPlate('12345678')).toBe('123-45-678')
  })

  it('ignores dashes the typist already placed, including in the wrong spots', () => {
    expect(formatPlate('12-34-567')).toBe('12-345-67')
    expect(formatPlate('123-456-78')).toBe('123-45-678')
    expect(formatPlate('1-2-3-4-5-6-7')).toBe('12-345-67')
  })

  it('leaves incomplete values as typed', () => {
    expect(formatPlate('76543')).toBe('76543')
    expect(formatPlate('12-34')).toBe('12-34')
  })
})

describe('plateNumberForSave', () => {
  it('stores the hyphenated form and treats blank as empty', () => {
    expect(plateNumberForSave('1234567')).toBe('12-345-67')
    expect(plateNumberForSave('  123-45-678  ')).toBe('123-45-678')
    expect(plateNumberForSave('   ')).toBeNull()
    expect(plateNumberForSave(null)).toBeNull()
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

describe('formatTimeInput / applyTimeKeystroke', () => {
  it('inserts a colon after the hour and stays 24-hour', () => {
    expect(formatTimeInput('1')).toBe('1')
    expect(formatTimeInput('14')).toBe('14')
    expect(formatTimeInput('143')).toBe('14:3')
    expect(formatTimeInput('1430')).toBe('14:30')
    expect(formatTimeInput('2359')).toBe('23:59')
  })

  it('does not invent AM/PM and leaves out-of-range digits for blur validation', () => {
    expect(formatTimeInput('2460')).toBe('24:60')
    expect(applyTimeKeystroke('', '14:30 PM')).toBe('14:30')
  })

  it('deletes a digit when backspacing over the colon', () => {
    expect(applyTimeKeystroke('14:30', '14:3')).toBe('14:3')
    expect(applyTimeKeystroke('14:', '14')).toBe('1')
    expect(applyTimeKeystroke('14', '1')).toBe('1')
  })
})

describe('isCompleteTimeInput', () => {
  it('accepts only full HH:mm in the 24-hour range', () => {
    expect(isCompleteTimeInput('00:00')).toBe(true)
    expect(isCompleteTimeInput('14:30')).toBe(true)
    expect(isCompleteTimeInput('23:59')).toBe(true)
    expect(isCompleteTimeInput('14')).toBe(false)
    expect(isCompleteTimeInput('14:3')).toBe(false)
    expect(isCompleteTimeInput('24:00')).toBe(false)
    expect(isCompleteTimeInput('12:60')).toBe(false)
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
    hourCycle: 'h23',
  })
    .format(date)
    .replace(/\//g, '.')
}
