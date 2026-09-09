import type { PlacePrediction } from './googlePlaces'
import type { HighwayJunction } from './highwayJunctions'

type LocalFirstSearchInput = {
  localQuery: string
  googleQuery: string
  sessionToken: string
  searchJunctions: (query: string) => Promise<HighwayJunction[]>
  searchPlaces: (
    query: string,
    sessionToken: string,
  ) => Promise<{ ok: true; predictions: PlacePrediction[] } | { ok: false; error: string }>
}

export type LocalFirstSearchResult = {
  junctions: HighwayJunction[]
  places: { ok: true; predictions: PlacePrediction[] } | { ok: false; error: string } | null
  localError: unknown
}

/**
 * Search the closed junction list first. Google is a fallback only when the
 * local search fails or returns no matching junctions.
 */
export async function searchLocationSuggestionsLocalFirst({
  localQuery,
  googleQuery,
  sessionToken,
  searchJunctions,
  searchPlaces,
}: LocalFirstSearchInput): Promise<LocalFirstSearchResult> {
  let localError: unknown = null
  try {
    const junctions = await searchJunctions(localQuery)
    if (junctions.length > 0) {
      return { junctions, places: null, localError: null }
    }
  } catch (error) {
    localError = error
  }

  return {
    junctions: [],
    places: await searchPlaces(googleQuery, sessionToken),
    localError,
  }
}
