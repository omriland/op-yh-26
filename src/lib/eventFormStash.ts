import {
  clearFillDraft,
  readFillDraft,
  stashFillDraft,
} from './fillDraftStash'
import {
  isAbandonedEmptyEventDraft,
  keepLiveResponderIdentity,
  type EventFormDraft,
  type ResponderDraft,
} from './eventForm'
import { formatPatrolCallsign, resolvePatrolCallsign } from './patrolCallsign'

export const EVENT_FORM_STASH_SCOPE = 'eventForm'
export const EVENT_FORM_STASH_DEBOUNCE_MS = 600

export function eventFormStashId(userId: string, eventId?: string | null): string {
  return `${userId}:${eventId ?? 'new'}`
}

/**
 * Keep an in-progress אירוע חדש when the boot effect re-fires for a reason
 * that is not "open a different event" (auth object churn, lead stamp update).
 */
export function shouldKeepLiveCreateDraft(input: {
  eventId?: string | null
  loadState: 'loading' | 'ready' | 'denied' | 'assigned_blocked' | 'age_locked'
  draft: EventFormDraft | null
  initialEventDate: string
  originalShiftLeadId?: string
}): boolean {
  if (input.eventId) return false
  if (input.loadState !== 'ready') return false
  if (!input.draft || input.draft.id) return false
  return !isAbandonedEmptyEventDraft(input.draft, input.initialEventDate, input.originalShiftLeadId)
}

type StashedEventDraftPayload = EventFormDraft & {
  __unsavedStashV2?: true
}

function preferNonBlank(stashed: unknown, base: string): string {
  if (typeof stashed !== 'string') return base
  if (stashed.trim() === '' && base.trim() !== '') return base
  return stashed
}

function mergeRespondersForExistingEvent(
  baseResponders: ResponderDraft[],
  stashedResponders: ResponderDraft[],
): ResponderDraft[] {
  const withLiveIdentity = keepLiveResponderIdentity(stashedResponders, baseResponders)
  const baseById = new Map(baseResponders.map((row) => [row.responder_id, row]))
  const seenIds = new Set<string>()
  const merged = withLiveIdentity.map((row) => {
    seenIds.add(row.responder_id)
    const baseRow = baseById.get(row.responder_id)
    if (!baseRow) return row
    const stashedHasTreated = Array.isArray(row.treated) && row.treated.some((t) => t.quantity > 0)
    const baseHasTreated = baseRow.treated.some((t) => t.quantity > 0)
    return {
      ...baseRow,
      ...row,
      assignmentId: baseRow.assignmentId ?? row.assignmentId,
      status: baseRow.status,
      hasOwnedData: baseRow.hasOwnedData || row.hasOwnedData,
      start_time: preferNonBlank(row.start_time, baseRow.start_time),
      end_time: preferNonBlank(row.end_time, baseRow.end_time),
      total_km: preferNonBlank(row.total_km, baseRow.total_km),
      treated: stashedHasTreated || !baseHasTreated ? row.treated : baseRow.treated,
    }
  })
  for (const baseRow of baseResponders) {
    if (!seenIds.has(baseRow.responder_id)) {
      merged.push(baseRow)
    }
  }
  return merged
}

export function applyStashedEventDraft(
  base: EventFormDraft,
  stashed: unknown,
): EventFormDraft | null {
  if (!stashed || typeof stashed !== 'object') return null
  const raw = { ...(stashed as Partial<StashedEventDraftPayload>) }
  delete raw.__unsavedStashV2
  const draft = raw as Partial<EventFormDraft>
  if (typeof draft.event_date !== 'string') return null
  const isExisting = Boolean(base.id)
  const stashedLeadId = typeof draft.shift_lead_id === 'string' ? draft.shift_lead_id : undefined
  const keepStashedLead = !isExisting && Boolean(stashedLeadId && stashedLeadId !== base.shift_lead_id)
  const pickStr = (val: unknown, fallback: string) =>
    isExisting ? preferNonBlank(val, fallback) : typeof val === 'string' ? val : fallback

  const callsign = resolvePatrolCallsign({
    prefix: pickStr(draft.patrol_callsign_prefix, base.patrol_callsign_prefix),
    number: pickStr(draft.patrol_callsign_number, base.patrol_callsign_number),
    legacy: pickStr(draft.patrol_callsign, base.patrol_callsign),
  })
  const location = pickStr(draft.location, base.location)
  const keepBaseLocationPin =
    isExisting &&
    (typeof draft.location !== 'string' || draft.location.trim() === '') &&
    base.location.trim() !== ''

  return {
    ...base,
    ...draft,
    event_date: pickStr(draft.event_date, base.event_date),
    police_event_id: pickStr(draft.police_event_id, base.police_event_id),
    district_id: pickStr(draft.district_id, base.district_id),
    patrol_callsign_prefix: callsign.prefix,
    patrol_callsign_number: callsign.number,
    patrol_callsign: formatPatrolCallsign(callsign.prefix, callsign.number),
    start_time: pickStr(draft.start_time, base.start_time),
    end_time: pickStr(draft.end_time, base.end_time),
    event_type_id: pickStr(draft.event_type_id, base.event_type_id),
    road_id: pickStr(draft.road_id, base.road_id),
    location,
    location_place_id: keepBaseLocationPin
      ? base.location_place_id
      : (draft.location_place_id ?? base.location_place_id),
    location_lat: keepBaseLocationPin ? base.location_lat : (draft.location_lat ?? base.location_lat),
    location_lng: keepBaseLocationPin ? base.location_lng : (draft.location_lng ?? base.location_lng),
    location_pin_source: keepBaseLocationPin
      ? base.location_pin_source
      : (draft.location_pin_source ?? base.location_pin_source),
    location_pinned_at: keepBaseLocationPin
      ? base.location_pinned_at
      : (draft.location_pinned_at ?? base.location_pinned_at),
    location_pinned_by: keepBaseLocationPin
      ? base.location_pinned_by
      : (draft.location_pinned_by ?? base.location_pinned_by),
    notes: pickStr(draft.notes, base.notes),
    event_type_detail: pickStr(draft.event_type_detail, base.event_type_detail),
    station: pickStr(draft.station, base.station),
    shift_lead: keepStashedLead && draft.shift_lead ? draft.shift_lead : base.shift_lead,
    shift_lead_id: keepStashedLead && draft.shift_lead_id ? draft.shift_lead_id : base.shift_lead_id,
    secondary_leads: Array.isArray(draft.secondary_leads)
      ? isExisting && draft.secondary_leads.length === 0 && base.secondary_leads.length > 0
        ? base.secondary_leads
        : draft.secondary_leads
      : base.secondary_leads,
    responders: Array.isArray(draft.responders)
      ? isExisting
        ? mergeRespondersForExistingEvent(base.responders, draft.responders as ResponderDraft[])
        : keepLiveResponderIdentity(draft.responders as ResponderDraft[], base.responders)
      : base.responders,
  }
}

/**
 * Create (`/events/new`) never hydrates from stash — a saved-row stash would
 * rewrite the route to that event’s edit form. Edit routes may restore.
 */
export function eventFormStashForRoute(
  eventId: string | null | undefined,
  stashed: EventFormDraft | null,
): EventFormDraft | null {
  if (!stashed || !eventId) return null
  return stashed
}

/**
 * Purge pre-fix `yahpaz.fillDraft.eventForm.*` entries that were written on
 * every open and never cleared on autosave.
 */
export function purgeLegacyEventFormStashes(): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    const prefix = `yahpaz.fillDraft.${EVENT_FORM_STASH_SCOPE}.`
    const toRemove: string[] = []
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i)
      if (!key || !key.startsWith(prefix)) continue
      const raw = window.localStorage.getItem(key)
      if (!raw) continue
      try {
        const parsed = JSON.parse(raw) as { draft?: StashedEventDraftPayload }
        if (!parsed?.draft || parsed.draft.__unsavedStashV2 !== true) {
          toRemove.push(key)
        }
      } catch {
        toRemove.push(key)
      }
    }
    for (const key of toRemove) {
      window.localStorage.removeItem(key)
    }
  } catch {
    // Storage access may fail in restricted contexts.
  }
}

export function readEventFormStash(
  userId: string,
  eventId: string | null | undefined,
  now: number,
): EventFormDraft | null {
  purgeLegacyEventFormStashes()
  const key = eventFormStashId(userId, eventId)
  const stashed = readFillDraft<StashedEventDraftPayload>(
    EVENT_FORM_STASH_SCOPE,
    key,
    now,
  )
  if (!stashed?.draft) return null
  if (stashed.draft.__unsavedStashV2 !== true) {
    clearFillDraft(EVENT_FORM_STASH_SCOPE, key)
    return null
  }
  const { __unsavedStashV2: _marker, ...clean } = stashed.draft
  return clean
}

export function stashEventFormDraft(
  userId: string,
  draft: EventFormDraft,
  now: number,
): void {
  const payload: StashedEventDraftPayload = {
    ...draft,
    __unsavedStashV2: true,
  }
  stashFillDraft(EVENT_FORM_STASH_SCOPE, eventFormStashId(userId, draft.id), payload, now)
}

export function clearEventFormStash(userId: string, eventId?: string | null): void {
  clearFillDraft(EVENT_FORM_STASH_SCOPE, eventFormStashId(userId, eventId))
  if (eventId) {
    clearFillDraft(EVENT_FORM_STASH_SCOPE, eventFormStashId(userId, null))
  }
}
