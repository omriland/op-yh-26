import { describe, expect, it } from 'vitest'
import {
  buildFuelDetailRows,
  type FuelDetailSource,
} from './fuelDetailReport'

function source(overrides: Partial<FuelDetailSource> = {}): FuelDetailSource {
  return {
    event_id: 'e1',
    responder_id: 'r1',
    total_km: 12,
    started_at: '2026-08-05T08:30:00+03:00',
    created_at: '2026-08-05T10:00:00+03:00',
    location: 'צומת גלילות',
    notes: 'הערה',
    event_type_name: 'תאונה',
    full_name: 'בני כהן',
    callsign: 'B1',
    ...overrides,
  }
}

describe('buildFuelDetailRows', () => {
  it('excludes frozen events even when lead km is present', () => {
    const rows = buildFuelDetailRows([
      source({ event_id: 'e-ok', total_km: 12, frozen: false }),
      source({ event_id: 'e-frozen', total_km: 80, frozen: true }),
    ])
    expect(rows.map((r) => r.event_id)).toEqual(['e-ok'])
  })

  it('excludes null total_km and includes zero', () => {
    const rows = buildFuelDetailRows([
      source({ event_id: 'e1', total_km: null }),
      source({ event_id: 'e2', total_km: 0 }),
      source({ event_id: 'e3', total_km: 15 }),
    ])
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.event_id).sort()).toEqual(['e2', 'e3'])
    expect(rows.find((r) => r.event_id === 'e2')!.total_km).toBe(0)
  })

  it('sorts by created_at desc then callsign asc', () => {
    const rows = buildFuelDetailRows([
      source({
        event_id: 'older',
        created_at: '2026-08-01T12:00:00+03:00',
        callsign: 'Z9',
      }),
      source({
        event_id: 'newer-b',
        created_at: '2026-08-10T12:00:00+03:00',
        callsign: 'B1',
        full_name: 'בני',
      }),
      source({
        event_id: 'newer-a',
        created_at: '2026-08-10T12:00:00+03:00',
        callsign: 'A1',
        full_name: 'אבי',
      }),
    ])
    expect(rows.map((r) => r.event_id)).toEqual(['newer-a', 'newer-b', 'older'])
  })

  it('keeps empty location, notes, and started_at as null', () => {
    const rows = buildFuelDetailRows([
      source({
        location: null,
        notes: null,
        started_at: null,
      }),
    ])
    expect(rows[0]).toMatchObject({
      location: null,
      notes: null,
      started_at: null,
      event_type_name: 'תאונה',
      full_name: 'בני כהן',
      callsign: 'B1',
      total_km: 12,
    })
  })
})
