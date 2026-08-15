import { describe, expect, it } from 'vitest'
import {
  highestRole,
  highestRoleLabel,
  impliedAssignableRoles,
  isAssignableRoleLocked,
  toggleAssignableRole,
} from './appRoles'

describe('highestRole', () => {
  it('returns super_admin over admin and below', () => {
    expect(highestRole(['responder', 'admin', 'super_admin'])).toBe('super_admin')
  })

  it('returns admin over shift_lead and responder', () => {
    expect(highestRole(['responder', 'shift_lead', 'admin'])).toBe('admin')
  })

  it('returns shift_lead over responder', () => {
    expect(highestRole(['responder', 'shift_lead'])).toBe('shift_lead')
  })

  it('returns responder when that is the only role', () => {
    expect(highestRole(['responder'])).toBe('responder')
  })

  it('returns null when there are no roles', () => {
    expect(highestRole([])).toBeNull()
  })
})

describe('highestRoleLabel', () => {
  it('labels super_admin as מנהל־על', () => {
    expect(highestRoleLabel(['admin', 'super_admin'])).toBe('מנהל־על')
  })

  it('labels the highest assignable role', () => {
    expect(highestRoleLabel(['responder', 'shift_lead'])).toBe('אחמ״ש')
    expect(highestRoleLabel(['admin'])).toBe('מנהל')
    expect(highestRoleLabel(['responder'])).toBe('כונן')
  })
})

describe('impliedAssignableRoles', () => {
  it('includes every role below the selected one', () => {
    expect(impliedAssignableRoles('admin')).toEqual(['admin', 'shift_lead', 'responder'])
    expect(impliedAssignableRoles('shift_lead')).toEqual(['shift_lead', 'responder'])
    expect(impliedAssignableRoles('responder')).toEqual(['responder'])
  })
})

describe('isAssignableRoleLocked', () => {
  it('locks lower roles when a higher one is selected', () => {
    expect(isAssignableRoleLocked(['admin'], 'shift_lead')).toBe(true)
    expect(isAssignableRoleLocked(['admin'], 'responder')).toBe(true)
    expect(isAssignableRoleLocked(['shift_lead', 'responder'], 'responder')).toBe(true)
  })

  it('does not lock the highest selected assignable role', () => {
    expect(isAssignableRoleLocked(['admin', 'shift_lead', 'responder'], 'admin')).toBe(false)
    expect(isAssignableRoleLocked(['shift_lead', 'responder'], 'shift_lead')).toBe(false)
    expect(isAssignableRoleLocked(['responder'], 'responder')).toBe(false)
  })
})

describe('toggleAssignableRole', () => {
  it('checking אחמ״ש also checks כונן', () => {
    expect(toggleAssignableRole(['responder'], 'shift_lead', true)).toEqual([
      'shift_lead',
      'responder',
    ])
  })

  it('checking מנהל also checks אחמ״ש and כונן', () => {
    expect(toggleAssignableRole(['responder'], 'admin', true)).toEqual([
      'admin',
      'shift_lead',
      'responder',
    ])
  })

  it('unchecking מנהל keeps the lower roles', () => {
    expect(
      toggleAssignableRole(['admin', 'shift_lead', 'responder'], 'admin', false),
    ).toEqual(['shift_lead', 'responder'])
  })

  it('unchecking אחמ״ש keeps כונן', () => {
    expect(toggleAssignableRole(['shift_lead', 'responder'], 'shift_lead', false)).toEqual([
      'responder',
    ])
  })
})
