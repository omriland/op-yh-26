import { describe, expect, it } from 'vitest'
import {
  includeParticipationInFuelAllocation,
  INCOMPLETE_FUEL_REFUND_NOTICE,
  shouldShowIncompleteFuelNotice,
} from './fuelAllocationPolicy'

describe('includeParticipationInFuelAllocation', () => {
  it('counts a completed responder log with lead KM, even if the event is still partial', () => {
    expect(
      includeParticipationInFuelAllocation({
        totalKm: 9,
        participationStatus: 'done',
      }),
    ).toBe(true)
    expect(
      includeParticipationInFuelAllocation({
        totalKm: 0,
        participationStatus: 'done',
      }),
    ).toBe(true)
  })

  it('excludes missing KM, an unfinished log, or a frozen event', () => {
    expect(
      includeParticipationInFuelAllocation({
        totalKm: null,
        participationStatus: 'done',
      }),
    ).toBe(false)
    expect(
      includeParticipationInFuelAllocation({
        totalKm: 9,
        participationStatus: 'pending',
      }),
    ).toBe(false)
    expect(
      includeParticipationInFuelAllocation({
        totalKm: 9,
        participationStatus: 'in_progress',
      }),
    ).toBe(false)
    expect(
      includeParticipationInFuelAllocation({
        totalKm: 9,
        participationStatus: 'done',
        frozen: true,
      }),
    ).toBe(false)
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
    expect(INCOMPLETE_FUEL_REFUND_NOTICE).toContain('המתנדב')
  })
})
