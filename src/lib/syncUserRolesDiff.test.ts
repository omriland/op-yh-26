import { describe, expect, it } from 'vitest'
import { syncUserRolesDiff } from './syncUserRolesDiff'

describe('syncUserRolesDiff', () => {
  it('does not remove super_admin when next roles omit it', () => {
    expect(
      syncUserRolesDiff(['admin', 'super_admin'], ['admin', 'responder']),
    ).toEqual({
      toAdd: ['responder'],
      toRemove: [],
    })
  })

  it('does not add super_admin even if present in next', () => {
    expect(syncUserRolesDiff(['admin'], ['admin', 'super_admin'])).toEqual({
      toAdd: [],
      toRemove: [],
    })
  })

  it('syncs normal role adds and removes', () => {
    expect(
      syncUserRolesDiff(['admin', 'responder'], ['shift_lead', 'responder']),
    ).toEqual({
      toAdd: ['shift_lead'],
      toRemove: ['admin'],
    })
  })
})
