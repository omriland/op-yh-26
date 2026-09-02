import { describe, expect, it } from 'vitest'
import {
  applyEventLocationPlace,
  EVENT_LOCATIONS_SELECT,
  eventLocationIsMissing,
  eventLocationPlaceFields,
  eventLocationPlacesPatch,
  isEventLocationQueueItem,
  locationPinSourceHint,
  type EventLocationRow,
} from './eventLocationsQueue'

function row(overrides: Partial<EventLocationRow> = {}): EventLocationRow {
  return {
    id: 'evt-1',
    event_date: '2026-09-02',
    created_at: '2026-09-02T10:00:00Z',
    police_event_id: '12345',
    location: 'מחלף השלום',
    location_place_id: null,
    location_lat: 32.08,
    location_lng: 34.78,
    location_pin_source: 'geocode',
    status: 'done',
    is_cancelled: false,
    bus_lane: false,
    road: { name: 'כביש 20' },
    event_type: { name: 'תקוע' },
    shift_lead: { full_name: 'אחמ״ש', callsign: 'A1' },
    responders: [{ id: 'r1' }],
    ...overrides,
  }
}

describe('eventLocationIsMissing', () => {
  it('is missing when either stored coord is null', () => {
    expect(eventLocationIsMissing({ location_lat: null, location_lng: 34.8 })).toBe(true)
    expect(eventLocationIsMissing({ location_lat: 32.1, location_lng: null })).toBe(true)
    expect(eventLocationIsMissing({ location_lat: null, location_lng: null })).toBe(true)
  })

  it('is not missing when coords exist even without a place_id', () => {
    expect(
      eventLocationIsMissing({
        location_lat: 32.08,
        location_lng: 34.78,
      }),
    ).toBe(false)
    expect(eventLocationIsMissing(row({ location_place_id: null }))).toBe(false)
  })

  it('treats geocode and cockpit pins with coords as present, not missing', () => {
    expect(eventLocationIsMissing(row({ location_pin_source: 'geocode' }))).toBe(false)
    expect(
      eventLocationIsMissing(
        row({ location_pin_source: 'shift_lead', location_place_id: null }),
      ),
    ).toBe(false)
    expect(
      eventLocationIsMissing(
        row({ location_pin_source: 'responder', location_place_id: null }),
      ),
    ).toBe(false)
  })
})

describe('isEventLocationQueueItem', () => {
  it('drops cancelled events and empty cockpit drafts', () => {
    expect(isEventLocationQueueItem(row({ is_cancelled: true }))).toBe(false)
    expect(
      isEventLocationQueueItem(
        row({
          status: 'draft',
          police_event_id: null,
          location: null,
          location_lat: null,
          location_lng: null,
          event_type: null,
          road: null,
          responders: [],
        }),
      ),
    ).toBe(false)
  })

  it('keeps real events including drafts that already have content', () => {
    expect(isEventLocationQueueItem(row())).toBe(true)
    expect(
      isEventLocationQueueItem(
        row({
          status: 'draft',
          police_event_id: '99',
          location_lat: null,
          location_lng: null,
        }),
      ),
    ).toBe(true)
  })
})

describe('eventLocationPlacesPatch', () => {
  it('writes pin fields only and never location or road', () => {
    const patch = eventLocationPlacesPatch({
      location: 'איילון צפון, תל אביב',
      location_place_id: 'ChIJabc',
      location_lat: 32.1,
      location_lng: 34.8,
    })
    expect(patch).toEqual({
      location_place_id: 'ChIJabc',
      location_lat: 32.1,
      location_lng: 34.8,
      location_pin_source: 'places',
      location_pinned_at: null,
      location_pinned_by: null,
    })
    expect(patch).not.toHaveProperty('location')
    expect(patch).not.toHaveProperty('road_id')
  })
})

describe('applyEventLocationPlace', () => {
  it('clears the missing wash by storing coords from Places', () => {
    const missing = row({ location_lat: null, location_lng: null, location_place_id: null })
    expect(eventLocationIsMissing(missing)).toBe(true)
    const next = applyEventLocationPlace(missing, {
      location: 'קניון איילון',
      location_place_id: 'ChIJ1',
      location_lat: 32.1,
      location_lng: 34.8,
    })
    expect(eventLocationIsMissing(next)).toBe(false)
    expect(next.location_pin_source).toBe('places')
  })

  it('keeps כביש and מיקום text and shows the Google label only on the Maps cell', () => {
    const missing = row({
      location: 'צומת בית קמה',
      location_lat: null,
      location_lng: null,
      location_place_id: null,
      road: { name: '40' },
    })
    const next = applyEventLocationPlace(missing, {
      location: 'צומת בית קמה, ישראל',
      location_place_id: 'ChIJ1',
      location_lat: 31.45,
      location_lng: 34.76,
    })
    expect(next.location).toBe('צומת בית קמה')
    expect(next.road).toEqual({ name: '40' })
    expect(next.maps_label).toBe('צומת בית קמה, ישראל')
    expect(eventLocationPlaceFields(next).location).toBe('צומת בית קמה, ישראל')
    expect(eventLocationPlaceFields(missing).location).toBe('צומת בית קמה')
  })
})

describe('locationPinSourceHint', () => {
  it('labels cockpit pins and geocode estimates', () => {
    expect(locationPinSourceHint('shift_lead')).toBe('ננעץ במפה')
    expect(locationPinSourceHint('responder')).toBe('ננעץ במפה')
    expect(locationPinSourceHint('geocode')).toBe('מיקום משוער')
    expect(locationPinSourceHint('places')).toBeNull()
  })
})

describe('EVENT_LOCATIONS_SELECT', () => {
  it('stays lean and does not pull EVENT_LIST_SELECT embeds', () => {
    expect(EVENT_LOCATIONS_SELECT).toContain('location_lat')
    expect(EVENT_LOCATIONS_SELECT).toContain('profiles!events_shift_lead_id_fkey')
    expect(EVENT_LOCATIONS_SELECT).not.toContain('frozen_over_60km')
    expect(EVENT_LOCATIONS_SELECT).not.toContain('last_saved')
    expect(EVENT_LOCATIONS_SELECT).not.toMatch(/shift:shifts/)
  })
})
