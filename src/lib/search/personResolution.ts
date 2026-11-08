import type { SmartSearchFilter } from '../../../supabase/functions/_shared/smartSearchFilter.ts'
import type { PersonHit } from '../smartSearchApi'
import { canUseArchive, type SearchRole } from './searchRole'

/** A name that fits several people: results show all of them until one is picked. */
export type PersonAmbiguity = { name: string; candidates: PersonHit[] }

function forPeople(filter: SmartSearchFilter, people: PersonHit[], role: SearchRole): SmartSearchFilter {
  const next: SmartSearchFilter = { ...filter, person_ids: people.map((p) => p.id) }
  // The old reports store call signs, so the archive looks people up by או״ק.
  if (canUseArchive(role)) next.person_callsigns = people.map((p) => p.callsign).filter(Boolean)
  else delete next.person_callsigns
  return next
}

/** One person: the chip shows their full name. */
export function pickPerson(filter: SmartSearchFilter, person: PersonHit, role: SearchRole): SmartSearchFilter {
  return { ...forPeople(filter, [person], role), person: person.full_name }
}

/** Back to every match of the typed name. */
export function pickAllPeople(
  filter: SmartSearchFilter,
  ambiguity: PersonAmbiguity,
  role: SearchRole,
): SmartSearchFilter {
  return { ...forPeople(filter, ambiguity.candidates, role), person: ambiguity.name }
}

/**
 * Turns the `person` text into profiles the caller can see. No match keeps the text
 * (it still matches names in events and the archive); one match becomes that person;
 * several stay all selected and come back as an ambiguity for the picker.
 */
export async function resolvePersonInFilter(
  filter: SmartSearchFilter,
  role: SearchRole,
  resolve: (name: string) => Promise<PersonHit[]>,
): Promise<{ filter: SmartSearchFilter; ambiguity: PersonAmbiguity | null }> {
  if (!filter.person || (filter.person_ids?.length ?? 0) > 0) return { filter, ambiguity: null }
  const name = filter.person
  let candidates: PersonHit[]
  try {
    candidates = await resolve(name)
  } catch {
    return { filter, ambiguity: null }
  }
  if (candidates.length === 0) return { filter, ambiguity: null }
  if (candidates.length === 1) return { filter: pickPerson(filter, candidates[0], role), ambiguity: null }
  const ambiguity = { name, candidates }
  return { filter: pickAllPeople(filter, ambiguity, role), ambiguity }
}
