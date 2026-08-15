import { describe, expect, it } from 'vitest'
import type { FuelRefundRow } from './fuelRefundReport'
import { formatLiters, litersFromKm, toUsageRows, usageTotals } from './fuelUsage'

const rows: FuelRefundRow[] = [
  { id: 'a', full_name: 'אבי לוי', callsign: 'A1', total_km: 90, event_count: 2 },
  { id: 'b', full_name: 'בני כהן', callsign: 'B1', total_km: 0, event_count: 0 },
  { id: 'c', full_name: 'גיא דהן', callsign: 'G1', total_km: 12, event_count: 1 },
]

describe('litersFromKm', () => {
  it('divides kilometers by 6', () => {
    expect(litersFromKm(90)).toBe(15)
    expect(litersFromKm(12)).toBe(2)
  })
})

describe('formatLiters', () => {
  it('shows one decimal', () => {
    expect(formatLiters(90)).toBe('15.0')
    expect(formatLiters(10)).toBe('1.7')
  })
})

describe('usageTotals', () => {
  it('sums km and liters and counts responders with km > 0', () => {
    expect(usageTotals(rows)).toEqual({
      totalKm: 102,
      totalLiters: 17,
      withKm: 2,
    })
  })
})

describe('toUsageRows', () => {
  it('adds liters to each refund row', () => {
    const usage = toUsageRows(rows)
    expect(usage[0]).toMatchObject({ id: 'a', liters: 15 })
    expect(usage[1]).toMatchObject({ id: 'b', liters: 0 })
    expect(usage[2]).toMatchObject({ id: 'c', liters: 2 })
  })
})
