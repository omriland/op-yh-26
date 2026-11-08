import { describe, expect, it } from 'vitest'
import {
  ariaSortOf,
  displayTextSortValue,
  isoSortValue,
  nextSort,
  sortRows,
  type SortValue,
} from './tableSort'

const by = (value: SortValue) => value

describe('sortRows', () => {
  it('orders Hebrew names alphabetically and reverses on desc', () => {
    const names = ['שירה אדלר', 'אבי לוי', 'נועה פרץ', 'דני כהן', 'מאיה שושן']
    expect(sortRows(names, by, 'asc')).toEqual([
      'אבי לוי',
      'דני כהן',
      'מאיה שושן',
      'נועה פרץ',
      'שירה אדלר',
    ])
    expect(sortRows(names, by, 'desc')).toEqual([
      'שירה אדלר',
      'נועה פרץ',
      'מאיה שושן',
      'דני כהן',
      'אבי לוי',
    ])
  })

  it('treats final letters as their base letter', () => {
    expect(sortRows(['כהן', 'כהנא', 'כהם'], by, 'asc')).toEqual(['כהם', 'כהן', 'כהנא'])
  })

  it('compares numbers by value, not as text', () => {
    expect(sortRows([120, 9, 1500, 33], by, 'asc')).toEqual([9, 33, 120, 1500])
    expect(sortRows([120, 9, 1500, 33], by, 'desc')).toEqual([1500, 120, 33, 9])
  })

  it('compares digit runs inside text numerically', () => {
    expect(sortRows(['כביש 90', 'כביש 6', 'כביש 531'], by, 'asc')).toEqual([
      'כביש 6',
      'כביש 90',
      'כביש 531',
    ])
  })

  it('orders dates chronologically', () => {
    const dates = [new Date('2026-11-03'), new Date('2026-10-28'), new Date('2026-11-01')]
    expect(sortRows(dates, by, 'asc').map((d) => d.toISOString().slice(0, 10))).toEqual([
      '2026-10-28',
      '2026-11-01',
      '2026-11-03',
    ])
  })

  it('keeps blank values last in both directions', () => {
    const values: SortValue[] = [null, 5, '', 2, undefined, 9]
    expect(sortRows(values, by, 'asc')).toEqual([2, 5, 9, null, '', undefined])
    expect(sortRows(values, by, 'desc')).toEqual([9, 5, 2, null, '', undefined])
  })

  it('is stable: equal keys keep their incoming order', () => {
    const rows = [
      { id: 'a', day: '2026-11-02' },
      { id: 'b', day: '2026-11-01' },
      { id: 'c', day: '2026-11-02' },
      { id: 'd', day: '2026-11-01' },
    ]
    expect(sortRows(rows, (row) => row.day, 'asc').map((row) => row.id)).toEqual(['b', 'd', 'a', 'c'])
    expect(sortRows(rows, (row) => row.day, 'desc').map((row) => row.id)).toEqual(['a', 'c', 'b', 'd'])
  })

  it('puts numbers before text when a column mixes both', () => {
    expect(sortRows(['בלי מספר', 7, 3], by, 'asc')).toEqual([3, 7, 'בלי מספר'])
  })

  it('does not mutate the input', () => {
    const input = [3, 1, 2]
    sortRows(input, by, 'asc')
    expect(input).toEqual([3, 1, 2])
  })
})

describe('nextSort', () => {
  it('starts a new column ascending', () => {
    expect(nextSort(null, 'name')).toEqual({ columnId: 'name', direction: 'asc' })
    expect(nextSort({ columnId: 'date', direction: 'desc' }, 'name')).toEqual({
      columnId: 'name',
      direction: 'asc',
    })
  })

  it('reverses the current column on a second click', () => {
    expect(nextSort({ columnId: 'name', direction: 'asc' }, 'name')).toEqual({
      columnId: 'name',
      direction: 'desc',
    })
    expect(nextSort({ columnId: 'name', direction: 'desc' }, 'name')).toEqual({
      columnId: 'name',
      direction: 'asc',
    })
  })
})

describe('ariaSortOf', () => {
  it('reports the sorted column only', () => {
    const sort = { columnId: 'km', direction: 'desc' as const }
    expect(ariaSortOf(sort, 'km')).toBe('descending')
    expect(ariaSortOf({ columnId: 'km', direction: 'asc' }, 'km')).toBe('ascending')
    expect(ariaSortOf(sort, 'name')).toBe('none')
    expect(ariaSortOf(null, 'name')).toBe('none')
  })
})

describe('displayTextSortValue', () => {
  it('reads display dates and date-times as chronological numbers', () => {
    const early = displayTextSortValue('28.10.2026') as number
    const late = displayTextSortValue('03.11.2026') as number
    expect(late).toBeGreaterThan(early)
    expect(displayTextSortValue('03.11.2026, 14:05')).toBeGreaterThan(late)
    expect(displayTextSortValue('3/11/26')).toBe(late)
  })

  it('reads times, grouped numbers and negatives', () => {
    expect(displayTextSortValue('09:30')).toBe(570)
    expect(displayTextSortValue('1,234.5')).toBe(1234.5)
    expect(displayTextSortValue('-12')).toBe(-12)
    expect(displayTextSortValue('480')).toBe(480)
  })

  it('treats dashes and empty text as blank', () => {
    expect(displayTextSortValue('—')).toBeNull()
    expect(displayTextSortValue('  ')).toBeNull()
    expect(displayTextSortValue(undefined)).toBeNull()
  })

  it('keeps leading-zero numbers and other text as text', () => {
    expect(displayTextSortValue('0521234567')).toBe('0521234567')
    expect(displayTextSortValue('רכב פרטי')).toBe('רכב פרטי')
  })

  it('sorts a report column of display dates correctly end to end', () => {
    const cells = ['03.11.2026', '—', '28.10.2026', '01.11.2026']
    expect(sortRows(cells, displayTextSortValue, 'asc')).toEqual([
      '28.10.2026',
      '01.11.2026',
      '03.11.2026',
      '—',
    ])
  })
})

describe('isoSortValue', () => {
  it('orders ISO dates and timestamps; missing values are blank', () => {
    expect(isoSortValue('2026-11-03')).toBeGreaterThan(isoSortValue('2026-10-28') as number)
    expect(isoSortValue('2026-11-03T10:00:00Z')).toBeGreaterThan(isoSortValue('2026-11-03') as number)
    expect(isoSortValue(null)).toBeNull()
    expect(isoSortValue('not a date')).toBeNull()
  })
})
