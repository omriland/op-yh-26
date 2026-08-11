import { describe, expect, it } from 'vitest'
import { canImpersonateTarget } from './impersonationEligibility'

const actor = 'actor-1'

describe('canImpersonateTarget', () => {
  it('allows active non-super-admin other user', () => {
    expect(
      canImpersonateTarget(actor, {
        id: 'user-2',
        active: true,
        roles: ['responder'],
      }),
    ).toBe(true)
  })

  it('rejects self', () => {
    expect(
      canImpersonateTarget(actor, {
        id: actor,
        active: true,
        roles: ['admin'],
      }),
    ).toBe(false)
  })

  it('rejects inactive', () => {
    expect(
      canImpersonateTarget(actor, {
        id: 'user-2',
        active: false,
        roles: ['responder'],
      }),
    ).toBe(false)
  })

  it('rejects super_admin targets', () => {
    expect(
      canImpersonateTarget(actor, {
        id: 'user-2',
        active: true,
        roles: ['admin', 'super_admin'],
      }),
    ).toBe(false)
  })

  it('rejects missing actor', () => {
    expect(
      canImpersonateTarget(null, {
        id: 'user-2',
        active: true,
        roles: ['responder'],
      }),
    ).toBe(false)
  })
})
