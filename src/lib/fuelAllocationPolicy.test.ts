import { describe, expect, it } from 'vitest'
import {
  includeEventInFuelAllocation,
  INCOMPLETE_FUEL_REFUND_NOTICE,
  shouldShowIncompleteFuelNotice,
} from './fuelAllocationPolicy'

describe('includeEventInFuelAllocation', () => {
  it('includes only fully completed events', () => {
    expect(includeEventInFuelAllocation('done')).toBe(true)
    expect(includeEventInFuelAllocation('partial')).toBe(false)
    expect(includeEventInFuelAllocation('in_progress')).toBe(false)
    expect(includeEventInFuelAllocation('draft')).toBe(false)
  })
})

describe('shouldShowIncompleteFuelNotice', () => {
  it('warns from the first open event, not the third', () => {
    expect(shouldShowIncompleteFuelNotice(0)).toBe(false)
    expect(shouldShowIncompleteFuelNotice(1)).toBe(true)
    expect(shouldShowIncompleteFuelNotice(2)).toBe(true)
    expect(shouldShowIncompleteFuelNotice(4)).toBe(true)
  })

  it('states the consequence without shouting', () => {
    expect(INCOMPLETE_FUEL_REFUND_NOTICE).not.toContain('!')
    expect(INCOMPLETE_FUEL_REFUND_NOTICE).toContain('החזר הדלק הרבעוני')
  })
})
