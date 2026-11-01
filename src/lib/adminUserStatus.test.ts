import { describe, expect, it } from 'vitest'
import {
  compareAdminUsers,
  hasAvailability,
  isInvitePending,
  shouldClearInviteOnPasswordSignIn,
} from './adminUserStatus'

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

describe('shouldClearInviteOnPasswordSignIn', () => {
  it('clears the invited flag after a password sign-in', () => {
    const pending = { active: true, invite_pending: true }
    expect(shouldClearInviteOnPasswordSignIn(pending, null)).toBe(true)
    expect(isInvitePending({ ...pending, invite_pending: false })).toBe(false)
  })

  it('leaves someone who is already registered', () => {
    expect(shouldClearInviteOnPasswordSignIn({ invite_pending: false }, null)).toBe(false)
    expect(shouldClearInviteOnPasswordSignIn(null, null)).toBe(false)
  })

  it('does not clear while the invite password screen is still open', () => {
    expect(shouldClearInviteOnPasswordSignIn({ invite_pending: true }, 'invite')).toBe(false)
  })
})

describe('hasAvailability', () => {
  it('is false while registration is pending', () => {
    expect(hasAvailability({ active: true, invite_pending: true })).toBe(false)
  })

  it('is true for registered users, including inactive', () => {
    expect(hasAvailability({ active: true, invite_pending: false })).toBe(true)
    expect(hasAvailability({ active: false, invite_pending: false })).toBe(true)
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
