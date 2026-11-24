import { describe, expect, it } from 'vitest'
import {
  NEVER_SIGNED_IN_LABEL,
  isInactiveForDays,
  isValidInactiveDays,
  lastSeenAt,
  lastSeenLabel,
  type InactiveMemberRow,
} from './inactiveMembersReport'

const NOW = new Date('2026-11-24T12:00:00Z')

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString()
}

function member(overrides: Partial<InactiveMemberRow>): InactiveMemberRow {
  return {
    user_id: 'u1',
    full_name: 'דנה לוי',
    callsign: '12',
    phone: '0501234567',
    last_sign_in_at: null,
    last_active_at: null,
    ...overrides,
  }
}

describe('lastSeenLabel', () => {
  it('labels a member with no sign-in and no activity as never signed in', () => {
    expect(NEVER_SIGNED_IN_LABEL).toBe('מעולם לא התחבר')
    expect(lastSeenLabel(member({}))).toBe('מעולם לא התחבר')
  })

  it('shows a date once the member signed in', () => {
    const row = member({ last_sign_in_at: '2026-11-20T12:00:00Z' })
    expect(lastSeenLabel(row)).toBe('20.11.2026')
  })
})

describe('lastSeenAt', () => {
  it('takes the later of last sign-in and presence', () => {
    const result = lastSeenAt(
      member({ last_sign_in_at: daysAgo(30), last_active_at: daysAgo(5) }),
    )
    expect(result?.toISOString()).toBe(daysAgo(5))
  })

  it('takes sign-in when presence is older', () => {
    const result = lastSeenAt(
      member({ last_sign_in_at: daysAgo(2), last_active_at: daysAgo(40) }),
    )
    expect(result?.toISOString()).toBe(daysAgo(2))
  })

  it('uses the only value that exists', () => {
    expect(lastSeenAt(member({ last_active_at: daysAgo(9) }))?.toISOString()).toBe(daysAgo(9))
  })

  it('is null when both are missing', () => {
    expect(lastSeenAt(member({}))).toBeNull()
  })
})

describe('isInactiveForDays', () => {
  it('excludes a member seen N-1 days ago', () => {
    expect(isInactiveForDays(member({ last_sign_in_at: daysAgo(59) }), 60, NOW)).toBe(false)
  })

  it('includes a member seen N+1 days ago', () => {
    expect(isInactiveForDays(member({ last_sign_in_at: daysAgo(61) }), 60, NOW)).toBe(true)
  })

  it('includes a member who never signed in', () => {
    expect(isInactiveForDays(member({}), 60, NOW)).toBe(true)
  })

  it('uses recent presence even when sign-in is old', () => {
    const row = member({ last_sign_in_at: daysAgo(200), last_active_at: daysAgo(1) })
    expect(isInactiveForDays(row, 60, NOW)).toBe(false)
  })
})

describe('isValidInactiveDays', () => {
  it('accepts 1 and 365 and the default 60', () => {
    expect(isValidInactiveDays(1)).toBe(true)
    expect(isValidInactiveDays(60)).toBe(true)
    expect(isValidInactiveDays(365)).toBe(true)
  })

  it('rejects values under 1 or over 365', () => {
    expect(isValidInactiveDays(0)).toBe(false)
    expect(isValidInactiveDays(-5)).toBe(false)
    expect(isValidInactiveDays(366)).toBe(false)
  })

  it('rejects fractions and NaN', () => {
    expect(isValidInactiveDays(2.5)).toBe(false)
    expect(isValidInactiveDays(Number.NaN)).toBe(false)
  })
})
