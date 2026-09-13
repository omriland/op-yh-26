import { describe, expect, it } from 'vitest'
import { responderKmApplicable, responderKmMissing } from './responderVehicle'

describe('responderKmApplicable', () => {
  it('expects KM from a volunteer with an active vehicle', () => {
    expect(responderKmApplicable({ profile: { vehicles: [{ archived: false }] } })).toBe(true)
    expect(
      responderKmApplicable({ profile: { vehicles: [{ archived: true }, { archived: false }] } }),
    ).toBe(true)
  })

  it('expects nothing from a volunteer with no vehicle, or only archived ones', () => {
    expect(responderKmApplicable({ profile: { vehicles: [] } })).toBe(false)
    expect(responderKmApplicable({ profile: { vehicles: [{ archived: true }] } })).toBe(false)
  })

  it('keeps expecting KM when the query did not select vehicles', () => {
    // An incomplete query shape must never silently clear a real gap.
    expect(responderKmApplicable({})).toBe(true)
    expect(responderKmApplicable({ profile: null })).toBe(true)
    expect(responderKmApplicable({ profile: { vehicles: null } })).toBe(true)
  })
})

describe('responderKmMissing', () => {
  it('treats a filled 0 as answered, and null as a gap', () => {
    expect(responderKmMissing({ total_km: 0 })).toBe(false)
    expect(responderKmMissing({ total_km: 12 })).toBe(false)
    expect(responderKmMissing({ total_km: null })).toBe(true)
  })

  it('does not nag the lead about a volunteer who has no vehicle', () => {
    expect(responderKmMissing({ total_km: null, profile: { vehicles: [] } })).toBe(false)
    expect(
      responderKmMissing({ total_km: null, profile: { vehicles: [{ archived: true }] } }),
    ).toBe(false)
    expect(
      responderKmMissing({ total_km: null, profile: { vehicles: [{ archived: false }] } }),
    ).toBe(true)
  })
})
