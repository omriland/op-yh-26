import { describe, expect, it } from 'vitest'
import {
  buildProfileKmBreakdown,
  monthLabelHe,
  quarterLabelHe,
  type ProfileKmMonthlyRow,
} from './profileKmBreakdown'

// Rows mirror public.profile_km_monthly: month is the first day of the month (YYYY-MM-DD).
function row(month: string, km: number): ProfileKmMonthlyRow {
  return { month, km }
}

describe('monthLabelHe', () => {
  it('writes the Hebrew month name and the year', () => {
    expect(monthLabelHe('2026-11-01')).toBe('נובמבר 2026')
  })

  it('covers the first and last month of the year', () => {
    expect(monthLabelHe('2026-01-01')).toBe('ינואר 2026')
    expect(monthLabelHe('2025-12-01')).toBe('דצמבר 2025')
  })

  it('has the right Hebrew name for every month', () => {
    const names = [
      'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
      'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
    ]
    names.forEach((name, index) => {
      const monthNumber = String(index + 1).padStart(2, '0')
      expect(monthLabelHe(`2026-${monthNumber}-01`)).toBe(`${name} 2026`)
    })
  })

  it('does not shift the month in a timezone behind UTC (reads the date text, not a Date)', () => {
    expect(monthLabelHe('2026-03-01')).toBe('מרץ 2026')
  })
})

describe('quarterLabelHe', () => {
  it('writes רבעון, the number, a comma and the year', () => {
    expect(quarterLabelHe(2026, 4)).toBe('רבעון 4, 2026')
    expect(quarterLabelHe(2025, 1)).toBe('רבעון 1, 2025')
  })
})

describe('buildProfileKmBreakdown', () => {
  it('returns empty lists and a zero total for no rows', () => {
    expect(buildProfileKmBreakdown([])).toEqual({ months: [], quarters: [], totalKm: 0 })
  })

  it('lists months newest first with label, key and km', () => {
    const { months } = buildProfileKmBreakdown([
      row('2026-09-01', 100),
      row('2026-11-01', 300),
      row('2026-10-01', 200),
    ])
    expect(months).toEqual([
      { key: '2026-11', label: 'נובמבר 2026', km: 300 },
      { key: '2026-10', label: 'אוקטובר 2026', km: 200 },
      { key: '2026-09', label: 'ספטמבר 2026', km: 100 },
    ])
  })

  it('orders months across a year boundary', () => {
    const { months } = buildProfileKmBreakdown([
      row('2025-12-01', 5),
      row('2026-01-01', 7),
      row('2024-12-01', 9),
    ])
    expect(months.map((m) => m.key)).toEqual(['2026-01', '2025-12', '2024-12'])
  })

  it('keeps months with zero km (the database decides what is stored)', () => {
    const { months, totalKm } = buildProfileKmBreakdown([row('2026-05-01', 0), row('2026-06-01', 12)])
    expect(months.map((m) => m.km)).toEqual([12, 0])
    expect(totalKm).toBe(12)
  })

  it('groups into calendar quarters: Jan-Mar is Q1, Dec is Q4', () => {
    const { quarters } = buildProfileKmBreakdown([
      row('2026-01-01', 1),
      row('2026-03-01', 2),
      row('2026-04-01', 4),
      row('2026-06-01', 8),
      row('2026-07-01', 16),
      row('2026-09-01', 32),
      row('2026-10-01', 64),
      row('2026-12-01', 128),
    ])
    expect(quarters.map((q) => [q.key, q.km])).toEqual([
      ['2026-Q4', 192],
      ['2026-Q3', 48],
      ['2026-Q2', 12],
      ['2026-Q1', 3],
    ])
  })

  it('puts the quarter boundary months in the right quarter', () => {
    const { quarters } = buildProfileKmBreakdown([
      row('2026-03-01', 10),
      row('2026-04-01', 20),
      row('2026-09-01', 30),
      row('2026-10-01', 40),
    ])
    expect(quarters.map((q) => [q.key, q.km])).toEqual([
      ['2026-Q4', 40],
      ['2026-Q3', 30],
      ['2026-Q2', 20],
      ['2026-Q1', 10],
    ])
  })

  it('labels quarters in Hebrew and carries year and quarter', () => {
    const { quarters } = buildProfileKmBreakdown([row('2026-11-01', 300)])
    expect(quarters).toEqual([
      { key: '2026-Q4', label: 'רבעון 4, 2026', year: 2026, quarter: 4, km: 300 },
    ])
  })

  it('keeps the same quarter of different years apart, newest year first', () => {
    const { quarters } = buildProfileKmBreakdown([
      row('2025-11-01', 50),
      row('2026-11-01', 70),
    ])
    expect(quarters.map((q) => [q.label, q.km])).toEqual([
      ['רבעון 4, 2026', 70],
      ['רבעון 4, 2025', 50],
    ])
  })

  it('skips quarters that have no rows', () => {
    const { quarters } = buildProfileKmBreakdown([row('2026-01-01', 5), row('2026-10-01', 6)])
    expect(quarters.map((q) => q.key)).toEqual(['2026-Q4', '2026-Q1'])
  })

  it('total equals the sum of all months and the sum of all quarters', () => {
    const result = buildProfileKmBreakdown([
      row('2025-12-01', 11),
      row('2026-01-01', 22),
      row('2026-05-01', 33),
      row('2026-11-01', 44),
    ])
    expect(result.totalKm).toBe(110)
    expect(result.months.reduce((sum, m) => sum + m.km, 0)).toBe(110)
    expect(result.quarters.reduce((sum, q) => sum + q.km, 0)).toBe(110)
  })

  it('adds up decimal km without floating point noise', () => {
    const { totalKm, quarters } = buildProfileKmBreakdown([
      row('2026-10-01', 0.1),
      row('2026-11-01', 0.2),
    ])
    expect(totalKm).toBe(0.3)
    expect(quarters[0]!.km).toBe(0.3)
  })

  it('keeps a quarter whose only rows have zero km', () => {
    const { quarters } = buildProfileKmBreakdown([row('2026-02-01', 0), row('2026-11-01', 5)])
    expect(quarters.map((q) => [q.key, q.km])).toEqual([
      ['2026-Q4', 5],
      ['2026-Q1', 0],
    ])
  })

  it('splits December and the following January into different quarters', () => {
    const { quarters } = buildProfileKmBreakdown([row('2026-01-01', 7), row('2025-12-01', 5)])
    expect(quarters.map((q) => [q.key, q.km])).toEqual([
      ['2026-Q1', 7],
      ['2025-Q4', 5],
    ])
  })

  it('does not round away real decimals', () => {
    const { totalKm } = buildProfileKmBreakdown([row('2026-10-01', 1234.5), row('2026-11-01', 0.25)])
    expect(totalKm).toBe(1234.75)
  })

  it('rounds merged duplicate months too', () => {
    const { months } = buildProfileKmBreakdown([row('2026-11-01', 0.1), row('2026-11-01', 0.2)])
    expect(months[0]!.km).toBe(0.3)
  })

  it('merges two rows for the same month instead of listing it twice', () => {
    const { months, totalKm } = buildProfileKmBreakdown([
      row('2026-11-01', 100),
      row('2026-11-01', 50),
    ])
    expect(months).toEqual([{ key: '2026-11', label: 'נובמבר 2026', km: 150 }])
    expect(totalKm).toBe(150)
  })

  it('does not change the input array or its order', () => {
    const input = [row('2026-09-01', 1), row('2026-11-01', 2)]
    const copy = input.map((r) => ({ ...r }))
    buildProfileKmBreakdown(input)
    expect(input).toEqual(copy)
  })
})
