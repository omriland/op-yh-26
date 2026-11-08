import { describe, expect, it } from 'vitest'
import type { SmartSearchFilter } from '../../../supabase/functions/_shared/smartSearchFilter'
import { canUseArchive, filterForRole, searchRoleFor } from './searchRole'

const base: SmartSearchFilter = { intent: 'find', entity: 'both', source: 'both' }

describe('searchRoleFor', () => {
  it('reads the highest search role', () => {
    expect(searchRoleFor(['responder', 'super_admin'])).toBe('admin')
    expect(searchRoleFor(['admin'])).toBe('admin')
    expect(searchRoleFor(['responder', 'shift_lead'])).toBe('lead')
    expect(searchRoleFor(['responder'])).toBe('responder')
    expect(searchRoleFor([])).toBe('responder')
  })
  it('opens the archive to admins only', () => {
    expect(canUseArchive('admin')).toBe(true)
    expect(canUseArchive('lead')).toBe(false)
    expect(canUseArchive('responder')).toBe(false)
  })
})

describe('filterForRole', () => {
  const full: SmartSearchFilter = {
    ...base,
    source: 'archive',
    damage_location: 'גג',
    person_callsigns: ['411'],
    volunteer_status: 'active_volunteer',
    no_shift_from: '2026-11-08',
    no_shift_to: '2026-11-14',
    road: '6',
  }
  it('leaves an admin filter alone', () => {
    expect(filterForRole(full, 'admin')).toEqual({ filter: full, dropped: [] })
  })
  it('removes archive keys from a shift lead without a trace and keeps people keys', () => {
    const { filter, dropped } = filterForRole(full, 'lead')
    expect(dropped).toEqual([])
    expect(filter).toEqual({
      ...base,
      source: 'new',
      volunteer_status: 'active_volunteer',
      no_shift_from: '2026-11-08',
      no_shift_to: '2026-11-14',
      road: '6',
    })
  })
  it('drops people-only keys for a responder and says why', () => {
    const { filter, dropped } = filterForRole(full, 'responder')
    expect(filter).toEqual({ ...base, source: 'new', road: '6' })
    expect(dropped.map((d) => d.key)).toEqual(['volunteer_status', 'no_shift'])
    expect(dropped.every((d) => d.reason.length > 0)).toBe(true)
  })
})
