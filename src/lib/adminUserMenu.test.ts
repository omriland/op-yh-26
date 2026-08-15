import { describe, expect, it } from 'vitest'
import {
  SUPER_ADMIN_CAPTION,
  SUPER_ADMIN_LOCK_ERROR,
  canMutateAdminUser,
  canToggleUsersPageOtp,
  hasSuperAdminRole,
  shouldShowAdminUserOverflow,
} from './adminUserMenu'

describe('canToggleUsersPageOtp', () => {
  it('is true only when the user has the admin role', () => {
    expect(canToggleUsersPageOtp(['admin'])).toBe(true)
    expect(canToggleUsersPageOtp(['admin', 'responder'])).toBe(true)
    expect(canToggleUsersPageOtp(['responder'])).toBe(false)
    expect(canToggleUsersPageOtp(['shift_lead'])).toBe(false)
    expect(canToggleUsersPageOtp(['shift_lead', 'responder'])).toBe(false)
    expect(canToggleUsersPageOtp([])).toBe(false)
  })
})

describe('hasSuperAdminRole', () => {
  it('is true only when super_admin is present', () => {
    expect(hasSuperAdminRole(['admin', 'super_admin'])).toBe(true)
    expect(hasSuperAdminRole(['admin'])).toBe(false)
    expect(hasSuperAdminRole([])).toBe(false)
  })
})

describe('canMutateAdminUser', () => {
  it('lets a Super Admin mutate any row including another Super Admin', () => {
    expect(canMutateAdminUser(true, ['admin', 'super_admin'])).toBe(true)
    expect(canMutateAdminUser(true, ['responder'])).toBe(true)
  })

  it('blocks a regular admin from mutating a Super Admin', () => {
    expect(canMutateAdminUser(false, ['admin', 'super_admin'])).toBe(false)
  })

  it('lets a regular admin mutate a non–Super Admin', () => {
    expect(canMutateAdminUser(false, ['admin', 'shift_lead'])).toBe(true)
    expect(canMutateAdminUser(false, ['responder'])).toBe(true)
  })
})

describe('shouldShowAdminUserOverflow', () => {
  it('hides the menu when a regular admin views a locked Super Admin', () => {
    expect(
      shouldShowAdminUserOverflow({
        canMutate: false,
        hasSetPassword: false,
        hasImpersonate: false,
      }),
    ).toBe(false)
  })

  it('shows the menu when Super Admin actions remain', () => {
    expect(
      shouldShowAdminUserOverflow({
        canMutate: false,
        hasSetPassword: true,
        hasImpersonate: false,
      }),
    ).toBe(true)
  })

  it('shows the menu when the row can be mutated', () => {
    expect(
      shouldShowAdminUserOverflow({
        canMutate: true,
        hasSetPassword: false,
        hasImpersonate: false,
      }),
    ).toBe(true)
  })
})

describe('super admin copy', () => {
  it('uses the muted caption and lock error from the spec', () => {
    expect(SUPER_ADMIN_CAPTION).toBe('מנהל־על')
    expect(SUPER_ADMIN_LOCK_ERROR).toBe('לא ניתן לערוך מנהל־על.')
  })
})
