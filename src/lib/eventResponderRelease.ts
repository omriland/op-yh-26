import { resolvePatrolCallsign } from './patrolCallsign'

export type ResponderReleaseFields = {
  origin?: string | null
  policeEventId?: string | null
  patrolCallsignNumber?: string | null
  patrolCallsignPrefix?: string | null
  patrolCallsign?: string | null
  roadId?: string | null
  hasRoad?: boolean
}

/**
 * Manual events stay off the responder until או״ק (the number), כביש, and
 * מספר אירוע are all filled. Shift-born events stay visible — responders fill
 * those before a police id exists.
 */
export function eventReleasedToResponders(input: ResponderReleaseFields): boolean {
  if (input.origin === 'shift') return true
  if (!input.policeEventId?.trim()) return false
  const hasRoad = input.hasRoad ?? Boolean(input.roadId?.trim())
  if (!hasRoad) return false
  const callsign = resolvePatrolCallsign({
    prefix: input.patrolCallsignPrefix,
    number: input.patrolCallsignNumber,
    legacy: input.patrolCallsign,
  })
  return Boolean(callsign.number.trim())
}

export function eventReleasedFromEvent(event: {
  origin?: string | null
  police_event_id?: string | null
  patrol_callsign?: string | null
  patrol_callsign_prefix?: string | null
  patrol_callsign_number?: string | null
  road_id?: string | null
  road?: unknown
}): boolean {
  return eventReleasedToResponders({
    origin: event.origin,
    policeEventId: event.police_event_id,
    patrolCallsign: event.patrol_callsign,
    patrolCallsignPrefix: event.patrol_callsign_prefix,
    patrolCallsignNumber: event.patrol_callsign_number,
    roadId: event.road_id,
    hasRoad: Boolean(event.road) || Boolean(event.road_id?.trim()),
  })
}
