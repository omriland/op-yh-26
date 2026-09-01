import { describe, expect, it } from 'vitest'
import {
  COCKPIT_AUTOSAVE_MS,
  COCKPIT_WINDOW_MS,
  canDeleteCockpitDraft,
  cockpitDeleteBlock,
  cockpitDeleteHint,
  cockpitEventMapPins,
  cockpitEventPinLabel,
  cockpitEventStillOpenOnMap,
  eventGeocodeQuery,
  geocodeCockpitEventPins,
  mergeCockpitEventPins,
  cockpitPinsMissingStoredCoords,
  cockpitNeighborId,
  cockpitReelDetail,
  cockpitReelLead,
  cockpitReelPlace,
  cockpitReelTitle,
  cockpitReelType,
  cockpitShortcut,
  cockpitWindowCountLabel,
  filterCockpitReel,
  formatCockpitAge,
  formatCockpitClock,
  isCockpitTypingTarget,
  isAbandonedEmptyCockpitItem,
  isInCockpitWindow,
} from './cockpit'

const NOW = new Date('2026-08-16T12:00:00.000Z')

function item(id: string, createdAt: string) {
  return { id, created_at: createdAt }
}

describe('cockpit window', () => {
  it('keeps events created within the last two hours', () => {
    expect(isInCockpitWindow('2026-08-16T10:00:00.000Z', NOW)).toBe(true)
    expect(isInCockpitWindow('2026-08-16T11:59:00.000Z', NOW)).toBe(true)
  })

  it('drops events older than two hours and future rows', () => {
    expect(isInCockpitWindow('2026-08-16T09:59:59.000Z', NOW)).toBe(false)
    expect(isInCockpitWindow('2026-08-16T12:00:01.000Z', NOW)).toBe(false)
  })

  it('sorts the גלגלת newest first', () => {
    const rows = filterCockpitReel(
      [
        item('old', '2026-08-16T10:10:00.000Z'),
        item('stale', '2026-08-16T09:00:00.000Z'),
        item('new', '2026-08-16T11:50:00.000Z'),
      ],
      NOW,
    )
    expect(rows.map((row) => row.id)).toEqual(['new', 'old'])
  })

  it('uses a two-hour window and 800ms autosave delay', () => {
    expect(COCKPIT_WINDOW_MS).toBe(2 * 60 * 60 * 1000)
    expect(COCKPIT_AUTOSAVE_MS).toBe(800)
  })
})

describe('cockpitReelTitle', () => {
  it('uses police event id, otherwise אירוע חדש', () => {
    expect(
      cockpitReelTitle({ police_event_id: '12345', event_type: { name: 'תאונה' } }),
    ).toBe('12345')
    expect(cockpitReelTitle({ police_event_id: '  ', event_type: { name: 'תאונה' } })).toBe(
      'אירוע חדש',
    )
    expect(cockpitReelTitle({ police_event_id: null, event_type: null })).toBe('אירוע חדש')
  })
})

describe('isAbandonedEmptyCockpitItem', () => {
  const blank = {
    status: 'draft' as const,
    is_cancelled: false,
    police_event_id: null,
    location: null,
    location_lat: null,
    location_lng: null,
    event_type: null,
    road: null,
    responders: [],
  }

  it('is true for a date-only cockpit insert', () => {
    expect(isAbandonedEmptyCockpitItem(blank)).toBe(true)
  })

  it('is false once type, road, location, or a כונן exists', () => {
    expect(isAbandonedEmptyCockpitItem({ ...blank, event_type: { name: 'תקוע' } })).toBe(false)
    expect(isAbandonedEmptyCockpitItem({ ...blank, responders: [{}] })).toBe(false)
  })
})

describe('cockpit reel details', () => {
  it('exposes event type and road · location separately', () => {
    const event = {
      police_event_id: '12345',
      event_type: { name: 'תאונה' },
      road: { name: 'כביש 20' },
      location: 'מחלף השלום',
    }
    expect(cockpitReelType(event)).toBe('תאונה')
    expect(cockpitReelPlace(event)).toBe('כביש 20 · מחלף השלום')
    expect(cockpitReelType({ event_type: null })).toBeNull()
    expect(cockpitReelPlace({ road: null, location: null })).toBeNull()
  })

  it('blocks delete only while responders are allocated', () => {
    expect(
      canDeleteCockpitDraft({
        responders: [],
      }),
    ).toBe(true)
    expect(
      cockpitDeleteBlock({
        responders: [{ id: 'r1' }],
      }),
    ).toBe('responders')
    expect(
      cockpitDeleteBlock({
        responders: [],
      }),
    ).toBeNull()
    expect(cockpitDeleteHint('responders')).toBe(
      'יש כוננים משובצים. הסירו אותם תחילה.',
    )
    expect(cockpitDeleteHint('confirm')).toBe('לחצו שוב למחיקה.')
  })

  it('returns אחמ״ש name and callsign when present', () => {
    expect(
      cockpitReelLead({
        shift_lead: { full_name: 'עמרי לנדמן', callsign: 'Admin' },
      }),
    ).toEqual({ full_name: 'עמרי לנדמן', callsign: 'Admin' })
    expect(cockpitReelLead({ shift_lead: null })).toBeNull()
    expect(cockpitReelLead({ shift_lead: { full_name: '  ', callsign: '  ' } })).toBeNull()
  })
})

describe('cockpitEventMapPins', () => {
  it('keeps only גלגלת events that have coordinates', () => {
    const pins = cockpitEventMapPins([
      {
        id: 'with-place',
        police_event_id: '12345',
        location: 'מחלף השלום',
        location_lat: 32.07,
        location_lng: 34.79,
        event_type: { name: 'תאונה' },
        road: { name: 'כביש 20' },
      },
      {
        id: 'no-place',
        police_event_id: '999',
        location: 'טקסט חופשי',
        location_lat: null,
        location_lng: null,
        event_type: null,
        road: null,
      },
    ])

    expect(pins).toEqual([
      {
        eventId: 'with-place',
        label: 'תאונה · 20 מחלף השלום',
        title: '12345 · תאונה · כביש 20 · מחלף השלום',
        lat: 32.07,
        lng: 34.79,
      },
    ])
  })

  it('hides events whose responders all have an end time', () => {
    const base = {
      police_event_id: '1',
      location: 'שורק',
      location_lat: 31.9,
      location_lng: 34.7,
      event_type: { name: 'תאונה' },
      road: { name: 'כביש 4' },
    }
    const pins = cockpitEventMapPins([
      {
        id: 'done',
        ...base,
        responders: [
          { ended_at: '2026-08-16T10:00:00.000Z' },
          { ended_at: '2026-08-16T10:05:00.000Z' },
        ],
      },
      {
        id: 'open',
        ...base,
        responders: [
          { ended_at: '2026-08-16T10:00:00.000Z' },
          { ended_at: null },
        ],
      },
    ])
    expect(pins.map((pin) => pin.eventId)).toEqual(['open'])
  })
})

describe('cockpitEventStillOpenOnMap', () => {
  it('keeps events with no responders or any responder still out', () => {
    expect(cockpitEventStillOpenOnMap({ responders: [] })).toBe(true)
    expect(cockpitEventStillOpenOnMap({ responders: [{ ended_at: null }] })).toBe(true)
    expect(
      cockpitEventStillOpenOnMap({
        responders: [{ ended_at: '2026-08-16T10:00:00.000Z' }],
      }),
    ).toBe(false)
  })
})

describe('cockpitEventPinLabel', () => {
  it('uses event type, road number, and location', () => {
    expect(
      cockpitEventPinLabel({
        event_type: { name: 'תאונה' },
        road: { name: 'כביש 4' },
        location: 'שורק',
      }),
    ).toBe('תאונה · 4 שורק')
  })
})

describe('eventGeocodeQuery', () => {
  it('puts the road number before the location', () => {
    expect(eventGeocodeQuery('כביש 20', 'מחלף השלום')).toBe('כביש 20 מחלף השלום')
    expect(eventGeocodeQuery('עירוני (101)', 'דיזנגוף')).toBe('כביש 101 דיזנגוף')
    expect(eventGeocodeQuery('עירוני', 'דיזנגוף')).toBe('עירוני דיזנגוף')
    expect(eventGeocodeQuery('כביש החוף', 'נתניה')).toBe('כביש החוף נתניה')
    expect(eventGeocodeQuery(null, 'הרצל 1 תל אביב')).toBe('הרצל 1 תל אביב')
    expect(eventGeocodeQuery('כביש 4', null)).toBe('כביש 4')
    expect(eventGeocodeQuery(null, null)).toBeNull()
  })
})

describe('geocodeCockpitEventPins', () => {
  it('looks up open events from current road and location even when coordinates exist', async () => {
    const queries: string[] = []
    const pins = await geocodeCockpitEventPins(
      [
        {
          id: 'known',
          police_event_id: '1',
          location: 'מחלף',
          location_lat: 32.1,
          location_lng: 34.8,
          event_type: null,
          road: { name: 'כביש 20' },
        },
        {
          id: 'lookup',
          police_event_id: '2',
          location: 'מחלף השלום',
          location_lat: null,
          location_lng: null,
          event_type: { name: 'תאונה' },
          road: { name: 'כביש 20' },
        },
        {
          id: 'empty',
          police_event_id: null,
          location: null,
          location_lat: null,
          location_lng: null,
          event_type: null,
          road: null,
        },
      ],
      async (query) => {
        queries.push(query)
        return { lat: 32.07, lng: 34.79 }
      },
    )

    expect(queries.sort()).toEqual(['כביש 20 מחלף', 'כביש 20 מחלף השלום'])
    expect(pins).toEqual(
      expect.arrayContaining([
        {
          eventId: 'known',
          label: '20 מחלף',
          title: '1 · כביש 20 · מחלף',
          lat: 32.07,
          lng: 34.79,
        },
        {
          eventId: 'lookup',
          label: 'תאונה · 20 מחלף השלום',
          title: '2 · תאונה · כביש 20 · מחלף השלום',
          lat: 32.07,
          lng: 34.79,
        },
      ]),
    )
    expect(pins).toHaveLength(2)
  })

  it('does not look up a human-locked pin and keeps stored coordinates', async () => {
    const queries: string[] = []
    const pins = await geocodeCockpitEventPins(
      [
        {
          id: 'locked',
          police_event_id: '3',
          location: 'מחלף',
          location_lat: 32.05,
          location_lng: 34.75,
          location_pin_source: 'shift_lead',
          event_type: { name: 'תאונה' },
          road: { name: 'כביש 20' },
        },
      ],
      async (query) => {
        queries.push(query)
        return { lat: 1, lng: 1 }
      },
    )

    expect(queries).toEqual([])
    expect(pins).toEqual([
      {
        eventId: 'locked',
        label: 'תאונה · 20 מחלף',
        title: '3 · תאונה · כביש 20 · מחלף',
        lat: 32.05,
        lng: 34.75,
      },
    ])
  })
})

describe('mergeCockpitEventPins', () => {
  it('lets a fresh Google lookup replace stored coordinates', () => {
    const stored = {
      eventId: 'e1',
      label: 'תאונה · 20 מחלף',
      title: '1',
      lat: 32.1,
      lng: 34.8,
    }
    const geocoded = {
      eventId: 'e1',
      label: 'תאונה · 4 שורק',
      title: '1',
      lat: 31.9,
      lng: 34.7,
    }
    expect(mergeCockpitEventPins([stored], [geocoded])).toEqual([geocoded])
  })

  it('keeps stored coordinates when Google has no match', () => {
    const stored = {
      eventId: 'e1',
      label: 'תאונה · 20 מחלף',
      title: '1',
      lat: 32.1,
      lng: 34.8,
    }
    expect(mergeCockpitEventPins([stored], [])).toEqual([stored])
  })
})

describe('cockpitPinsMissingStoredCoords', () => {
  it('returns highway events Google placed that still have no stored pin', () => {
    expect(
      cockpitPinsMissingStoredCoords(
        [
          {
            id: 'lookup',
            location: 'מחלף השלום',
            location_lat: null,
            location_lng: null,
            road: { name: 'כביש 20' },
          },
          {
            id: 'urban',
            location: 'דיזנגוף',
            location_lat: null,
            location_lng: null,
            road: { name: 'עירוני' },
          },
          {
            id: 'known',
            location: 'מחלף',
            location_lat: 32.1,
            location_lng: 34.8,
            road: { name: 'כביש 4' },
          },
        ],
        [
          { eventId: 'lookup', label: 'a', title: 'a', lat: 32.07, lng: 34.79 },
          { eventId: 'urban', label: 'b', title: 'b', lat: 32.08, lng: 34.78 },
        ],
      ),
    ).toEqual([{ eventId: 'lookup', lat: 32.07, lng: 34.79 }])
  })
})

describe('formatCockpitClock', () => {
  it('shows Jerusalem wall-clock time', () => {
    expect(formatCockpitClock('2026-08-16T10:05:00.000Z')).toBe('13:05')
  })
})

describe('formatCockpitAge', () => {
  it('says עכשיו under a minute', () => {
    expect(formatCockpitAge('2026-08-16T12:00:00.000Z', NOW)).toBe('עכשיו')
    expect(formatCockpitAge('2026-08-16T11:59:01.000Z', NOW)).toBe('עכשיו')
  })

  it('uses compact Hebrew minutes inside the two-hour window', () => {
    expect(formatCockpitAge('2026-08-16T11:59:00.000Z', NOW)).toBe('לפני דקה')
    expect(formatCockpitAge('2026-08-16T11:48:00.000Z', NOW)).toBe('לפני 12 דק׳')
    expect(formatCockpitAge('2026-08-16T10:30:00.000Z', NOW)).toBe('לפני 90 דק׳')
  })
})

describe('cockpitReelDetail', () => {
  it('joins type · road · location for a single scan line', () => {
    expect(
      cockpitReelDetail({
        event_type: { name: 'תאונה' },
        road: { name: 'כביש 20' },
        location: 'מחלף השלום',
      }),
    ).toBe('תאונה · כביש 20 · מחלף השלום')
    expect(
      cockpitReelDetail({
        event_type: { name: 'תאונה' },
        road: null,
        location: null,
      }),
    ).toBe('תאונה')
    expect(
      cockpitReelDetail({
        event_type: null,
        road: null,
        location: null,
      }),
    ).toBeNull()
  })
})

describe('cockpitWindowCountLabel', () => {
  it('shows how many events sit in the live window', () => {
    expect(cockpitWindowCountLabel(0)).toBe('0 בחלון')
    expect(cockpitWindowCountLabel(3)).toBe('3 בחלון')
  })
})

describe('cockpitNeighborId', () => {
  it('moves up to a newer row and down to an older one', () => {
    const ids = ['new', 'mid', 'old']
    expect(cockpitNeighborId(ids, 'mid', -1)).toBe('new')
    expect(cockpitNeighborId(ids, 'mid', 1)).toBe('old')
    expect(cockpitNeighborId(ids, 'new', -1)).toBe('new')
    expect(cockpitNeighborId(ids, 'old', 1)).toBe('old')
  })

  it('selects an end when nothing is current', () => {
    const ids = ['new', 'old']
    expect(cockpitNeighborId(ids, undefined, 1)).toBe('new')
    expect(cockpitNeighborId(ids, undefined, -1)).toBe('old')
    expect(cockpitNeighborId([], undefined, 1)).toBeUndefined()
  })
})

describe('cockpitShortcut', () => {
  const idle = {
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    repeat: false,
  }

  it('creates with KeyN, moves with arrows, and arms delete with Backspace', () => {
    expect(cockpitShortcut({ ...idle, key: 'נ', code: 'KeyN' }, false)).toEqual({
      type: 'create',
    })
    expect(cockpitShortcut({ ...idle, key: 'ArrowDown', code: 'ArrowDown' }, false)).toEqual({
      type: 'select',
      direction: 1,
    })
    expect(cockpitShortcut({ ...idle, key: 'ArrowUp', code: 'ArrowUp' }, false)).toEqual({
      type: 'select',
      direction: -1,
    })
    expect(cockpitShortcut({ ...idle, key: 'Backspace', code: 'Backspace' }, false)).toEqual({
      type: 'delete',
    })
  })

  it('ignores shortcuts while typing or with modifiers', () => {
    expect(cockpitShortcut({ ...idle, key: 'n', code: 'KeyN' }, true)).toBeNull()
    expect(
      cockpitShortcut({ ...idle, key: 'n', code: 'KeyN', metaKey: true }, false),
    ).toBeNull()
    expect(
      cockpitShortcut({ ...idle, key: 'n', code: 'KeyN', repeat: true }, false),
    ).toBeNull()
  })
})

describe('isCockpitTypingTarget', () => {
  it('treats fields and comboboxes as typing surfaces', () => {
    expect(isCockpitTypingTarget({ tagName: 'INPUT' })).toBe(true)
    expect(isCockpitTypingTarget({ tagName: 'TEXTAREA' })).toBe(true)
    expect(isCockpitTypingTarget({ tagName: 'SELECT' })).toBe(true)
    expect(isCockpitTypingTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true)
    expect(
      isCockpitTypingTarget({
        tagName: 'DIV',
        closest: (selector: string) => (selector.includes('combobox') ? {} : null),
      }),
    ).toBe(true)
    expect(isCockpitTypingTarget({ tagName: 'BUTTON', closest: () => null })).toBe(false)
    expect(isCockpitTypingTarget(null)).toBe(false)
  })
})
