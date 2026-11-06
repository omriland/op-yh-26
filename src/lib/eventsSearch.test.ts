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
    expect(EVENT_LIST_SELECT).toContain('event_secondary_leads')
    expect(EVENT_LIST_SELECT).toContain('profiles!events_last_saved_by_fkey')
    expect(EVENT_LIST_SELECT).toContain('frozen_over_60km')
    expect(EVENT_LIST_SELECT).toContain('frozen_suspicious_duplicate')
    expect(EVENT_LIST_SELECT).toContain('\n  shift_lead_id,')
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

  it('hides events born from a shift unless showShiftEvents is on', () => {
    const mixed = [
      row({ id: 'manual', status: 'done' }),
      row({ id: 'shift', status: 'done', origin: 'shift', shift_id: 's1' }),
    ]
    const ids = (showShiftEvents: boolean) =>
      filterUnitEventsForList(mixed, { status: 'all', searchIds: null, showShiftEvents }).map(
        (e) => e.id,
      )
    expect(ids(false)).toEqual(['manual'])
    expect(ids(true).sort()).toEqual(['manual', 'shift'])
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

describe('filterUnitEventsForList exact search match', () => {
  const person = (callsign: string) => ({ full_name: 'x', callsign })
  const responder = (callsign: string) =>
    ({ id: callsign, responder_id: callsign, profile: person(callsign) }) as EventListItem['responders'][number]
  const search = (events: EventListItem[], query: string, status: 'done' | 'all' = 'all') =>
    filterUnitEventsForList(events, {
      status,
      searchIds: new Set(events.map((event) => event.id)),
      query,
    })
      .map((event) => event.id)
      .sort()

  const fuzzyId = row({ id: 'fuzzy-id', status: 'done', police_event_id: '1336' })
  const exactId = row({ id: 'exact-id', status: 'done', police_event_id: '336' })

  it('an exact event number hides fuzzy results', () => {
    expect(search([fuzzyId, exactId], '336')).toEqual(['exact-id'])
  })

  it('an exact patrol callsign hides fuzzy results, whole or by its number', () => {
    const patrol = row({
      id: 'patrol',
      status: 'done',
      patrol_callsign: 'אביב 336',
      patrol_callsign_number: '336',
    })
    expect(search([fuzzyId, patrol], 'אביב 336')).toEqual(['patrol'])
    expect(search([fuzzyId, patrol], '336')).toEqual(['patrol'])
  })

  it('an exact person callsign hides fuzzy results: lead, secondary lead or responder', () => {
    const lead = row({ id: 'lead', status: 'done', shift_lead: person('336') })
    const secondary = row({
      id: 'secondary',
      status: 'done',
      secondary_leads: [{ user_id: 'u1', profile: person('336') }],
    })
    const crew = row({ id: 'crew', status: 'done', responders: [responder('336')] })
    const near = row({ id: 'near', status: 'done', responders: [responder('3360')] })
    expect(search([lead, secondary, crew, near], '336')).toEqual(['crew', 'lead', 'secondary'])
  })

  it('shows exact id, patrol number and person callsign matches together', () => {
    const crew = row({ id: 'crew', status: 'done', responders: [responder('336')] })
    const patrol = row({
      id: 'patrol',
      status: 'done',
      patrol_callsign: 'אביב 336',
      patrol_callsign_number: '336',
    })
    expect(search([crew, exactId, patrol, fuzzyId], '336')).toEqual(['crew', 'exact-id', 'patrol'])
  })

  it('shows every event sharing the exact value', () => {
    const second = row({ id: 'second', status: 'done', patrol_callsign: '336' })
    expect(search([fuzzyId, exactId, second], '336')).toEqual(['exact-id', 'second'])
  })

  it('keeps the fuzzy results when nothing matches exactly', () => {
    const other = row({ id: 'other', status: 'done', location: 'כביש 336' })
    expect(search([fuzzyId, other], '336')).toEqual(['fuzzy-id', 'other'])
  })

  it('ignores surrounding whitespace and letter case', () => {
    const latin = row({ id: 'latin', status: 'done', police_event_id: 'AB12' })
    const near = row({ id: 'near', status: 'done', police_event_id: 'AB123' })
    expect(search([fuzzyId, exactId], '  336 ')).toEqual(['exact-id'])
    expect(search([latin, near], ' ab12 ')).toEqual(['latin'])
  })

  it('a filtered-out exact match does not hide the fuzzy results', () => {
    const partialExact = row({ id: 'exact-partial', status: 'partial', police_event_id: '336' })
    expect(search([fuzzyId, partialExact], '336', 'done')).toEqual(['fuzzy-id'])
  })

  it('does not narrow when the search failed and searchIds is null', () => {
    const rows = filterUnitEventsForList([fuzzyId, exactId], { status: 'all', searchIds: null, query: '336' })
    expect(rows).toHaveLength(2)
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
