import { describe, expect, it } from 'vitest'
import { buildFuelQuarterRows, type FuelQuarterProfile, type SavedDistribution } from './fuelQuarterReport'

const profiles: FuelQuarterProfile[] = [
  { id: 'a', full_name: 'אבי לוי', callsign: 'A1', active: true },
  { id: 'b', full_name: 'בני כהן', callsign: 'B1', active: true },
  { id: 'c', full_name: 'גיל ישן', callsign: 'C1', active: false },
]

describe('buildFuelQuarterRows', () => {
  it('includes only users with km, non-zero opening, or saved distribution', () => {
    const rows = buildFuelQuarterRows({
      year: 2026,
      quarter: 1,
      profiles,
      participations: [
        { responder_id: 'a', created_at: '2026-01-10T12:00:00+03:00', total_km: 90 },
      ],
      openingByUser: { c: -10 },
      savedByUser: {
        b: { cards: 1, card_numbers: 'x' },
      },
    })
    expect(rows.map((r) => r.responder_id).sort()).toEqual(['a', 'b', 'c'])
  })

  it('defaults cards to suggested and computes remaining', () => {
    const rows = buildFuelQuarterRows({
      year: 2026,
      quarter: 1,
      profiles,
      participations: [
        { responder_id: 'a', created_at: '2026-01-10T12:00:00+03:00', total_km: 90 },
      ],
      openingByUser: {},
      savedByUser: {},
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      opening_balance_km: 0,
      km_month_1: 90,
      quarter_km: 90,
      payable_km: 90,
      liters: 15,
      suggested_cards: 1,
      cards: 1,
      remaining_km: 0,
      card_numbers: '',
    })
  })

  it('uses saved cards override', () => {
    const rows = buildFuelQuarterRows({
      year: 2026,
      quarter: 1,
      profiles,
      participations: [
        { responder_id: 'a', created_at: '2026-01-10T12:00:00+03:00', total_km: 90 },
      ],
      openingByUser: {},
      savedByUser: { a: { cards: 0, card_numbers: 'n/a' } },
    })
    expect(rows[0]).toMatchObject({
      cards: 0,
      remaining_km: 90,
      card_numbers: 'n/a',
    })
  })
})
