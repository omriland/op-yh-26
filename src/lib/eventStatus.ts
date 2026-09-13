import type { EventStatus, ParticipationStatus } from './status'

/** Event-level complete is blocked until `events.ended_at` is set. */
export const EVENT_DONE_NEEDS_END_ERROR = 'לא ניתן להשלים אירוע ללא שעת סיום.'

/** Lead-owned field that keeps stored status from becoming `done`. */
export function eventMissingLeadDoneDetails(endedAt: string | null | undefined): boolean {
  return !endedAt || !String(endedAt).trim()
}

/** Event-level complete is blocked until every assigned lead `total_km` is set. */
export const EVENT_DONE_NEEDS_KM_ERROR =
  'לא ניתן להשלים אירוע לפני הזנת קילומטרים לכל הכוננים.'

export type EventStatusAssignment = {
  status: ParticipationStatus
  totalKm: number | null
  /**
   * False for a volunteer with no active vehicle — the form disables their KM
   * input, so a null there is "nothing to enter", not "still owed". Defaults to
   * true so callers that do not know about vehicles keep the old behaviour.
   */
  kmApplicable?: boolean
}

/** A null KM only blocks completion when the responder could have had one. */
function owesKm(row: { totalKm?: number | null; total_km?: number | null; kmApplicable?: boolean }): boolean {
  if (row.kmApplicable === false) return false
  return (row.totalKm ?? row.total_km ?? null) == null
}

/**
 * Stored `events.status`. `done` requires every assigned responder `done`,
 * a non-null event end, and a lead KM on every assignment that can have one.
 */
export function deriveStoredEventStatus(input: {
  endedAt: string | null | undefined
  responders: EventStatusAssignment[]
}): EventStatus {
  if (input.responders.length === 0) return 'draft'
  const allDone = input.responders.every((row) => row.status === 'done')
  const someDone = input.responders.some((row) => row.status === 'done')
  const hasEnd = Boolean(input.endedAt && String(input.endedAt).trim())
  const allKm = !input.responders.some(owesKm)
  if (allDone && hasEnd && allKm) return 'done'
  if (someDone) return 'partial'
  return 'in_progress'
}

export function eventDoneGateError(input: {
  endedAt: string | null | undefined
  responders: { totalKm?: number | null; total_km?: number | null; kmApplicable?: boolean }[]
}): string | null {
  if (!input.endedAt || !String(input.endedAt).trim()) return EVENT_DONE_NEEDS_END_ERROR
  if (input.responders.some(owesKm)) return EVENT_DONE_NEEDS_KM_ERROR
  return null
}
