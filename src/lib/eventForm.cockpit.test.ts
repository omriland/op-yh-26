import { afterEach, describe, expect, it } from 'vitest'
import {
  COCKPIT_IDENTITY_DRAFT_WARNING,
  POLICE_EVENT_ID_DUPLICATE_ERROR,
  canPersistEventDraft,
  cockpitIdentityDraftWarning,
  eventCreateBlockedMessage,
  cockpitPoliceEventIdCollides,
  discardAbandonedEmptyEventIfAny,
  emptyEventDraft,
  eventForeignIds,
  eventLacksRequiredIdentity,
  isAbandonedEmptyEventDraft,
  isMissingBusLaneColumn,
  mountedEventIsAbandonedEmpty,
  mountedEventIsKeptFromAbandon,
  policeEventIdForCockpitSave,
  registerAbandonedEmptyEventHandler,
  sameDayPoliceEventIdCollides,
  type EventFormDraft,
  type LookupOption,
} from './eventForm'

function draft(partial: Partial<EventFormDraft> = {}): EventFormDraft {
  return {
    ...emptyEventDraft({ full_name: 'א', callsign: '1' }),
    ...partial,
  }
}

const districts: LookupOption[] = [
  { id: 'sys', name: 'תחנה / אחר / משוכפל', code: 'station_other_duplicated' },
]

describe('canPersistEventDraft', () => {
  it('blocks an empty create unless the cockpit allows a partial draft', () => {
    const empty = draft()
    expect(canPersistEventDraft(empty, districts)).toMatchObject({
      event_type_id: 'יש לבחור סוג אירוע.',
      road_id: 'יש לבחור כביש.',
    })
    expect(canPersistEventDraft(empty, districts, { allowPartial: true })).toEqual({})
  })

  it('still requires a date even for a cockpit draft', () => {
    expect(
      canPersistEventDraft(draft({ event_date: '' }), districts, { allowPartial: true }),
    ).toEqual({ event_date: 'יש לבחור תאריך.' })
  })
})

describe('eventForeignIds', () => {
  it('sends null type/road for a partial cockpit draft', () => {
    expect(eventForeignIds(draft(), { allowPartial: true })).toEqual({
      event_type_id: null,
      road_id: null,
      district_id: null,
    })
  })
})

describe('isAbandonedEmptyEventDraft', () => {
  it('treats a default new form as abandoned', () => {
    const empty = draft()
    expect(isAbandonedEmptyEventDraft(empty, empty.event_date)).toBe(true)
  })

  it('keeps the event after a typed field, date change, pin, or assigned כונן', () => {
    const empty = draft()
    expect(isAbandonedEmptyEventDraft(draft({ police_event_id: '1' }), empty.event_date)).toBe(
      false,
    )
    expect(isAbandonedEmptyEventDraft(draft({ event_date: '2026-01-01' }), empty.event_date)).toBe(
      false,
    )
    expect(
      isAbandonedEmptyEventDraft(draft({ location_lat: 32.1, location_lng: 34.8 }), empty.event_date),
    ).toBe(false)
    expect(isAbandonedEmptyEventDraft(draft({ bus_lane: true }), empty.event_date)).toBe(false)
    expect(
      isAbandonedEmptyEventDraft(
        draft({
          responders: [
            {
              key: 'r1',
              responder_id: 'u1',
              full_name: 'א',
              callsign: '1',
              start_time: '',
              end_time: '',
              total_km: '',
              emergency_means: false,
              treated: [],
              status: 'pending',
              hasOwnedData: false,
              expanded: false,
              hasVehicle: true,
            },
          ],
        }),
        empty.event_date,
      ),
    ).toBe(false)
  })

  it('keeps the event after a create-time main transfer or a secondary אחמ״ש', () => {
    const empty = draft()
    expect(
      isAbandonedEmptyEventDraft(
        draft({ shift_lead_id: 'other-lead' }),
        empty.event_date,
        'creator',
      ),
    ).toBe(false)
    expect(
      isAbandonedEmptyEventDraft(
        draft({
          secondary_leads: [
            {
              user_id: 'other-lead',
              locked: false,
              full_name: 'דנה',
              callsign: 'D1',
            },
          ],
        }),
        empty.event_date,
        'creator',
      ),
    ).toBe(false)
  })
})

describe('discardAbandonedEmptyEventIfAny', () => {
  afterEach(() => {
    registerAbandonedEmptyEventHandler(null)
  })

  it('returns whether the mounted form discarded, and peek treats a date edit as kept', async () => {
    expect(await discardAbandonedEmptyEventIfAny()).toBe(false)
    expect(mountedEventIsKeptFromAbandon()).toBe(false)

    registerAbandonedEmptyEventHandler(
      async () => false,
      () => false,
    )
    expect(await discardAbandonedEmptyEventIfAny()).toBe(false)
    expect(mountedEventIsKeptFromAbandon()).toBe(true)

    registerAbandonedEmptyEventHandler(
      async () => true,
      () => true,
    )
    expect(await discardAbandonedEmptyEventIfAny()).toBe(true)
    expect(mountedEventIsKeptFromAbandon()).toBe(false)
  })

  it('treats a missing peek as not-empty so Create will insert, not reuse', () => {
    expect(mountedEventIsAbandonedEmpty()).toBe(false)
    registerAbandonedEmptyEventHandler(
      async () => false,
      () => false,
    )
    expect(mountedEventIsAbandonedEmpty()).toBe(false)
    registerAbandonedEmptyEventHandler(
      async () => true,
      () => true,
    )
    expect(mountedEventIsAbandonedEmpty()).toBe(true)
  })
})

describe('eventLacksRequiredIdentity', () => {
  it('is a cockpit draft until תאריך, כביש, and סוג אירוע are all set', () => {
    expect(eventLacksRequiredIdentity(draft())).toBe(true)
    expect(eventLacksRequiredIdentity(draft({ event_date: '2026-09-03' }))).toBe(true)
    expect(
      eventLacksRequiredIdentity(draft({ event_date: '2026-09-03', road_id: 'r1' })),
    ).toBe(true)
    expect(
      eventLacksRequiredIdentity(
        draft({ event_date: '2026-09-03', event_type_id: 't1' }),
      ),
    ).toBe(true)
    expect(
      eventLacksRequiredIdentity(
        draft({ event_date: '2026-09-03', road_id: 'r1', event_type_id: 't1' }),
      ),
    ).toBe(false)
  })

  it('does not require מיקום or מספר אירוע to leave draft', () => {
    expect(
      eventLacksRequiredIdentity(
        draft({
          event_date: '2026-09-03',
          road_id: 'r1',
          event_type_id: 't1',
          location: '',
          police_event_id: '',
        }),
      ),
    ).toBe(false)
  })
})

describe('cockpitIdentityDraftWarning', () => {
  it('names what is still missing, with חסר / חסרים', () => {
    expect(
      cockpitIdentityDraftWarning(draft({ event_date: '', event_type_id: '', road_id: '' })),
    ).toBe('האירוע בטיוטה')
    expect(COCKPIT_IDENTITY_DRAFT_WARNING).toBe('האירוע בטיוטה')
    expect(cockpitIdentityDraftWarning(draft({ event_date: '2026-09-03' }))).toBe(
      'חסרים סוג וכביש',
    )
    expect(
      cockpitIdentityDraftWarning(draft({ event_date: '2026-09-03', event_type_id: 't1' })),
    ).toBe('חסר כביש')
    expect(
      cockpitIdentityDraftWarning(draft({ event_date: '2026-09-03', road_id: 'r1' })),
    ).toBe('חסר סוג')
    expect(
      cockpitIdentityDraftWarning(
        draft({ event_date: '', event_type_id: 't1', road_id: 'r1' }),
      ),
    ).toBe('חסר תאריך')
    expect(
      cockpitIdentityDraftWarning(
        draft({ event_date: '', event_type_id: '', road_id: 'r1' }),
      ),
    ).toBe('חסרים תאריך וסוג')
    expect(
      cockpitIdentityDraftWarning(
        draft({ event_date: '2026-09-03', road_id: 'r1', event_type_id: 't1' }),
      ),
    ).toBeNull()
  })
})

describe('eventCreateBlockedMessage', () => {
  it('lists only the fields that are actually missing', () => {
    expect(eventCreateBlockedMessage({ event_date: 'x', event_type_id: 'x', road_id: 'x' })).toBe(
      'יש למלא תאריך, סוג אירוע וכביש כדי ליצור אירוע.',
    )
    expect(eventCreateBlockedMessage({ event_type_id: 'x', road_id: 'x' })).toBe(
      'יש למלא סוג אירוע וכביש כדי ליצור אירוע.',
    )
    expect(eventCreateBlockedMessage({ road_id: 'x' })).toBe(
      'יש למלא כביש כדי ליצור אירוע.',
    )
    expect(eventCreateBlockedMessage({ event_type_id: 'x' })).toBe(
      'יש למלא סוג אירוע כדי ליצור אירוע.',
    )
    expect(eventCreateBlockedMessage({ event_date: 'x' })).toBe(
      'יש למלא תאריך כדי ליצור אירוע.',
    )
    expect(eventCreateBlockedMessage({ event_date: 'x', road_id: 'x' })).toBe(
      'יש למלא תאריך וכביש כדי ליצור אירוע.',
    )
    expect(
      eventCreateBlockedMessage({
        event_date: 'x',
        event_type_id: 'x',
        road_id: 'x',
        location: 'x',
      }),
    ).toBe('יש למלא תאריך, סוג אירוע, כביש ומיקום כדי ליצור אירוע.')
    expect(eventCreateBlockedMessage({ location: 'x' })).toBe(
      'יש למלא מיקום כדי ליצור אירוע.',
    )
  })
})

describe('sameDayPoliceEventIdCollides', () => {
  const existing = [
    {
      id: 'evt-1',
      event_date: '2026-09-03',
      police_event_id: '12345',
      is_cancelled: false,
    },
    {
      id: 'evt-cancelled',
      event_date: '2026-09-03',
      police_event_id: '99999',
      is_cancelled: true,
    },
  ]

  it('blocks the same מספר אירוע on the same תאריך', () => {
    expect(
      sameDayPoliceEventIdCollides({
        eventDate: '2026-09-03',
        policeEventId: '12345',
        currentEventId: 'evt-new',
        existing,
      }),
    ).toBe(true)
    expect(
      sameDayPoliceEventIdCollides({
        eventDate: '2026-09-03',
        policeEventId: '12-345',
        currentEventId: 'evt-new',
        existing,
      }),
    ).toBe(true)
  })

  it('allows the same number on another day, an empty number, and the current row', () => {
    expect(
      sameDayPoliceEventIdCollides({
        eventDate: '2026-09-04',
        policeEventId: '12345',
        currentEventId: 'evt-new',
        existing,
      }),
    ).toBe(false)
    expect(
      sameDayPoliceEventIdCollides({
        eventDate: '2026-09-03',
        policeEventId: '',
        currentEventId: 'evt-new',
        existing,
      }),
    ).toBe(false)
    expect(
      sameDayPoliceEventIdCollides({
        eventDate: '2026-09-03',
        policeEventId: '12345',
        currentEventId: 'evt-1',
        existing,
      }),
    ).toBe(false)
  })

  it('ignores cancelled events so a number can be reused', () => {
    expect(
      sameDayPoliceEventIdCollides({
        eventDate: '2026-09-03',
        policeEventId: '99999',
        currentEventId: 'evt-new',
        existing,
      }),
    ).toBe(false)
  })

  it('uses a Hebrew field error and keeps the last saved number', () => {
    expect(POLICE_EVENT_ID_DUPLICATE_ERROR).toBe(
      'כבר קיים אירוע עם המספר הזה באותו תאריך.',
    )
    expect(
      policeEventIdForCockpitSave({
        typed: '12345',
        lastSaved: '111',
        collides: true,
      }),
    ).toBe('111')
    expect(
      policeEventIdForCockpitSave({
        typed: '12345',
        lastSaved: '',
        collides: true,
      }),
    ).toBe('')
    expect(
      policeEventIdForCockpitSave({
        typed: '12345',
        lastSaved: '111',
        collides: false,
      }),
    ).toBe('12345')
    expect(
      policeEventIdForCockpitSave({
        typed: '12345',
        lastSaved: '12345',
        collides: true,
      }),
    ).toBe('')
  })
})

describe('cockpitPoliceEventIdCollides', () => {
  it('loads same-day rows and applies the collision rule', async () => {
    const loadRows = async () => [
      {
        id: 'evt-1',
        event_date: '2026-09-03',
        police_event_id: '12345',
        is_cancelled: false,
      },
    ]
    expect(
      await cockpitPoliceEventIdCollides(
        {
          eventDate: '2026-09-03',
          policeEventId: '12345',
          currentEventId: 'evt-new',
        },
        loadRows,
      ),
    ).toBe(true)
    expect(
      await cockpitPoliceEventIdCollides(
        {
          eventDate: '2026-09-03',
          policeEventId: '   ',
          currentEventId: 'evt-new',
        },
        loadRows,
      ),
    ).toBe(false)
  })
})

describe('isMissingBusLaneColumn', () => {
  it('detects PostgREST missing-column errors for events.bus_lane', () => {
    expect(isMissingBusLaneColumn({ code: '42703', message: 'column events.bus_lane does not exist' })).toBe(
      true,
    )
    expect(isMissingBusLaneColumn({ code: 'PGRST204', message: "Could not find the 'bus_lane' column of 'events'" })).toBe(
      true,
    )
    expect(isMissingBusLaneColumn({ code: '42501', message: 'permission denied' })).toBe(false)
  })
})
