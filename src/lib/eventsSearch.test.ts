import { describe, expect, it } from 'vitest'
import { filterUnitEventsForList, type EventListItem } from './events'

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
