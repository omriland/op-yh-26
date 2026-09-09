import type { PlacePrediction } from './googlePlaces'
import type { HighwayJunction } from './highwayJunctions'

type CombinedSearchInput = {
  localQuery: string
  googleQuery: string
  sessionToken: string
  searchJunctions: (query: string) => Promise<HighwayJunction[]>
  searchPlaces: (
    query: string,
    sessionToken: string,
  ) => Promise<{ ok: true; predictions: PlacePrediction[] } | { ok: false; error: string }>
}

export type CombinedSearchResult = {
  junctions: HighwayJunction[]
  places: { ok: true; predictions: PlacePrediction[] } | { ok: false; error: string }
  localError: unknown
}

export type RankedLocationSuggestion =
  | { kind: 'junction'; junction: HighwayJunction }
  | { kind: 'google'; prediction: PlacePrediction }
  | { kind: 'free_text'; text: string }

/** Query both sources once; display priority is handled separately. */
export async function searchLocationSuggestionsCombined({
  localQuery,
  googleQuery,
  sessionToken,
  searchJunctions,
  searchPlaces,
}: CombinedSearchInput): Promise<CombinedSearchResult> {
  const [junctionResult, placesResult] = await Promise.allSettled([
    searchJunctions(localQuery),
    searchPlaces(googleQuery, sessionToken),
  ])

  return {
    junctions: junctionResult.status === 'fulfilled' ? junctionResult.value : [],
    places:
      placesResult.status === 'fulfilled'
        ? placesResult.value
        : { ok: false, error: 'network' },
    localError: junctionResult.status === 'rejected' ? junctionResult.reason : null,
  }
}

/** Junctions first, Google second, and free text last when allowed. */
export function rankLocationSuggestions(
  junctions: HighwayJunction[],
  predictions: PlacePrediction[],
  freeText: string,
  allowFreeText: boolean,
): RankedLocationSuggestion[] {
  return [
    ...junctions.map((junction) => ({ kind: 'junction' as const, junction })),
    ...predictions.map((prediction) => ({ kind: 'google' as const, prediction })),
    ...(allowFreeText && freeText.trim()
      ? [{ kind: 'free_text' as const, text: freeText.trim() }]
      : []),
  ]
}
