import { supabase } from './supabase'

export const JUNCTION_PLACE_ID_PREFIX = 'junction:'

export type HighwayJunction = {
  id: string
  name_he: string
  name_en: string | null
  roads: string | null
  lat: number
  lng: number
}

type RoadLookup = {
  id: string
  name: string
}

export function junctionPlaceId(id: string): string {
  return `${JUNCTION_PLACE_ID_PREFIX}${id}`
}

/** Numeric leading road token only: "4/721 (דרומי)" -> "4". */
export function firstJunctionRoadNumber(roads: string | null | undefined): string | null {
  const firstToken = roads?.split('/', 1)[0]?.replace(/\([^)]*\)/g, '').trim() ?? ''
  return /^\d+$/.test(firstToken) ? firstToken : null
}

/** Accept closed-list labels such as "6" or "כביש 6", but no partial number matches. */
export function roadNumberFromLookupName(name: string): string | null {
  const match = name.trim().match(/^(?:כביש\s*)?(\d+)(?:\s*\([^)]*\))?$/)
  return match?.[1] ?? null
}

/**
 * Resolve only a single exact road-number match. No match or duplicate lookup
 * rows leave the event's existing road untouched.
 */
export function matchingRoadIdForJunction(
  roads: string | null | undefined,
  lookups: RoadLookup[],
): string | null {
  const junctionRoadNumber = firstJunctionRoadNumber(roads)
  if (!junctionRoadNumber) return null
  const matches = lookups.filter(
    (lookup) => roadNumberFromLookupName(lookup.name) === junctionRoadNumber,
  )
  return matches.length === 1 ? matches[0]!.id : null
}

/** Auto-fill an empty road only; a lead's existing selection always wins. */
export function roadIdAfterJunctionSelection(
  currentRoadId: string,
  junctionRoads: string | null | undefined,
  lookups: RoadLookup[],
): string {
  if (currentRoadId) return currentRoadId
  return matchingRoadIdForJunction(junctionRoads, lookups) ?? ''
}

/**
 * Inverse of junctionPlaceId. Not currently called from any production path —
 * location_place_id is nulled before a junction pin is ever saved (see
 * locationPin.ts), so there's nothing to decode after save. Kept because it's
 * the natural, tested inverse of junctionPlaceId and documents the encoding;
 * locationPin.ts deliberately does its own inline `startsWith('junction:')`
 * check instead of importing this, to avoid pulling this module's live
 * Supabase client construction into a dependency-free pure module — see the
 * comment there.
 */
export function junctionIdFromPlaceId(placeId: string | null | undefined): string | null {
  if (!placeId?.startsWith(JUNCTION_PLACE_ID_PREFIX)) return null
  return placeId.slice(JUNCTION_PLACE_ID_PREFIX.length)
}

export async function searchHighwayJunctions(query: string): Promise<HighwayJunction[]> {
  const trimmed = query.trim()
  if (!trimmed) return []
  const { data, error } = await supabase.rpc('search_highway_junctions', { q: trimmed })
  if (error) throw error
  return (data ?? []) as HighwayJunction[]
}
