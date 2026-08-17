import { describe, expect, it } from 'vitest'
import {
  includeEventInFuelAllocation,
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
  it('shows from three open assignments', () => {
    expect(shouldShowIncompleteFuelNotice(2)).toBe(false)
    expect(shouldShowIncompleteFuelNotice(3)).toBe(true)
    expect(shouldShowIncompleteFuelNotice(4)).toBe(true)
  })
})
