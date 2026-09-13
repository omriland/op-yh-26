/**
 * Incomplete-event detection for the unit (אחמ״ש) event list.
 *
 * An event is "incomplete" when one or more required documentation fields are
 * missing. Incomplete events are pinned to the top of the list regardless of
 * their status (including ממתין לתיעוד) so the shift-lead can't miss them.
 *
 * Fields checked:
 *  - Event-level: police_event_id, patrol_callsign_number (אוק - מס),
 *                 district, event_type, road, location, started_at, ended_at
 *  - Per-responder: total_km
 */

import type { EventListItem } from './events'
import { resolvePatrolCallsign } from './patrolCallsign'

export type IncompleteField =
  | 'police_event_id'
  | 'patrol_callsign'
  | 'district'
  | 'event_type'
  | 'road'
  | 'location'
  | 'responder_km'
  | 'event_times'

export const INCOMPLETE_FIELD_LABELS: Record<IncompleteField, string> = {
  police_event_id: 'מספר אירוע',
  patrol_callsign: 'אוק - מס',
  district: 'שלוחה',
  event_type: 'סוג אירוע',
  road: 'כביש',
  location: 'מיקום',
  responder_km: 'ק״מ',
  event_times: 'שעות',
}

function isMissing(value: string | null | undefined): boolean {
  return !value || !value.trim()
}

/**
 * Returns the set of missing fields for a given event.
 * Returns an empty set when the event is fully documented.
 */
export function missingEventFields(event: EventListItem): Set<IncompleteField> {
  const missing = new Set<IncompleteField>()

  if (isMissing(event.police_event_id)) missing.add('police_event_id')
  const callsign = resolvePatrolCallsign({
    prefix: event.patrol_callsign_prefix,
    number: event.patrol_callsign_number,
    legacy: event.patrol_callsign,
  })
  if (isMissing(callsign.number)) missing.add('patrol_callsign')
  if (!event.district) missing.add('district')
  if (!event.event_type) missing.add('event_type')
  if (!event.road) missing.add('road')
  if (isMissing(event.location)) missing.add('location')

  const eventStart = event.started_at
  const eventEnd = event.ended_at
  if (eventStart !== undefined || eventEnd !== undefined) {
    if (isMissing(eventStart) || isMissing(eventEnd)) missing.add('event_times')
  } else {
    for (const responder of event.responders) {
      if (isMissing(responder.started_at) || isMissing(responder.ended_at)) {
        missing.add('event_times')
        break
      }
    }
  }

  for (const responder of event.responders) {
    if (responder.total_km == null) missing.add('responder_km')
    if (missing.has('responder_km')) break
  }

  return missing
}

const FIELD_ORDER = Object.keys(INCOMPLETE_FIELD_LABELS) as IncompleteField[]

/** Hebrew field names in definition order — chips on the list, spoken in the notice. */
export function incompleteFieldLabels(fields: Set<IncompleteField>): string[] {
  return FIELD_ORDER.filter((field) => fields.has(field)).map(
    (field) => INCOMPLETE_FIELD_LABELS[field],
  )
}

const START_TIME_LABEL = 'שעת התחלה'
const END_TIME_LABEL = 'שעת סיום'

/**
 * Field names that still block a fully-logged event, with start/end split
 * so a hover on תועד חלקית can say שעת סיום instead of the generic שעות.
 */
export function missingFullyLoggedFieldLabels(event: EventListItem): string[] {
  const missing = missingEventFields(event)
  const labels: string[] = []
  for (const field of FIELD_ORDER) {
    if (!missing.has(field)) continue
    if (field === 'event_times') {
      const startMissing = isMissing(event.started_at)
      const endMissing = isMissing(event.ended_at)
      if (startMissing) labels.push(START_TIME_LABEL)
      if (endMissing) labels.push(END_TIME_LABEL)
      if (!startMissing && !endMissing) labels.push(INCOMPLETE_FIELD_LABELS.event_times)
      continue
    }
    labels.push(INCOMPLETE_FIELD_LABELS[field])
  }
  return labels
}

export function pendingResponderNames(event: EventListItem): string[] {
  return event.responders
    .filter((row) => row.status !== 'done')
    .map((row) => row.profile?.full_name?.trim() || row.profile?.callsign?.trim() || 'מתנדב')
}

/** Hover / spoken copy for a תועד חלקית stamp: missing lead fields + open fills. */
export function partialStampHoverText(event: EventListItem): string | null {
  const fields = missingFullyLoggedFieldLabels(event)
  const pending = pendingResponderNames(event)
  const parts: string[] = []
  if (fields.length > 0) parts.push(`חסרים: ${fields.join(' · ')}`)
  if (pending.length > 0) parts.push(`ממתין לתיעוד: ${pending.join(' · ')}`)
  return parts.length > 0 ? parts.join('\n') : null
}

/**
 * Spoken / aria label for the notice.
 * e.g. "חסרים: מספר אירוע · ק״מ"
 */
export function incompleteNoticeLabel(fields: Set<IncompleteField>): string {
  return `חסרים: ${incompleteFieldLabels(fields).join(' · ')}`
}

export function isEventIncomplete(event: EventListItem): boolean {
  return missingEventFields(event).size > 0
}

/** True when any assigned responder still has null `total_km` (0 is filled). */
export function eventHasMissingResponderKm(event: EventListItem): boolean {
  return missingEventFields(event).has('responder_km')
}

/** Split a unit list so incomplete events can be pinned above the rest. */
export function partitionIncompleteEvents(events: EventListItem[]): {
  incomplete: EventListItem[]
  rest: EventListItem[]
} {
  const incomplete: EventListItem[] = []
  const rest: EventListItem[] = []
  for (const event of events) {
    if (isEventIncomplete(event)) incomplete.push(event)
    else rest.push(event)
  }
  return { incomplete, rest }
}
