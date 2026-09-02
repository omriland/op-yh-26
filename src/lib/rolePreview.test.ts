import { describe, expect, it } from 'vitest'
import {
  canStartRolePreview,
  effectiveRoles,
  parseRolePreviewRole,
  rolePreviewLabel,
} from './rolePreview'

describe('canStartRolePreview', () => {
  it('allows super_admin when not impersonating or already previewing', () => {
    expect(
      canStartRolePreview({
        actualRoles: ['admin', 'super_admin'],
        impersonating: false,
        previewing: false,
      }),
    ).toBe(true)
  })

  it('rejects regular admin, impersonation, and an active preview', () => {
    expect(
      canStartRolePreview({
        actualRoles: ['admin'],
        impersonating: false,
        previewing: false,
      }),
    ).toBe(false)
    expect(
      canStartRolePreview({
        actualRoles: ['admin', 'super_admin'],
        impersonating: true,
        previewing: false,
      }),
    ).toBe(false)
    expect(
      canStartRolePreview({
        actualRoles: ['admin', 'super_admin'],
        impersonating: false,
        previewing: true,
      }),
    ).toBe(false)
  })
})

describe('effectiveRoles', () => {
  it('returns the real roles when no preview is set', () => {
    expect(effectiveRoles(['admin', 'shift_lead', 'super_admin'], null)).toEqual([
      'admin',
      'shift_lead',
      'super_admin',
    ])
  })

  it('masks to the selected role only, even if the actor does not have it', () => {
    expect(effectiveRoles(['admin', 'super_admin'], 'responder')).toEqual(['responder'])
    expect(effectiveRoles(['admin', 'super_admin'], 'shift_lead')).toEqual(['shift_lead'])
    expect(effectiveRoles(['admin', 'super_admin'], 'admin')).toEqual(['admin'])
  })
})

describe('parseRolePreviewRole', () => {
  it('accepts assignable roles and rejects anything else', () => {
    expect(parseRolePreviewRole('responder')).toBe('responder')
    expect(parseRolePreviewRole('shift_lead')).toBe('shift_lead')
    expect(parseRolePreviewRole('admin')).toBe('admin')
    expect(parseRolePreviewRole('super_admin')).toBeNull()
    expect(parseRolePreviewRole('nope')).toBeNull()
    expect(parseRolePreviewRole(null)).toBeNull()
  })
})

describe('rolePreviewLabel', () => {
  it('uses the same Hebrew role names as the rest of the app', () => {
    expect(rolePreviewLabel('responder')).toBe('מתנדב')
    expect(rolePreviewLabel('shift_lead')).toBe('אחמ״ש')
    expect(rolePreviewLabel('admin')).toBe('מנהל')
  })
})
