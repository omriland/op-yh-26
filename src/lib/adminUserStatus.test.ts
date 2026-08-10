import { describe, expect, it } from 'vitest'
import { compareAdminUsers, isInvitePending } from './adminUserStatus'

describe('isInvitePending', () => {
  it('is true for active invite_pending users', () => {
    expect(isInvitePending({ active: true, invite_pending: true })).toBe(true)
  })

  it('is false once registration completed', () => {
    expect(isInvitePending({ active: true, invite_pending: false })).toBe(false)
  })

  it('is false for inactive users even if invite_pending', () => {
    expect(isInvitePending({ active: false, invite_pending: true })).toBe(false)
  })
})

describe('compareAdminUsers', () => {
  it('orders pending, then active, then inactive', () => {
    const rows = [
      { active: false, invite_pending: false, full_name: 'דני' },
      { active: true, invite_pending: false, full_name: 'בני' },
      { active: true, invite_pending: true, full_name: 'אלי' },
      { active: true, invite_pending: true, full_name: 'אבי' },
    ]
    const sorted = [...rows].sort(compareAdminUsers)
    expect(sorted.map((row) => row.full_name)).toEqual(['אבי', 'אלי', 'בני', 'דני'])
  })
})
