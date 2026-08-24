import { describe, expect, it } from 'vitest'
import {
  applyLeadMapPin,
  applyLocationFieldChange,
  clearLockedLocationPin,
  formatLocationCoords,
  locationPinIsLocked,
} from './locationPin'

describe('locationPinIsLocked', () => {
  it('locks human-corrected pins so Google must not move them', () => {
    expect(locationPinIsLocked('shift_lead')).toBe(true)
    expect(locationPinIsLocked('responder')).toBe(true)
    expect(locationPinIsLocked('places')).toBe(false)
    expect(locationPinIsLocked('geocode')).toBe(false)
    expect(locationPinIsLocked(null)).toBe(false)
  })
})

describe('formatLocationCoords', () => {
  it('formats a copyable lat, lng pair', () => {
    expect(formatLocationCoords(32.0741234, 34.7920199)).toBe('32.07412, 34.79202')
  })
})

describe('applyLeadMapPin', () => {
  it('writes coords and locks without touching location text', () => {
    expect(
      applyLeadMapPin(
        {
          location: 'מחלף השלום',
          location_place_id: 'ChIJx',
          location_lat: 32.1,
          location_lng: 34.8,
          location_pin_source: 'places',
          location_pinned_at: null,
          location_pinned_by: null,
        },
        { lat: 32.07, lng: 34.79, userId: 'lead-1', at: '2026-08-24T07:00:00.000Z' },
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
})

describe('applyLocationFieldChange', () => {
  it('keeps a locked pin when the location text is edited', () => {
    const locked = {
      location: 'מחלף',
      location_place_id: null,
      location_lat: 32.07,
      location_lng: 34.79,
      location_pin_source: 'shift_lead' as const,
      location_pinned_at: '2026-08-24T07:00:00.000Z',
      location_pinned_by: 'lead-1',
    }
    expect(
      applyLocationFieldChange(locked, {
        location: 'מחלף השלום צפון',
        location_place_id: null,
        location_lat: null,
        location_lng: null,
      }),
    ).toEqual({
      ...locked,
      location: 'מחלף השלום צפון',
    })
  })

  it('replaces a locked pin when the user picks a Google place', () => {
    expect(
      applyLocationFieldChange(
        {
          location: 'מחלף',
          location_place_id: null,
          location_lat: 32.07,
          location_lng: 34.79,
          location_pin_source: 'shift_lead',
          location_pinned_at: '2026-08-24T07:00:00.000Z',
          location_pinned_by: 'lead-1',
        },
        {
          location: 'צומת גלילות',
          location_place_id: 'ChIJx',
          location_lat: 32.14,
          location_lng: 34.81,
        },
      ),
    ).toEqual({
      location: 'צומת גלילות',
      location_place_id: 'ChIJx',
      location_lat: 32.14,
      location_lng: 34.81,
      location_pin_source: 'places',
      location_pinned_at: null,
      location_pinned_by: null,
    })
  })
})

describe('clearLockedLocationPin', () => {
  it('drops coords so Google can place the event again', () => {
    expect(
      clearLockedLocationPin({
        location: 'מחלף השלום',
        location_place_id: null,
        location_lat: 32.07,
        location_lng: 34.79,
        location_pin_source: 'shift_lead',
        location_pinned_at: '2026-08-24T07:00:00.000Z',
        location_pinned_by: 'lead-1',
      }),
    ).toEqual({
      location: 'מחלף השלום',
      location_place_id: null,
      location_lat: null,
      location_lng: null,
      location_pin_source: null,
      location_pinned_at: null,
      location_pinned_by: null,
    })
  })
})
