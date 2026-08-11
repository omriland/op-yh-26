import { describe, expect, it } from 'vitest'
import {
  buildLocationPayload,
  emptyEventDraft,
  validateEventMinimum,
  type EventFormDraft,
  type LookupOption,
} from './eventForm'
import { LOCATION_REQUIRED_ERROR } from './systemDistricts'

function draft(partial: Partial<EventFormDraft> = {}): EventFormDraft {
  return {
    ...emptyEventDraft({ full_name: 'א', callsign: '1' }),
    event_type_id: 't1',
    road_id: 'r1',
    ...partial,
  }
}

const districts: LookupOption[] = [
  { id: 'sys', name: 'תחנה / אחר / משוכפל', code: 'station_other_duplicated' },
  { id: 'north', name: 'צפון', code: null },
]

describe('validateEventMinimum location', () => {
  it('requires location for system שלוחה', () => {
    const errors = validateEventMinimum(draft({ district_id: 'sys', location: '' }), districts)
    expect(errors.location).toBe(LOCATION_REQUIRED_ERROR)
  })

  it('does not require location for normal שלוחה', () => {
    const errors = validateEventMinimum(draft({ district_id: 'north', location: '' }), districts)
    expect(errors.location).toBeUndefined()
  })

  it('passes when system שלוחה has location text', () => {
    const errors = validateEventMinimum(
      draft({ district_id: 'sys', location: 'תחנת ראשון' }),
      districts,
    )
    expect(errors.location).toBeUndefined()
  })
})

describe('buildLocationPayload', () => {
  it('stores place fields for a Google pick', () => {
    expect(
      buildLocationPayload(
        draft({
          location: 'צומת גלילות',
          location_place_id: 'ChIJx',
          location_lat: 32.1,
          location_lng: 34.8,
        }),
      ),
    ).toEqual({
      location: 'צומת גלילות',
      location_place_id: 'ChIJx',
      location_lat: 32.1,
      location_lng: 34.8,
    })
  })

  it('clears place fields for free-text', () => {
    expect(
      buildLocationPayload(
        draft({
          location: 'משהו לא רשמי',
          location_place_id: null,
          location_lat: null,
          location_lng: null,
        }),
      ),
    ).toEqual({
      location: 'משהו לא רשמי',
      location_place_id: null,
      location_lat: null,
      location_lng: null,
    })
  })

  it('nulls everything when location empty', () => {
    expect(
      buildLocationPayload(
        draft({
          location: '  ',
          location_place_id: 'ChIJx',
          location_lat: 1,
          location_lng: 2,
        }),
      ),
    ).toEqual({
      location: null,
      location_place_id: null,
      location_lat: null,
      location_lng: null,
    })
  })
})
