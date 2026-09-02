import { describe, expect, it } from 'vitest'
import {
  canPersistEventDraft,
  emptyEventDraft,
  eventForeignIds,
  isAbandonedEmptyEventDraft,
  isMissingBusLaneColumn,
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
