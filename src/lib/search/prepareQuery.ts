import type { SmartSearchFilter } from '../../../supabase/functions/_shared/smartSearchFilter.ts'
import type * as smartSearchApi from '../smartSearchApi'
import type { Interpretation } from '../smartSearchApi'
import { resolvePersonInFilter, type PersonAmbiguity } from './personResolution'
import type { RulesVocab } from './searchRules'
import { filterForRole, type DroppedKey, type SearchRole } from './searchRole'

/** The data boundary of the search UI. The dev harness passes a stub; the app uses the real module. */
export type SearchApi = Pick<
  typeof smartSearchApi,
  | 'interpretQuery'
  | 'runSearch'
  | 'suggest'
  | 'suggestArchive'
  | 'resolvePeople'
  | 'fetchSearchVocab'
  | 'reportCounts'
  | 'reportChipRemoved'
  | 'fetchFirstNewEventDate'
>

/** A query turned into the filter this role runs, before any rows are read. */
export type PreparedQuery = {
  query: string
  interpretation: Interpretation
  filter: SmartSearchFilter
  ambiguity: PersonAmbiguity | null
  dropped: DroppedKey[]
}

export async function prepareQuery(
  query: string,
  options: { role: SearchRole; vocab: RulesVocab; forceModel?: boolean },
  api: SearchApi,
): Promise<PreparedQuery> {
  const interpretation = await api.interpretQuery(query, options)
  const roled = filterForRole(interpretation.filter, options.role)
  const { filter, ambiguity } = await resolvePersonInFilter(roled.filter, options.role, (name) =>
    api.resolvePeople(name, options.role),
  )
  return { query, interpretation, filter, ambiguity, dropped: roled.dropped }
}

/** The panel parsed a sentence; the results page picks it up instead of parsing again. */
let handoff: PreparedQuery | null = null

export function handOffPrepared(prepared: PreparedQuery): void {
  handoff = prepared
}

export function takePrepared(query: string): PreparedQuery | null {
  const taken = handoff && handoff.query === query ? handoff : null
  handoff = null
  return taken
}
