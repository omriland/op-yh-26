import { describe, expect, it } from 'vitest'
import { compareAdminUsers, isInvitePending } from './adminUserStatus'

describe('isInvitePending', () => {
  it('is true for active unconfirmed users', () => {
    expect(isInvitePending({ active: true, email_confirmed_at: null })).toBe(true)
  })

  it('is false once email is confirmed', () => {
    expect(
      isInvitePending({ active: true, email_confirmed_at: '2026-08-10T10:00:00Z' }),
    ).toBe(false)
  })

  it('is false for inactive users even if unconfirmed', () => {
    expect(isInvitePending({ active: false, email_confirmed_at: null })).toBe(false)
  })
})

describe('compareAdminUsers', () => {
  it('orders pending, then active, then inactive', () => {
    const rows = [
      { active: false, email_confirmed_at: null, full_name: 'דני' },
      { active: true, email_confirmed_at: '2026-01-01T00:00:00Z', full_name: 'בני' },
      { active: true, email_confirmed_at: null, full_name: 'אלי' },
      { active: true, email_confirmed_at: null, full_name: 'אבי' },
    ]
    const sorted = [...rows].sort(compareAdminUsers)
    expect(sorted.map((row) => row.full_name)).toEqual(['אבי', 'אלי', 'בני', 'דני'])
  })
})
