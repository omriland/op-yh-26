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
}

/**
 * Stored `events.status`. `done` requires every assigned responder `done`,
 * a non-null event end, and a non-null lead KM on every assignment.
 */
export function deriveStoredEventStatus(input: {
  endedAt: string | null | undefined
  responders: EventStatusAssignment[]
}): EventStatus {
  if (input.responders.length === 0) return 'draft'
  const allDone = input.responders.every((row) => row.status === 'done')
  const someDone = input.responders.some((row) => row.status === 'done')
  const hasEnd = Boolean(input.endedAt && String(input.endedAt).trim())
  const allKm = input.responders.every((row) => row.totalKm != null)
  if (allDone && hasEnd && allKm) return 'done'
  if (someDone) return 'partial'
  return 'in_progress'
}

export function eventDoneGateError(input: {
  endedAt: string | null | undefined
  responders: { totalKm?: number | null; total_km?: number | null }[]
}): string | null {
  if (!input.endedAt || !String(input.endedAt).trim()) return EVENT_DONE_NEEDS_END_ERROR
  const missingKm = input.responders.some((row) => (row.totalKm ?? row.total_km ?? null) == null)
  if (missingKm) return EVENT_DONE_NEEDS_KM_ERROR
  return null
}
