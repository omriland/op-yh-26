import { describe, expect, it } from 'vitest'
import {
  EVENT_LIST_SELECT,
  UNIT_EVENTS_LIST_LIMIT,
  UNIT_EVENTS_RECENT_EMPTY_TITLE,
  UNIT_EVENTS_WINDOW_DAYS,
  filterUnitEventsForList,
  mergeEventLists,
  missingSearchEventIds,
  partitionUnitEventsByWindow,
  unitEventsListHint,
  unitEventsWindowStart,
  type EventListItem,
} from './events'

function row(partial: Partial<EventListItem> & Pick<EventListItem, 'id' | 'status'>): EventListItem {
  return {
    event_date: '2026-08-01',
    police_event_id: null,
    patrol_callsign: null,
    location: null,
    is_cancelled: false,
    origin: 'manual',
    shift_id: null,
    treatment_detail: null,
    treatment_notes: null,
    emergency_means: false,
    district: null,
    event_type: null,
    road: null,
    shift_lead: null,
    last_saved: null,
    shift: null,
    shared_treated: [],
    responders: [],
    ...partial,
  }
}

describe('EVENT_LIST_SELECT embeds', () => {
  it('hints both profile FKs so PostgREST does not return 300', () => {
    expect(EVENT_LIST_SELECT).toContain('profiles!events_shift_lead_id_fkey')
    expect(EVENT_LIST_SELECT).toContain('profiles!events_last_saved_by_fkey')
    expect(EVENT_LIST_SELECT).toContain('frozen_over_60km')
    expect(EVENT_LIST_SELECT).toContain('frozen_suspicious_duplicate')
    expect(EVENT_LIST_SELECT).not.toMatch(/shift_lead:profiles\(/)
  })
})

describe('filterUnitEventsForList', () => {
  const events = [
    row({ id: 'a', status: 'done' }),
    row({ id: 'b', status: 'partial' }),
    row({ id: 'c', status: 'done' }),
  ]

  it('status only when searchIds is null', () => {
    expect(filterUnitEventsForList(events, { status: 'done', searchIds: null }).map((e) => e.id)).toEqual([
      'c',
      'a',
    ])
  })

  it('intersects status with search id set', () => {
    expect(
      filterUnitEventsForList(events, { status: 'done', searchIds: new Set(['a', 'b']) }).map((e) => e.id),
    ).toEqual(['a'])
  })

  it('sorts matching rows by event_date descending', () => {
    const shuffled = [
      row({ id: 'old', status: 'done', event_date: '2026-07-15' }),
      row({ id: 'new', status: 'done', event_date: '2026-09-01' }),
      row({ id: 'mid', status: 'done', event_date: '2026-08-10' }),
    ]
    expect(filterUnitEventsForList(shuffled, { status: 'all', searchIds: null }).map((e) => e.id)).toEqual([
      'new',
      'mid',
      'old',
    ])
  })

  it('empty searchIds yields no rows even if status would match', () => {
    expect(filterUnitEventsForList(events, { status: 'all', searchIds: new Set() })).toEqual([])
  })
})

describe('unit events list window', () => {
  it('keeps a fetch cap and defaults the visible list to 30 days', () => {
    expect(UNIT_EVENTS_LIST_LIMIT).toBe(200)
    expect(UNIT_EVENTS_WINDOW_DAYS).toBe(30)
    expect(UNIT_EVENTS_RECENT_EMPTY_TITLE).toBe('לא נמצאו אירועים מ-30 הימים האחרונים')
  })

  it('tells the user the window size and that search fetches older events', () => {
    expect(unitEventsListHint(30)).toBe(
      'מציג אירועים מ-30 הימים האחרונים. ניתן להשתמש בחיפוש לשליפת אירועים ישנים יותר',
    )
  })

  it('looks back 30 days per loaded window', () => {
    expect(unitEventsWindowStart('2026-09-01', 1)).toBe('2026-08-02')
    expect(unitEventsWindowStart('2026-09-01', 2)).toBe('2026-07-03')
  })

  it('shows only the current window, newest event_date first, and flags older loaded rows', () => {
    const events = [
      row({ id: 'old', status: 'done', event_date: '2026-07-15' }),
      row({ id: 'today', status: 'done', event_date: '2026-09-01' }),
      row({ id: 'recent', status: 'done', event_date: '2026-08-10' }),
    ]

    const first = partitionUnitEventsByWindow(events, {
      dateOf: (event) => event.event_date,
      today: '2026-09-01',
      windowsLoaded: 1,
    })
    expect(first.visible.map((event) => event.id)).toEqual(['today', 'recent'])
    expect(first.hasMore).toBe(true)

    const second = partitionUnitEventsByWindow(events, {
      dateOf: (event) => event.event_date,
      today: '2026-09-01',
      windowsLoaded: 2,
    })
    expect(second.visible.map((event) => event.id)).toEqual(['today', 'recent', 'old'])
    expect(second.hasMore).toBe(false)
  })

  it('keeps future-dated events in the default window', () => {
    const events = [row({ id: 'tomorrow', status: 'draft', event_date: '2026-09-02' })]
    const result = partitionUnitEventsByWindow(events, {
      dateOf: (event) => event.event_date,
      today: '2026-09-01',
      windowsLoaded: 1,
    })
    expect(result.visible.map((event) => event.id)).toEqual(['tomorrow'])
    expect(result.hasMore).toBe(false)
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
