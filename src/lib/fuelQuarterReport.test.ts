import { describe, expect, it } from 'vitest'
import { buildFuelQuarterRows, type FuelQuarterProfile } from './fuelQuarterReport'

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
      frozen_event_count: 0,
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

  it('counts frozen events without adding their km', () => {
    const rows = buildFuelQuarterRows({
      year: 2026,
      quarter: 1,
      profiles,
      participations: [
        { responder_id: 'a', created_at: '2026-01-10T12:00:00+03:00', total_km: 20, frozen: false },
        { responder_id: 'a', created_at: '2026-02-10T12:00:00+03:00', total_km: 80, frozen: true },
        { responder_id: 'a', created_at: '2026-03-10T12:00:00+03:00', total_km: 90, frozen: true },
      ],
      openingByUser: {},
      savedByUser: {},
    })
    expect(rows[0]).toMatchObject({
      responder_id: 'a',
      km_month_1: 20,
      km_month_2: 0,
      km_month_3: 0,
      quarter_km: 20,
      frozen_event_count: 2,
    })
  })

  it('keeps a volunteer who only has frozen events so the snowflake can show', () => {
    const rows = buildFuelQuarterRows({
      year: 2026,
      quarter: 1,
      profiles,
      participations: [
        { responder_id: 'b', created_at: '2026-01-10T12:00:00+03:00', total_km: 88, frozen: true },
      ],
      openingByUser: {},
      savedByUser: {},
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      responder_id: 'b',
      quarter_km: 0,
      frozen_event_count: 1,
    })
  })
})
