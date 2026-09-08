import { supabase } from './supabase'
import type { HighwayJunction } from './highwayJunctions'

export type HighwayJunctionAdminRow = HighwayJunction & {
  aliases_he: string[]
  aliases_en: string[]
}

export function addAliasToList(aliases: string[], candidate: string): string[] {
  const trimmed = candidate.trim()
  if (!trimmed || aliases.includes(trimmed)) return aliases
  return [...aliases, trimmed]
}

export function removeAliasFromList(aliases: string[], alias: string): string[] {
  return aliases.filter((a) => a !== alias)
}

export async function fetchHighwayJunctionsForAdmin(
  query: string,
): Promise<{ ok: true; rows: HighwayJunctionAdminRow[] } | { ok: false; error: string }> {
  // Strip characters that would break PostgREST's or=(...) filter grammar
  // (comma separates conditions, parens group them) rather than escaping them.
  const trimmed = query.trim().replace(/[,()]/g, '')
  let request = supabase
    .from('highway_junctions')
    .select('id, name_he, name_en, roads, lat, lng, aliases_he, aliases_en')
    .order('name_he', { ascending: true })
    .limit(50)
  if (trimmed) {
    request = request.or(
      `name_he.ilike.%${trimmed}%,name_en.ilike.%${trimmed}%`,
    )
  }
  const { data, error } = await request
  if (error) return { ok: false, error: 'טעינת הצמתים נכשלה. בדקו את החיבור ונסו שוב.' }
  return { ok: true, rows: (data ?? []) as HighwayJunctionAdminRow[] }
}

export async function updateHighwayJunctionAliases(
  id: string,
  aliases_he: string[],
  aliases_en: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  // updated_at is owned by the highway_junctions_set_updated_at trigger
  // (20260908150150_highway_junctions_updated_at_trigger.sql) — no need to set it here.
  const { error } = await supabase
    .from('highway_junctions')
    .update({ aliases_he, aliases_en })
    .eq('id', id)
  if (error) return { ok: false, error: 'שמירת הכינויים נכשלה. בדקו את החיבור ונסו שוב.' }
  return { ok: true }
}

export async function createHighwayJunction(input: {
  name_he: string
  name_en: string | null
  roads: string | null
  lat: number
  lng: number
  createdBy: string
}): Promise<{ ok: true; row: HighwayJunctionAdminRow } | { ok: false; error: string }> {
  const name_he = input.name_he.trim()
  if (!name_he) return { ok: false, error: 'יש להזין שם צומת.' }
  const { data, error } = await supabase
    .from('highway_junctions')
    .insert({
      name_he,
      name_en: input.name_en?.trim() || null,
      roads: input.roads?.trim() || null,
      lat: input.lat,
      lng: input.lng,
      created_by: input.createdBy,
    })
    .select('id, name_he, name_en, roads, lat, lng, aliases_he, aliases_en')
    .single()
  if (error) {
    if (/duplicate|unique/i.test(error.message)) {
      return { ok: false, error: 'צומת בשם זה כבר קיים.' }
    }
    return { ok: false, error: 'הוספת הצומת נכשלה. בדקו את החיבור ונסו שוב.' }
  }
  return { ok: true, row: data as HighwayJunctionAdminRow }
}
