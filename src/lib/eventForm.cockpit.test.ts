import { describe, expect, it } from 'vitest'
import {
  canPersistEventDraft,
  emptyEventDraft,
  eventForeignIds,
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
