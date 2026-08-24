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
      location_pin_source: 'places',
      location_pinned_at: null,
      location_pinned_by: null,
    })
  })

  it('stores a human-corrected pin without a Google place id', () => {
    expect(
      buildLocationPayload(
        draft({
          location: 'מחלף השלום',
          location_place_id: null,
          location_lat: 32.07,
          location_lng: 34.79,
          location_pin_source: 'shift_lead',
          location_pinned_at: '2026-08-24T07:00:00.000Z',
          location_pinned_by: 'lead-1',
        }),
      ),
    ).toEqual({
      location: 'מחלף השלום',
      location_place_id: null,
      location_lat: 32.07,
      location_lng: 34.79,
      location_pin_source: 'shift_lead',
      location_pinned_at: '2026-08-24T07:00:00.000Z',
      location_pinned_by: 'lead-1',
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
      location_pin_source: null,
      location_pinned_at: null,
      location_pinned_by: null,
    })
  })

  it('nulls place fields when location empty unless a human pin is locked', () => {
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
      location_pin_source: null,
      location_pinned_at: null,
      location_pinned_by: null,
    })
  })

  it('keeps a locked pin even if location text is empty', () => {
    expect(
      buildLocationPayload(
        draft({
          location: '  ',
          location_place_id: null,
          location_lat: 32.07,
          location_lng: 34.79,
          location_pin_source: 'shift_lead',
          location_pinned_at: '2026-08-24T07:00:00.000Z',
          location_pinned_by: 'lead-1',
        }),
      ),
    ).toEqual({
      location: null,
      location_place_id: null,
      location_lat: 32.07,
      location_lng: 34.79,
      location_pin_source: 'shift_lead',
      location_pinned_at: '2026-08-24T07:00:00.000Z',
      location_pinned_by: 'lead-1',
    })
  })
})
