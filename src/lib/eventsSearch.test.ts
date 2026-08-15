import { describe, expect, it } from 'vitest'
import {
  UNIT_EVENTS_LIST_LIMIT,
  filterUnitEventsForList,
  mergeEventLists,
  missingSearchEventIds,
  unitEventsListHint,
  type EventListItem,
} from './events'

function row(partial: Partial<EventListItem> & Pick<EventListItem, 'id' | 'status'>): EventListItem {
  return {
    event_date: '2026-08-01',
    police_event_id: null,
    patrol_callsign: null,
    location: null,
    is_cancelled: false,
    district: null,
    event_type: null,
    road: null,
    shift_lead: null,
    responders: [],
    ...partial,
  }
}

describe('filterUnitEventsForList', () => {
  const events = [
    row({ id: 'a', status: 'done' }),
    row({ id: 'b', status: 'partial' }),
    row({ id: 'c', status: 'done' }),
  ]

  it('status only when searchIds is null', () => {
    expect(filterUnitEventsForList(events, { status: 'done', searchIds: null }).map((e) => e.id)).toEqual([
      'a',
      'c',
    ])
  })

  it('intersects status with search id set', () => {
    expect(
      filterUnitEventsForList(events, { status: 'done', searchIds: new Set(['a', 'b']) }).map((e) => e.id),
    ).toEqual(['a'])
  })

  it('empty searchIds yields no rows even if status would match', () => {
    expect(filterUnitEventsForList(events, { status: 'all', searchIds: new Set() })).toEqual([])
  })
})

describe('unit events list window', () => {
  it('defaults the table to the last 200 events', () => {
    expect(UNIT_EVENTS_LIST_LIMIT).toBe(200)
  })

  it('tells the user the window size and that search fetches older events', () => {
    expect(unitEventsListHint(200)).toBe(
      'מציג את 200 האירועים האחרונים. ניתן להשתמש בחיפוש לשליפת אירועים ישנים יותר',
    )
  })
})

describe('missingSearchEventIds', () => {
  it('returns search hits that are not already loaded', () => {
    expect(missingSearchEventIds(['a', 'b'], new Set(['b', 'c', 'd']))).toEqual(['c', 'd'])
  })

  it('returns empty when every hit is already loaded', () => {
    expect(missingSearchEventIds(['a', 'b'], new Set(['a']))).toEqual([])
  })
})

describe('mergeEventLists', () => {
  it('appends extras that are not already loaded and keeps event_date desc', () => {
    const loaded = [
      row({ id: 'new', status: 'done', event_date: '2026-08-10' }),
      row({ id: 'mid', status: 'done', event_date: '2026-08-05' }),
    ]
    const extras = [
      row({ id: 'old', status: 'done', event_date: '2026-07-01' }),
      row({ id: 'mid', status: 'partial', event_date: '2026-08-05' }),
    ]

    expect(mergeEventLists(loaded, extras).map((event) => event.id)).toEqual(['new', 'mid', 'old'])
  })
})
