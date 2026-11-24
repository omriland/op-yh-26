import { describe, expect, it } from 'vitest'
import {
  sortSummaryRows,
  summaryColumns,
  summaryCsv,
  summaryRowsToTable,
  summaryTotals,
  type SummaryRpcRow,
} from './summaryReport'

const road1: SummaryRpcRow = {
  group_id: 'r1',
  group_label: 'כביש 1',
  event_count: 9,
  shift_count: 0,
  km_total: 120.5,
  last_activity: '2026-11-02',
}
const road2: SummaryRpcRow = {
  group_id: 'r2',
  group_label: 'כביש 6',
  event_count: 10,
  shift_count: 0,
  km_total: 8,
  last_activity: '2026-11-20',
}
const unnamed: SummaryRpcRow = {
  group_id: 'none',
  group_label: '',
  event_count: 2,
  shift_count: 0,
  km_total: 0,
  last_activity: '2026-10-01',
}

describe('summaryColumns', () => {
  it('shows the shift count column only when grouping by volunteer', () => {
    const headers = (group: Parameters<typeof summaryColumns>[0]) =>
      summaryColumns(group).map((column) => column.id)
    expect(headers('responder')).toContain('shifts')
    for (const group of ['road', 'district', 'event_type', 'shift_lead'] as const) {
      expect(headers(group)).not.toContain('shifts')
    }
  })

  it('shows km only for volunteers and event types', () => {
    expect(summaryColumns('road').map((column) => column.id)).toEqual(['label', 'events', 'last_activity'])
    expect(summaryColumns('district').map((column) => column.id)).not.toContain('km')
    expect(summaryColumns('shift_lead').map((column) => column.id)).not.toContain('km')
    expect(summaryColumns('responder').map((column) => column.id)).toContain('km')
    expect(summaryColumns('event_type').map((column) => column.id)).toContain('km')
  })

  it('adds a monthly average for shift leads only when the range is longer than two months', () => {
    const threeMonths = { from: '2026-08-01', to: '2026-10-31' }
    const twoMonths = { from: '2026-09-01', to: '2026-10-31' }
    const ids = (group: Parameters<typeof summaryColumns>[0], range: { from: string; to: string }) =>
      summaryColumns(group, range).map((column) => column.id)
    expect(ids('shift_lead', threeMonths)).toEqual(['label', 'events', 'monthly_average', 'last_activity'])
    expect(ids('shift_lead', twoMonths)).not.toContain('monthly_average')
    expect(ids('responder', threeMonths)).not.toContain('monthly_average')
  })
})

describe('summaryRowsToTable', () => {
  it('maps a road row to label, count and date, without km', () => {
    const [row] = summaryRowsToTable([road1], 'road')
    expect(row.id).toBe('r1')
    expect(row.values).toEqual(['כביש 1', '9', '02.11.2026'])
  })

  it('divides a shift lead\'s events by the months in the range', () => {
    const lead = { ...road1, event_count: 30 }
    const [row] = summaryRowsToTable([lead], 'shift_lead', { from: '2026-08-01', to: '2026-10-31' })
    expect(row.values[2]).toBe('10')
  })

  it.each([
    ['road', 'כביש'],
    ['responder', 'מתנדב'],
    ['district', 'שלוחה'],
    ['event_type', 'סוג אירוע'],
    ['shift_lead', 'אחמ״ש'],
  ] as const)('maps every value for the %s grouping', (group, labelHeader) => {
    const withShifts = { ...road1, shift_count: 4 }
    const columns = summaryColumns(group)
    const [row] = summaryRowsToTable([withShifts], group)
    expect(columns[0].header).toBe(labelHeader)
    const expectedValues =
      group === 'responder'
        ? ['כביש 1', '9', '4', '120.5', '02.11.2026']
        : group === 'event_type'
          ? ['כביש 1', '9', '120.5', '02.11.2026']
          : ['כביש 1', '9', '02.11.2026']
    expect(row.values).toEqual(expectedValues)
    expect(row.values).toHaveLength(columns.length)
  })

  it('uses a dash for an empty label', () => {
    const [row] = summaryRowsToTable([unnamed], 'road')
    expect(row.values[0]).toBe('—')
  })

  it('adds the shift count value for volunteers', () => {
    const volunteer = { ...road1, shift_count: 4 }
    const [row] = summaryRowsToTable([volunteer], 'responder')
    expect(row.values).toHaveLength(5)
    expect(row.values[2]).toBe('4')
  })

  it('keeps the group id so the row can open its events', () => {
    const [row] = summaryRowsToTable([road2], 'district')
    expect(row.searchText).toContain('כביש 6')
    expect(row.id).toBe('r2')
  })
})

describe('summaryTotals', () => {
  it('sums events, shifts and km once per row', () => {
    const volunteers = [
      { ...road1, shift_count: 3 },
      { ...road2, shift_count: 5 },
    ]
    expect(summaryTotals(volunteers)).toEqual({ events: 19, shifts: 8, km: 128.5 })
  })

  it('is zero for no rows', () => {
    expect(summaryTotals([])).toEqual({ events: 0, shifts: 0, km: 0 })
  })
})

describe('sortSummaryRows', () => {
  it('sorts numbers numerically, not as text', () => {
    const sorted = sortSummaryRows([road1, road2], 'events', 'asc')
    expect(sorted.map((row) => row.group_id)).toEqual(['r1', 'r2'])
    const desc = sortSummaryRows([road1, road2], 'events', 'desc')
    expect(desc.map((row) => row.group_id)).toEqual(['r2', 'r1'])
  })

  it('sorts km numerically', () => {
    const sorted = sortSummaryRows([road1, road2], 'km', 'asc')
    expect(sorted.map((row) => row.group_id)).toEqual(['r2', 'r1'])
  })

  it('sorts by last activity date', () => {
    const sorted = sortSummaryRows([road2, road1], 'last_activity', 'asc')
    expect(sorted.map((row) => row.group_id)).toEqual(['r1', 'r2'])
  })

  it('does not change the input array', () => {
    const input = [road2, road1]
    sortSummaryRows(input, 'events', 'asc')
    expect(input.map((row) => row.group_id)).toEqual(['r2', 'r1'])
  })
})

describe('summaryCsv', () => {
  it('includes the totals line exactly once, after the data rows', () => {
    const csv = summaryCsv('road', [road1, road2])
    const lines = csv.split('\r\n')
    expect(lines).toHaveLength(4)
    expect(lines[0]).toBe('כביש,אירועים,פעילות אחרונה')
    expect(lines.filter((line) => line.startsWith('סה״כ'))).toHaveLength(1)
    expect(lines[3].startsWith('סה״כ')).toBe(true)
    expect(lines[3]).toBe('סה״כ,19,')
  })

  it('puts the shift sum in the totals line for volunteers', () => {
    const volunteers = [
      { ...road1, shift_count: 3 },
      { ...road2, shift_count: 5 },
    ]
    const lines = summaryCsv('responder', volunteers).split('\r\n')
    expect(lines[0]).toBe('מתנדב,אירועים,משמרות,ק״מ,פעילות אחרונה')
    expect(lines[3]).toBe('סה״כ,19,8,128.5,')
  })

  it('has the shifts header only for volunteers', () => {
    const volunteer = summaryCsv('responder', [{ ...road1, shift_count: 2 }])
    const road = summaryCsv('road', [road1])
    expect(volunteer.split('\r\n')[0].split(',')).toHaveLength(5)
    expect(road.split('\r\n')[0].split(',')).toHaveLength(3)
  })
})
