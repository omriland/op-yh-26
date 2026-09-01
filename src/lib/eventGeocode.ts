import { locationPinIsLocked, type LocationPinSource } from './locationPin'
import { isUrbanRoadName } from './systemDistricts'

export type LocationGeocodePayload = {
  location: string | null
  location_place_id: string | null
  location_lat: number | null
  location_lng: number | null
  location_pin_source: LocationPinSource | null
  location_pinned_at: string | null
  location_pinned_by: string | null
}

export function roadNumberForGeocode(roadName: string): string | null {
  const paren = roadName.match(/\((\d+)\)/)
  if (paren?.[1]) return paren[1]
  const digits = roadName.match(/\d+/)
  return digits?.[0] ?? null
}

/** Google query: road number first, then the free-text location. */
export function eventGeocodeQuery(
  road: string | null | undefined,
  location: string | null | undefined,
): string | null {
  const roadName = road?.trim() ?? ''
  const place = location?.trim() ?? ''
  const number = roadName ? roadNumberForGeocode(roadName) : null
  const roadPart = number ? `כביש ${number}` : roadName
  if (!roadPart && !place) return null
  if (!roadPart) return place
  if (!place) return roadPart
  if (place.includes(roadPart) || place.includes(roadName)) return place
  return `${roadPart} ${place}`
}

/** Persist a guessed pin for highway events that still have no coords. */
export function eventNeedsPersistedGeocode(input: {
  location: string | null | undefined
  location_lat: number | null | undefined
  location_lng: number | null | undefined
  location_pin_source: string | null | undefined
  roadName: string | null | undefined
  placesAssisted: boolean
}): boolean {
  if (input.placesAssisted) return false
  if (isUrbanRoadName(input.roadName)) return false
  if (locationPinIsLocked(input.location_pin_source)) return false
  if (input.location_lat != null && input.location_lng != null) return false
  return eventGeocodeQuery(input.roadName, input.location) != null
}

export function applyAutoGeocodeToLocationPayload(
  payload: LocationGeocodePayload,
  coords: { lat: number; lng: number } | null,
): LocationGeocodePayload {
  if (!coords) return payload
  if (payload.location_lat != null && payload.location_lng != null) return payload
  return {
    ...payload,
    location_place_id: null,
    location_lat: coords.lat,
    location_lng: coords.lng,
    location_pin_source: 'geocode',
    location_pinned_at: null,
    location_pinned_by: null,
  }
}
