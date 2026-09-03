import { isAbandonedEmptyCockpitItem } from './cockpit'
import { EVENT_SECONDARY_LEADS_EMBED } from './eventShiftLeads'
import type { LocationPlaceFields } from './systemDistricts'
import type { LocationPinSource } from './locationPin'
import type { EventStatus } from './status'
import { supabase } from './supabase'

export const EVENT_LOCATIONS_PAGE_SIZE = 50

export const EVENT_LOCATIONS_LOAD_MORE_LABEL = 'טען עוד'

export type EventLocationsFilter = 'all' | 'missing'

export type EventLocationRow = {
  id: string
  event_date: string
  created_at: string
  police_event_id: string | null
  location: string | null
  location_place_id: string | null
  location_lat: number | null
  location_lng: number | null
  location_pin_source: LocationPinSource | null
  status: EventStatus
  is_cancelled: boolean
  bus_lane: boolean
  road: { name: string } | null
  event_type: { name: string } | null
  shift_lead: { full_name: string; callsign: string } | null
  secondary_leads?: unknown
  responders: { id: string }[]
  /** Client-only: Google formatted address after a Maps pick. Not persisted. */
  maps_label?: string | null
}

/** Lean select — not EVENT_LIST_SELECT. Extra fields are only for exclusion. */
export const EVENT_LOCATIONS_SELECT = `
  id,
  event_date,
  created_at,
  police_event_id,
  location,
  location_place_id,
  location_lat,
  location_lng,
  location_pin_source,
  status,
  is_cancelled,
  bus_lane,
  road:roads(name),
  event_type:event_types(name),
  shift_lead:profiles!events_shift_lead_id_fkey(full_name, callsign),
  ${EVENT_SECONDARY_LEADS_EMBED},
  responders:event_responders(id)
`

/** Missing map pin = null lat or lng only. Geocode / cockpit pins with coords are present. */
export function eventLocationIsMissing(row: {
  location_lat: number | null
  location_lng: number | null
}): boolean {
  return row.location_lat == null || row.location_lng == null
}

export function eventLocationMapsLabel(row: EventLocationRow): string {
  return row.maps_label?.trim() || ''
}

export function isEventLocationQueueItem(row: {
  status: EventStatus
  is_cancelled: boolean
  police_event_id: string | null
  location: string | null
  location_lat: number | null
  location_lng: number | null
  event_type: { name: string } | null
  road: { name: string } | null
  responders: unknown[]
  bus_lane?: boolean
}): boolean {
  if (row.is_cancelled) return false
  return !isAbandonedEmptyCockpitItem(row)
}

export function locationPinSourceHint(source: string | null | undefined): string | null {
  if (source === 'shift_lead' || source === 'responder') return 'ננעץ במפה'
  if (source === 'geocode') return 'מיקום משוער'
  return null
}

export function eventLocationPlaceFields(row: EventLocationRow): LocationPlaceFields {
  return {
    location: eventLocationMapsLabel(row) || row.location || '',
    location_place_id: row.location_place_id,
    location_lat: row.location_lat,
    location_lng: row.location_lng,
  }
}

/** SuperAdmin Maps hook: coords + place_id only. Never writes `location` or road. */
export function eventLocationPlacesPatch(place: LocationPlaceFields) {
  return {
    location_place_id: place.location_place_id,
    location_lat: place.location_lat,
    location_lng: place.location_lng,
    location_pin_source: 'places' as const,
    location_pinned_at: null,
    location_pinned_by: null,
  }
}

export function applyEventLocationPlace(
  row: EventLocationRow,
  place: LocationPlaceFields,
): EventLocationRow {
  const patch = eventLocationPlacesPatch(place)
  return {
    ...row,
    location: row.location,
    road: row.road,
    maps_label: place.location.trim() || row.maps_label || null,
    location_place_id: patch.location_place_id,
    location_lat: patch.location_lat,
    location_lng: patch.location_lng,
    location_pin_source: patch.location_pin_source,
  }
}

export async function fetchEventLocationsPage(input: {
  offset: number
  filter: EventLocationsFilter
  limit?: number
}): Promise<{ rows: EventLocationRow[]; hasMore: boolean; nextOffset: number }> {
  const limit = input.limit ?? EVENT_LOCATIONS_PAGE_SIZE
  const from = input.offset
  const to = input.offset + limit - 1

  let query = supabase
    .from('events')
    .select(EVENT_LOCATIONS_SELECT)
    .eq('is_cancelled', false)
    .order('event_date', { ascending: false })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (input.filter === 'missing') {
    query = query.or('location_lat.is.null,location_lng.is.null')
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)

  const fetched = (data ?? []) as unknown as EventLocationRow[]
  return {
    rows: fetched.filter(isEventLocationQueueItem),
    hasMore: fetched.length === limit,
    nextOffset: input.offset + fetched.length,
  }
}

export async function updateEventLocationPlace(
  eventId: string,
  place: LocationPlaceFields,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!place.location_place_id || place.location_lat == null || place.location_lng == null) {
    return { ok: false, error: 'יש לבחור מיקום מ-Google Maps.' }
  }

  const { error } = await supabase
    .from('events')
    .update(eventLocationPlacesPatch(place))
    .eq('id', eventId)

  if (error) {
    return { ok: false, error: 'עדכון המיקום נכשל. בדקו את החיבור ונסו שוב.' }
  }
  return { ok: true }
}
