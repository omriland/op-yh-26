import { isBlankQuery } from './smartSearch.ts'
import type { Interpretation } from './smartSearchApi.ts'

export type SearchViewState = 'idle' | 'loading' | 'error' | 'too_long' | 'unsupported' | 'empty' | 'results'

export type SearchCounts = { events: number; archive: number; people: number }

/** Which body the /search page shows. `query` is the submitted query, not the live input. */
export function searchViewState(input: {
  query: string
  loading: boolean
  error: boolean
  interpretation: Interpretation | null
  counts: SearchCounts | null
}): SearchViewState {
  const { query, loading, error, interpretation, counts } = input
  if (isBlankQuery(query)) return 'idle'
  if (loading) return 'loading'
  if (error) return 'error'
  if (!interpretation) return 'idle'
  if (interpretation.error === 'query_too_long') return 'too_long'
  const total = counts ? counts.events + counts.archive + counts.people : 0
  if (interpretation.filter.intent === 'unsupported_question' && total === 0) return 'unsupported'
  if (!counts) return 'loading'
  return total === 0 ? 'empty' : 'results'
}
