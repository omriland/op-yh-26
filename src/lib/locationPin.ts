export const LOCATION_PIN_SOURCES = ['places', 'geocode', 'shift_lead', 'responder'] as const

export type LocationPinSource = (typeof LOCATION_PIN_SOURCES)[number]

export type LocationPinFields = {
  location: string
  location_place_id: string | null
  location_lat: number | null
  location_lng: number | null
  location_pin_source: LocationPinSource | null
  location_pinned_at: string | null
  location_pinned_by: string | null
}

const LOCKED_SOURCES: ReadonlySet<string> = new Set(['shift_lead', 'responder'])

export function locationPinIsLocked(source: string | null | undefined): boolean {
  return source != null && LOCKED_SOURCES.has(source)
}

export function formatLocationCoords(lat: number, lng: number): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`
}

export function emptyLocationPinMeta(): Pick<
  LocationPinFields,
  'location_pin_source' | 'location_pinned_at' | 'location_pinned_by'
> {
  return {
    location_pin_source: null,
    location_pinned_at: null,
    location_pinned_by: null,
  }
}

export function applyLeadMapPin(
  current: LocationPinFields,
  input: { lat: number; lng: number; userId: string; at: string },
): LocationPinFields {
  return {
    location: current.location,
    location_place_id: null,
    location_lat: input.lat,
    location_lng: input.lng,
    location_pin_source: 'shift_lead',
    location_pinned_at: input.at,
    location_pinned_by: input.userId,
  }
}

export function clearLockedLocationPin(current: LocationPinFields): LocationPinFields {
  return {
    location: current.location,
    location_place_id: null,
    location_lat: null,
    location_lng: null,
    ...emptyLocationPinMeta(),
  }
}

export function applyLocationFieldChange(
  current: LocationPinFields,
  next: {
    location: string
    location_place_id: string | null
    location_lat: number | null
    location_lng: number | null
  },
): LocationPinFields {
  const pickedPlace =
    Boolean(next.location_place_id) && next.location_lat != null && next.location_lng != null
  if (pickedPlace) {
    return {
      location: next.location,
      location_place_id: next.location_place_id,
      location_lat: next.location_lat,
      location_lng: next.location_lng,
      location_pin_source: 'places',
      location_pinned_at: null,
      location_pinned_by: null,
    }
  }
  if (locationPinIsLocked(current.location_pin_source)) {
    return {
      ...current,
      location: next.location,
      location_place_id: null,
    }
  }
  return {
    location: next.location,
    location_place_id: next.location_place_id,
    location_lat: next.location_lat,
    location_lng: next.location_lng,
    ...emptyLocationPinMeta(),
  }
}
