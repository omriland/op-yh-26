import { describe, expect, it } from 'vitest'
import {
  UNIT_SHIFTS_LIST_LIMIT,
  UNIT_SHIFTS_RECENT_EMPTY_TITLE,
  UNIT_SHIFTS_WINDOW_DAYS,
  filterUnitShiftsForList,
  mergeShiftLists,
  missingSearchShiftIds,
  partitionUnitShiftsByWindow,
  unitShiftsListHint,
  unitShiftsWindowStart,
  type ShiftListItem,
} from './shifts'

function row(partial: Partial<ShiftListItem> & Pick<ShiftListItem, 'id'>): ShiftListItem {
  return {
    shift_date: '2026-08-01',
    shift_kind: 'morning',
    vehicle_type: 'patrol_north',
    status: 'draft',
    odometer_start: null,
    odometer_end: null,
    personal_vehicle: null,
    shift_lead: null,
    responders: [],
    linked_events: [],
    born_events: [],
    last_saved: null,
    ...partial,
  }
}

describe('filterUnitShiftsForList', () => {
  const shifts = [row({ id: 'a' }), row({ id: 'b' }), row({ id: 'c' })]

  it('returns the full list when searchIds is null, newest id first on a tied date', () => {
    expect(filterUnitShiftsForList(shifts, { searchIds: null }).map((s) => s.id)).toEqual([
      'c',
      'b',
      'a',
    ])
  })

  it('keeps only ids in the search set', () => {
    expect(
      filterUnitShiftsForList(shifts, { searchIds: new Set(['a', 'c']) }).map((s) => s.id),
    ).toEqual(['c', 'a'])
  })

  it('empty searchIds yields no rows', () => {
    expect(filterUnitShiftsForList(shifts, { searchIds: new Set() })).toEqual([])
  })

  it('sorts matching rows by shift_date descending', () => {
    const shuffled = [
      row({ id: 'old', shift_date: '2026-07-15' }),
      row({ id: 'new', shift_date: '2026-09-01' }),
      row({ id: 'mid', shift_date: '2026-08-10' }),
    ]
    expect(filterUnitShiftsForList(shuffled, { searchIds: null }).map((s) => s.id)).toEqual([
      'new',
      'mid',
      'old',
    ])
  })
})

describe('unit shifts list window', () => {
  it('keeps a fetch cap and defaults the visible list to 30 days', () => {
    expect(UNIT_SHIFTS_LIST_LIMIT).toBe(200)
    expect(UNIT_SHIFTS_WINDOW_DAYS).toBe(30)
    expect(UNIT_SHIFTS_RECENT_EMPTY_TITLE).toBe('לא נמצאו משמרות מ-30 הימים האחרונים')
  })

  it('tells the user the window size and that search fetches older shifts', () => {
    expect(unitShiftsListHint(30)).toBe(
      'מציג משמרות מ-30 הימים האחרונים. ניתן להשתמש בחיפוש לשליפת משמרות ישנות יותר',
    )
  })

  it('looks back 30 days per loaded window', () => {
    expect(unitShiftsWindowStart('2026-09-01', 1)).toBe('2026-08-02')
    expect(unitShiftsWindowStart('2026-09-01', 2)).toBe('2026-07-03')
  })

  it('shows only the current window, newest shift_date first, and flags older loaded rows', () => {
    const shifts = [
      row({ id: 'old', shift_date: '2026-07-15' }),
      row({ id: 'today', shift_date: '2026-09-01' }),
      row({ id: 'recent', shift_date: '2026-08-10' }),
    ]

    const first = partitionUnitShiftsByWindow(shifts, {
      dateOf: (shift) => shift.shift_date,
      today: '2026-09-01',
      windowsLoaded: 1,
    })
    expect(first.visible.map((shift) => shift.id)).toEqual(['today', 'recent'])
    expect(first.hasMore).toBe(true)

    const second = partitionUnitShiftsByWindow(shifts, {
      dateOf: (shift) => shift.shift_date,
      today: '2026-09-01',
      windowsLoaded: 2,
    })
    expect(second.visible.map((shift) => shift.id)).toEqual(['today', 'recent', 'old'])
    expect(second.hasMore).toBe(false)
  })

  it('keeps future-dated shifts in the default window', () => {
    const shifts = [row({ id: 'tomorrow', shift_date: '2026-09-02' })]
    const result = partitionUnitShiftsByWindow(shifts, {
      dateOf: (shift) => shift.shift_date,
      today: '2026-09-01',
      windowsLoaded: 1,
    })
    expect(result.visible.map((shift) => shift.id)).toEqual(['tomorrow'])
    expect(result.hasMore).toBe(false)
  })
})

describe('missingSearchShiftIds', () => {
  it('returns search hits that are not already loaded', () => {
    expect(missingSearchShiftIds(['a', 'b'], new Set(['b', 'c', 'd']))).toEqual(['c', 'd'])
  })

  it('returns empty when every hit is already loaded', () => {
    expect(missingSearchShiftIds(['a', 'b'], new Set(['a']))).toEqual([])
  })
})

describe('mergeShiftLists', () => {
  it('appends extras that are not already loaded and keeps shift_date desc', () => {
    const loaded = [
      row({ id: 'new', shift_date: '2026-08-10' }),
      row({ id: 'mid', shift_date: '2026-08-05' }),
    ]
    const extras = [
      row({ id: 'old', shift_date: '2026-07-01' }),
      row({ id: 'mid', shift_date: '2026-08-05', shift_kind: 'midday' }),
    ]

    expect(mergeShiftLists(loaded, extras).map((shift) => shift.id)).toEqual(['new', 'mid', 'old'])
  })
})
