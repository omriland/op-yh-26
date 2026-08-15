import { describe, expect, it } from 'vitest'
import {
  defaultPeriod,
  formatPeriodLabel,
  periodToRange,
  type PeriodValue,
} from './periodRange'

const now = new Date(2026, 7, 15)

describe('defaultPeriod', () => {
  it('is a range from the first of the current month through today', () => {
    expect(defaultPeriod(now)).toEqual({
      mode: 'range',
      from: '2026-08-01',
      to: '2026-08-15',
    })
  })
})

describe('periodToRange', () => {
  it('passes an explicit range through', () => {
    const value: PeriodValue = { mode: 'range', from: '2026-03-01', to: '2026-03-10' }
    expect(periodToRange(value, now)).toEqual({ from: '2026-03-01', to: '2026-03-10' })
  })

  it('clamps an explicit range that ends after today', () => {
    const value: PeriodValue = { mode: 'range', from: '2026-08-01', to: '2026-08-31' }
    expect(periodToRange(value, now)).toEqual({ from: '2026-08-01', to: '2026-08-15' })
  })

  it('resolves the current month through today', () => {
    expect(periodToRange({ mode: 'month', year: 2026, month: 8 }, now)).toEqual({
      from: '2026-08-01',
      to: '2026-08-15',
    })
  })

  it('resolves a past month to its full calendar span', () => {
    expect(periodToRange({ mode: 'month', year: 2026, month: 7 }, now)).toEqual({
      from: '2026-07-01',
      to: '2026-07-31',
    })
  })

  it('resolves the current year through today', () => {
    expect(periodToRange({ mode: 'year', year: 2026 }, now)).toEqual({
      from: '2026-01-01',
      to: '2026-08-15',
    })
  })

  it('resolves a past year to Jan 1–Dec 31', () => {
    expect(periodToRange({ mode: 'year', year: 2025 }, now)).toEqual({
      from: '2025-01-01',
      to: '2025-12-31',
    })
  })

  it('resolves last 7 days inclusive ending today', () => {
    expect(
      periodToRange({ mode: 'recent', preset: { unit: 'days', amount: 7 } }, now),
    ).toEqual({ from: '2026-08-09', to: '2026-08-15' })
  })

  it('resolves last 30 days inclusive ending today', () => {
    expect(
      periodToRange({ mode: 'recent', preset: { unit: 'days', amount: 30 } }, now),
    ).toEqual({ from: '2026-07-17', to: '2026-08-15' })
  })

  it('resolves last 90 days inclusive ending today', () => {
    expect(
      periodToRange({ mode: 'recent', preset: { unit: 'days', amount: 90 } }, now),
    ).toEqual({ from: '2026-05-18', to: '2026-08-15' })
  })

  it('resolves last 3 months to the same calendar day through today', () => {
    expect(
      periodToRange({ mode: 'recent', preset: { unit: 'months', amount: 3 } }, now),
    ).toEqual({ from: '2026-05-15', to: '2026-08-15' })
  })

  it('resolves last 6 months to the same calendar day through today', () => {
    expect(
      periodToRange({ mode: 'recent', preset: { unit: 'months', amount: 6 } }, now),
    ).toEqual({ from: '2026-02-15', to: '2026-08-15' })
  })

  it('resolves last 12 months to the same calendar day through today', () => {
    expect(
      periodToRange({ mode: 'recent', preset: { unit: 'months', amount: 12 } }, now),
    ).toEqual({ from: '2025-08-15', to: '2026-08-15' })
  })
})

describe('formatPeriodLabel', () => {
  it('formats a range with DD.MM.YYYY ends', () => {
    expect(
      formatPeriodLabel({ mode: 'range', from: '2026-08-01', to: '2026-08-15' }, now),
    ).toBe('01.08.2026–15.08.2026')
  })

  it('formats a month in Hebrew', () => {
    expect(formatPeriodLabel({ mode: 'month', year: 2026, month: 8 }, now)).toBe('אוגוסט 2026')
  })

  it('formats a year as the year number', () => {
    expect(formatPeriodLabel({ mode: 'year', year: 2026 }, now)).toBe('2026')
  })

  it('formats recent day presets', () => {
    expect(
      formatPeriodLabel({ mode: 'recent', preset: { unit: 'days', amount: 7 } }, now),
    ).toBe('7 הימים האחרונים')
    expect(
      formatPeriodLabel({ mode: 'recent', preset: { unit: 'days', amount: 30 } }, now),
    ).toBe('30 הימים האחרונים')
  })

  it('formats recent month presets', () => {
    expect(
      formatPeriodLabel({ mode: 'recent', preset: { unit: 'months', amount: 3 } }, now),
    ).toBe('3 החודשים האחרונים')
  })
})
