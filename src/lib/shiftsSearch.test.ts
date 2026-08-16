import { describe, expect, it } from 'vitest'
import {
  UNIT_SHIFTS_LIST_LIMIT,
  filterUnitShiftsForList,
  mergeShiftLists,
  missingSearchShiftIds,
  unitShiftsListHint,
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
    ...partial,
  }
}

describe('filterUnitShiftsForList', () => {
  const shifts = [row({ id: 'a' }), row({ id: 'b' }), row({ id: 'c' })]

  it('returns the full list when searchIds is null', () => {
    expect(filterUnitShiftsForList(shifts, { searchIds: null }).map((s) => s.id)).toEqual([
      'a',
      'b',
      'c',
    ])
  })

  it('keeps only ids in the search set', () => {
    expect(
      filterUnitShiftsForList(shifts, { searchIds: new Set(['a', 'c']) }).map((s) => s.id),
    ).toEqual(['a', 'c'])
  })

  it('empty searchIds yields no rows', () => {
    expect(filterUnitShiftsForList(shifts, { searchIds: new Set() })).toEqual([])
  })
})

describe('unit shifts list window', () => {
  it('defaults the table to the last 200 shifts', () => {
    expect(UNIT_SHIFTS_LIST_LIMIT).toBe(200)
  })

  it('tells the user the window size and that search fetches older shifts', () => {
    expect(unitShiftsListHint(200)).toBe(
      'מציג את 200 המשמרות האחרונות. ניתן להשתמש בחיפוש לשליפת משמרות ישנות יותר',
    )
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
