import { describe, expect, it } from 'vitest'
import {
  CANCELLED_CLEAR_ADMIN_ONLY,
  CANCELLED_TREATED_BLOCK,
  applyCancelledChange,
  totalTreatedQuantity,
  validateCancelledSave,
} from './eventForm'
import { suggestRollupsFromLinkedEvents } from './shiftForm'

describe('totalTreatedQuantity', () => {
  it('sums treated quantities across responders', () => {
    expect(
      totalTreatedQuantity([
        {
          treated: [{ quantity: 2 }, { quantity: 1 }],
        },
        { treated: [{ quantity: 3 }] },
      ]),
    ).toBe(6)
  })

  it('returns 0 when empty', () => {
    expect(totalTreatedQuantity([])).toBe(0)
    expect(totalTreatedQuantity([{ treated: [] }])).toBe(0)
  })
})

describe('applyCancelledChange', () => {
  it('blocks checking cancelled when treated > 0', () => {
    expect(
      applyCancelledChange({
        next: true,
        current: false,
        treatedTotal: 2,
        isAdmin: true,
      }),
    ).toEqual({ ok: false, error: CANCELLED_TREATED_BLOCK })
  })

  it('allows checking cancelled when treated is 0', () => {
    expect(
      applyCancelledChange({
        next: true,
        current: false,
        treatedTotal: 0,
        isAdmin: false,
      }),
    ).toEqual({ ok: true, is_cancelled: true })
  })

  it('blocks non-admin from clearing cancelled', () => {
    expect(
      applyCancelledChange({
        next: false,
        current: true,
        treatedTotal: 0,
        isAdmin: false,
      }),
    ).toEqual({ ok: false, error: CANCELLED_CLEAR_ADMIN_ONLY })
  })

  it('allows admin to clear cancelled', () => {
    expect(
      applyCancelledChange({
        next: false,
        current: true,
        treatedTotal: 0,
        isAdmin: true,
      }),
    ).toEqual({ ok: true, is_cancelled: false })
  })
})

describe('validateCancelledSave', () => {
  it('rejects cancelled with treated vehicles', () => {
    expect(
      validateCancelledSave({
        is_cancelled: true,
        treatedTotal: 1,
        isAdmin: true,
        previousIsCancelled: false,
      }),
    ).toEqual({ form: CANCELLED_TREATED_BLOCK })
  })

  it('rejects non-admin clearing cancelled', () => {
    expect(
      validateCancelledSave({
        is_cancelled: false,
        treatedTotal: 0,
        isAdmin: false,
        previousIsCancelled: true,
      }),
    ).toEqual({ form: CANCELLED_CLEAR_ADMIN_ONLY })
  })

  it('allows admin clear and cancelled with zero treated', () => {
    expect(
      validateCancelledSave({
        is_cancelled: false,
        treatedTotal: 0,
        isAdmin: true,
        previousIsCancelled: true,
      }),
    ).toBeNull()
    expect(
      validateCancelledSave({
        is_cancelled: true,
        treatedTotal: 0,
        isAdmin: false,
        previousIsCancelled: false,
      }),
    ).toBeNull()
  })
})

describe('suggestRollupsFromLinkedEvents cancelled_count', () => {
  it('counts types including cancelled and reports cancelled_count separately', () => {
    const result = suggestRollupsFromLinkedEvents({
      eventTypeIds: ['type-a', 'type-a', 'type-b'],
      treated: [{ vehicle_kind_id: 'car', quantity: 1 }],
      cancelledFlags: [true, false, true],
    })
    expect(result.event_type_counts).toEqual(
      expect.arrayContaining([
        { event_type_id: 'type-a', count: 2 },
        { event_type_id: 'type-b', count: 1 },
      ]),
    )
    expect(result.cancelled_count).toBe(2)
  })

  it('defaults cancelled_count to 0', () => {
    expect(
      suggestRollupsFromLinkedEvents({
        eventTypeIds: ['type-a'],
        treated: [],
      }).cancelled_count,
    ).toBe(0)
  })
})
