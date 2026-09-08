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

export function junctionPlaceId(id: string): string {
  return `${JUNCTION_PLACE_ID_PREFIX}${id}`
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
