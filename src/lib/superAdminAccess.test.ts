import { describe, expect, it } from 'vitest'
import { canAccessSuperAdminNav } from './superAdminAccess'

describe('canAccessSuperAdminNav', () => {
  it('is true only for super_admin in their own role', () => {
    expect(
      canAccessSuperAdminNav({
        roles: ['admin', 'shift_lead', 'super_admin'],
        impersonating: false,
        previewing: false,
      }),
    ).toBe(true)
  })

  it('hides from admin, אחמ״ש, and impersonation / role-preview', () => {
    expect(
      canAccessSuperAdminNav({
        roles: ['admin'],
        impersonating: false,
        previewing: false,
      }),
    ).toBe(false)
    expect(
      canAccessSuperAdminNav({
        roles: ['shift_lead'],
        impersonating: false,
        previewing: false,
      }),
    ).toBe(false)
    expect(
      canAccessSuperAdminNav({
        roles: ['admin', 'super_admin'],
        impersonating: true,
        previewing: false,
      }),
    ).toBe(false)
    expect(
      canAccessSuperAdminNav({
        roles: ['admin', 'super_admin'],
        impersonating: false,
        previewing: true,
      }),
    ).toBe(false)
  })
})
