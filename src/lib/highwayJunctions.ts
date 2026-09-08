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
