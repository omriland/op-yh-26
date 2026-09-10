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
