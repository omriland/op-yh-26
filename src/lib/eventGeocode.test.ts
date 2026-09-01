import { describe, expect, it } from 'vitest'
import {
  applyAutoGeocodeToLocationPayload,
  eventNeedsPersistedGeocode,
} from './eventGeocode'

const highway = {
  location: 'מחלף השלום',
  location_lat: null as number | null,
  location_lng: null as number | null,
  location_pin_source: null as string | null,
  roadName: 'כביש 20',
  placesAssisted: false,
}

describe('eventNeedsPersistedGeocode', () => {
  it('asks Google for a highway event with text and no pin', () => {
    expect(eventNeedsPersistedGeocode(highway)).toBe(true)
  })

  it('skips עירוני even with location text and no pin', () => {
    expect(
      eventNeedsPersistedGeocode({
        ...highway,
        roadName: 'עירוני',
        placesAssisted: true,
      }),
    ).toBe(false)
    expect(
      eventNeedsPersistedGeocode({
        ...highway,
        roadName: 'עירוני',
        placesAssisted: false,
      }),
    ).toBe(false)
  })

  it('skips Places-assisted שלוחה events', () => {
    expect(eventNeedsPersistedGeocode({ ...highway, placesAssisted: true })).toBe(false)
  })

  it('skips when a pin already exists or is human-locked', () => {
    expect(
      eventNeedsPersistedGeocode({
        ...highway,
        location_lat: 32.07,
        location_lng: 34.79,
      }),
    ).toBe(false)
    expect(
      eventNeedsPersistedGeocode({
        ...highway,
        location_pin_source: 'shift_lead',
        location_lat: 32.07,
        location_lng: 34.79,
      }),
    ).toBe(false)
  })

  it('skips when there is nothing to look up', () => {
    expect(
      eventNeedsPersistedGeocode({
        ...highway,
        location: '  ',
        roadName: null,
      }),
    ).toBe(false)
  })
})

describe('applyAutoGeocodeToLocationPayload', () => {
  it('writes a geocode pin onto a payload with no coords', () => {
    expect(
      applyAutoGeocodeToLocationPayload(
        {
          location: 'מחלף השלום',
          location_place_id: null,
          location_lat: null,
          location_lng: null,
          location_pin_source: null,
          location_pinned_at: null,
          location_pinned_by: null,
        },
        { lat: 32.07, lng: 34.79 },
      ),
    ).toEqual({
      location: 'מחלף השלום',
      location_place_id: null,
      location_lat: 32.07,
      location_lng: 34.79,
      location_pin_source: 'geocode',
      location_pinned_at: null,
      location_pinned_by: null,
    })
  })

  it('does not overwrite existing coords', () => {
    const payload = {
      location: 'מחלף',
      location_place_id: 'ChIJx',
      location_lat: 32.1,
      location_lng: 34.8,
      location_pin_source: 'places' as const,
      location_pinned_at: null,
      location_pinned_by: null,
    }
    expect(applyAutoGeocodeToLocationPayload(payload, { lat: 1, lng: 1 })).toEqual(payload)
  })
})
