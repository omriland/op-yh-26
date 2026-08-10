import { describe, expect, it } from 'vitest'
import {
  buildFuelRefundRows,
  defaultFuelRefundRange,
  isValidFuelRefundRange,
  localDateRangeToUtcBounds,
  type FuelRefundParticipation,
  type FuelRefundProfile,
} from './fuelRefundReport'

const profiles: FuelRefundProfile[] = [
  { id: 'a', full_name: 'בני כהן', callsign: 'B1' },
  { id: 'b', full_name: 'אבי לוי', callsign: 'A1' },
]

function part(
  overrides: Partial<FuelRefundParticipation> & Pick<FuelRefundParticipation, 'responder_id'>,
): FuelRefundParticipation {
  return {
    event_id: overrides.event_id ?? 'e1',
    total_km: overrides.total_km ?? null,
    responder_id: overrides.responder_id,
  }
}

describe('defaultFuelRefundRange', () => {
  it('uses first of month through today', () => {
    expect(defaultFuelRefundRange(new Date(2026, 7, 10))).toEqual({
      from: '2026-08-01',
      to: '2026-08-10',
    })
  })
})

describe('isValidFuelRefundRange', () => {
  it('rejects from after to', () => {
    expect(isValidFuelRefundRange('2026-08-10', '2026-08-01')).toBe(false)
  })

  it('accepts equal and ordered ranges', () => {
    expect(isValidFuelRefundRange('2026-08-01', '2026-08-01')).toBe(true)
    expect(isValidFuelRefundRange('2026-08-01', '2026-08-10')).toBe(true)
  })
})

describe('localDateRangeToUtcBounds', () => {
  it('covers inclusive local calendar days', () => {
    const { startIso, endIso } = localDateRangeToUtcBounds('2026-08-01', '2026-08-01')
    const start = new Date(startIso)
    const end = new Date(endIso)
    expect(start.getFullYear()).toBe(2026)
    expect(start.getMonth()).toBe(7)
    expect(start.getDate()).toBe(1)
    expect(start.getHours()).toBe(0)
    expect(end.getDate()).toBe(1)
    expect(end.getHours()).toBe(23)
    expect(end.getMinutes()).toBe(59)
    expect(end.getTime()).toBeGreaterThan(start.getTime())
  })
})

describe('buildFuelRefundRows', () => {
  it('lists all active profiles sorted by name with idle zeros', () => {
    const rows = buildFuelRefundRows(profiles, [])
    expect(rows.map((r) => r.full_name)).toEqual(['אבי לוי', 'בני כהן'])
    expect(rows[0]).toMatchObject({
      total_km: 0,
      event_count: 0,
    })
    expect(rows[0]).not.toHaveProperty('odometer_first')
  })

  it('sums only rows with lead-entered total_km; ignores null km', () => {
    const rows = buildFuelRefundRows(profiles, [
      part({ responder_id: 'b', event_id: 'e1', total_km: 12 }),
      part({ responder_id: 'b', event_id: 'e2', total_km: null }),
      part({ responder_id: 'b', event_id: 'e3', total_km: 8 }),
    ])
    const avi = rows.find((r) => r.id === 'b')!
    expect(avi.total_km).toBe(20)
    expect(avi.event_count).toBe(2)
  })

  it('includes zero total_km as entered', () => {
    const rows = buildFuelRefundRows(profiles, [
      part({ responder_id: 'a', event_id: 'e1', total_km: 0 }),
    ])
    const beni = rows.find((r) => r.id === 'a')!
    expect(beni.total_km).toBe(0)
    expect(beni.event_count).toBe(1)
  })
})
