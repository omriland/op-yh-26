import { describe, expect, it } from 'vitest'
import { formatNumber } from './format'
import { formatOdometerEndReading } from './odometer'

describe('formatOdometerEndReading', () => {
  it('puts the responder trip in parentheses as (X ק״מ סה״כ)', () => {
    expect(formatOdometerEndReading(55859, 55983)).toBe(
      `${formatNumber(55983)} (${formatNumber(124)} ק״מ סה״כ)`,
    )
    expect(formatOdometerEndReading(54368, 54374)).toBe(
      `${formatNumber(54374)} (${formatNumber(6)} ק״מ סה״כ)`,
    )
  })

  it('shows 0 when the vehicle did not move', () => {
    expect(formatOdometerEndReading(100, 100)).toBe(
      `${formatNumber(100)} (${formatNumber(0)} ק״מ סה״כ)`,
    )
    expect(formatOdometerEndReading(0, 0)).toBe(`${formatNumber(0)} (${formatNumber(0)} ק״מ סה״כ)`)
  })

  it('shows the end figure alone when the start is missing', () => {
    expect(formatOdometerEndReading(null, 55983)).toBe(formatNumber(55983))
    expect(formatOdometerEndReading(undefined, 55983)).toBe(formatNumber(55983))
  })

  it('stays blank when the end reading is missing', () => {
    expect(formatOdometerEndReading(55859, null)).toBeUndefined()
    expect(formatOdometerEndReading(null, null)).toBeUndefined()
  })

  it('does not invent a trip from a reversed pair', () => {
    expect(formatOdometerEndReading(120, 100)).toBe(formatNumber(100))
  })
})
