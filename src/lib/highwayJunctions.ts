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

type HighwayJunctionCatalogRow = HighwayJunction & {
  aliases_he: string[]
  aliases_en: string[]
}

type RoadLookup = {
  id: string
  name: string
}

const JUNCTION_CATALOG_LIMIT = 700
const JUNCTION_RESULT_LIMIT = 15
const HEBREW_NIKUD = /[\u0591-\u05c7]/gu
const JUNCTION_KIND_PREFIX = /^(?:צומת|מחלף)\s+/u
const TRAILING_DIRECTION =
  /\s+((?:(?:ל|ב)כיוון\s+(?:ה?(?:מערב|מזרח|צפון|דרום)|ל(?:מערב|מזרח|צפון|דרום)))|(?:ל?(?:מערב|מזרח|צפון|דרום)|מערבה|מזרחה|צפונה|דרומה))$/u

let junctionCatalogPromise: Promise<HighwayJunctionCatalogRow[]> | null = null

export function junctionPlaceId(id: string): string {
  return `${JUNCTION_PLACE_ID_PREFIX}${id}`
}

function normalizedRoadNumber(value: string): string | null {
  const token = value.replace(/\([^)]*\)/g, '').trim()
  const match = token.match(/^(?:כביש\s*)?(\d+)$/u)
  return match?.[1] ?? null
}

/** First numeric junction-road token, accepting "4", "כביש 4", and "כביש4". */
export function firstJunctionRoadNumber(roads: string | null | undefined): string | null {
  for (const token of roads?.split('/') ?? []) {
    const roadNumber = normalizedRoadNumber(token)
    if (roadNumber) return roadNumber
  }
  return null
}

/** Accept closed-list labels such as "6" or "כביש 6", but no partial number matches. */
export function roadNumberFromLookupName(name: string): string | null {
  return normalizedRoadNumber(name)
}

/**
 * Try numeric slash-delimited tokens in order and resolve the first unique
 * exact closed-list match. No partial numeric matching is allowed.
 */
export function matchingRoadIdForJunction(
  roads: string | null | undefined,
  lookups: RoadLookup[],
): string | null {
  for (const token of roads?.split('/') ?? []) {
    const junctionRoadNumber = normalizedRoadNumber(token)
    if (!junctionRoadNumber) continue
    const matches = lookups.filter(
      (lookup) => roadNumberFromLookupName(lookup.name) === junctionRoadNumber,
    )
    if (matches.length === 1) return matches[0]!.id
  }
  return null
}

/** A junction is the source of truth: overwrite with a match, otherwise preserve the road. */
export function roadIdAfterJunctionSelection(
  currentRoadId: string,
  junctionRoads: string | null | undefined,
  lookups: RoadLookup[],
): string {
  return matchingRoadIdForJunction(junctionRoads, lookups) ?? currentRoadId
}

export type JunctionQueryParts = {
  baseQuery: string
  directionSuffix: string | null
}

export function splitJunctionDirection(query: string): JunctionQueryParts {
  const trimmed = query.trim()
  const match = trimmed.match(TRAILING_DIRECTION)
  if (!match || match.index == null) return { baseQuery: trimmed, directionSuffix: null }
  return {
    baseQuery: trimmed.slice(0, match.index).trim(),
    directionSuffix: match[1] ?? null,
  }
}

function normalizeJunctionText(value: string): string {
  return value
    .normalize('NFD')
    .replace(HEBREW_NIKUD, '')
    .toLocaleLowerCase('he')
    .replace(/["'׳״.,()[\]{}\-–—]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

function searchVariants(value: string): string[] {
  const normalized = normalizeJunctionText(value)
  const withoutKind = normalized.replace(JUNCTION_KIND_PREFIX, '')
  return withoutKind && withoutKind !== normalized ? [normalized, withoutKind] : [normalized]
}

/** Damerau-Levenshtein distance, including one adjacent transposition. */
export function junctionEditDistance(left: string, right: string): number {
  const rows = left.length + 1
  const columns = right.length + 1
  const matrix = Array.from({ length: rows }, () => Array<number>(columns).fill(0))
  for (let row = 0; row < rows; row += 1) matrix[row]![0] = row
  for (let column = 0; column < columns; column += 1) matrix[0]![column] = column

  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      const substitutionCost = left[row - 1] === right[column - 1] ? 0 : 1
      matrix[row]![column] = Math.min(
        matrix[row - 1]![column]! + 1,
        matrix[row]![column - 1]! + 1,
        matrix[row - 1]![column - 1]! + substitutionCost,
      )
      if (
        row > 1 &&
        column > 1 &&
        left[row - 1] === right[column - 2] &&
        left[row - 2] === right[column - 1]
      ) {
        matrix[row]![column] = Math.min(
          matrix[row]![column]!,
          matrix[row - 2]![column - 2]! + 1,
        )
      }
    }
  }
  return matrix[left.length]![right.length]!
}

function matchScore(term: string, query: string): number | null {
  if (!term || !query) return null
  if (term === query) return 0
  if (term.startsWith(query)) return 10 + Math.min(term.length - query.length, 9)
  if (term.includes(query)) return 20 + Math.min(term.indexOf(query), 9)
  if (query.length < 4) return null
  const distance = junctionEditDistance(term, query)
  const maxDistance = Math.max(1, Math.floor(query.length * 0.25))
  return distance <= maxDistance ? 40 + distance : null
}

export function rankHighwayJunctions(
  rows: HighwayJunctionCatalogRow[],
  query: string,
): HighwayJunction[] {
  const { baseQuery } = splitJunctionDirection(query)
  const queryVariants = [
    ...new Set([...searchVariants(query), ...searchVariants(baseQuery)]),
  ].filter(Boolean)

  return rows
    .map((row) => {
      const terms = [row.name_he, row.name_en, ...row.aliases_he, ...row.aliases_en]
        .filter((value): value is string => Boolean(value))
        .flatMap(searchVariants)
      const scores = terms.flatMap((term) =>
        queryVariants
          .map((queryVariant) => matchScore(term, queryVariant))
          .filter((score): score is number => score != null),
      )
      return { row, score: scores.length > 0 ? Math.min(...scores) : null }
    })
    .filter((candidate): candidate is { row: HighwayJunctionCatalogRow; score: number } =>
      candidate.score != null,
    )
    .sort(
      (left, right) =>
        left.score - right.score || left.row.name_he.localeCompare(right.row.name_he, 'he'),
    )
    .slice(0, JUNCTION_RESULT_LIMIT)
    .map(({ row }) => ({
      id: row.id,
      name_he: row.name_he,
      name_en: row.name_en,
      roads: row.roads,
      lat: row.lat,
      lng: row.lng,
    }))
}

export function junctionLocationLabel(junctionName: string, typedQuery: string): string {
  const { directionSuffix } = splitJunctionDirection(typedQuery)
  if (!directionSuffix) return junctionName
  if (normalizeJunctionText(junctionName) === normalizeJunctionText(typedQuery)) {
    return junctionName
  }
  return `${junctionName} ${directionSuffix}`
}

async function fetchJunctionCatalog(): Promise<HighwayJunctionCatalogRow[]> {
  if (!junctionCatalogPromise) {
    junctionCatalogPromise = Promise.resolve(
      supabase
        .from('highway_junctions')
        .select('id, name_he, name_en, roads, lat, lng, aliases_he, aliases_en')
        .limit(JUNCTION_CATALOG_LIMIT),
    ).then(({ data, error }) => {
      if (error) throw error
      return (data ?? []) as HighwayJunctionCatalogRow[]
    })
  }
  try {
    return await junctionCatalogPromise
  } catch (error) {
    junctionCatalogPromise = null
    throw error
  }
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
  try {
    return rankHighwayJunctions(await fetchJunctionCatalog(), trimmed)
  } catch (catalogError) {
    // Keep the existing remote substring RPC as a resilience fallback. Fuzzy
    // matching needs the cached catalog, but an exact search should still work
    // if that broader read is temporarily unavailable.
    const { baseQuery } = splitJunctionDirection(trimmed)
    const { data, error } = await supabase.rpc('search_highway_junctions', { q: baseQuery })
    if (error) throw catalogError
    return (data ?? []) as HighwayJunction[]
  }
}
