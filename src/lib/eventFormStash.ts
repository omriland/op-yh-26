import {
  clearFillDraft,
  readFillDraft,
  stashFillDraft,
} from './fillDraftStash'
import { isAbandonedEmptyEventDraft, type EventFormDraft } from './eventForm'

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
  loadState: 'loading' | 'ready' | 'denied'
  draft: EventFormDraft | null
  initialEventDate: string
  originalShiftLeadId?: string
}): boolean {
  if (input.eventId) return false
  if (input.loadState !== 'ready') return false
  if (!input.draft || input.draft.id) return false
  return !isAbandonedEmptyEventDraft(input.draft, input.initialEventDate, input.originalShiftLeadId)
}

export function applyStashedEventDraft(
  base: EventFormDraft,
  stashed: unknown,
): EventFormDraft | null {
  if (!stashed || typeof stashed !== 'object') return null
  const draft = stashed as Partial<EventFormDraft>
  if (typeof draft.event_date !== 'string') return null
  const stashedLeadId = typeof draft.shift_lead_id === 'string' ? draft.shift_lead_id : undefined
  const keepStashedLead = !base.id && Boolean(stashedLeadId && stashedLeadId !== base.shift_lead_id)
  return {
    ...base,
    ...draft,
    event_date: draft.event_date,
    shift_lead: keepStashedLead && draft.shift_lead ? draft.shift_lead : base.shift_lead,
    shift_lead_id: keepStashedLead && draft.shift_lead_id ? draft.shift_lead_id : base.shift_lead_id,
    secondary_leads: Array.isArray(draft.secondary_leads)
      ? draft.secondary_leads
      : base.secondary_leads,
    responders: Array.isArray(draft.responders) ? draft.responders : base.responders,
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

export function readEventFormStash(
  userId: string,
  eventId: string | null | undefined,
  now: number,
): EventFormDraft | null {
  const stashed = readFillDraft<EventFormDraft>(
    EVENT_FORM_STASH_SCOPE,
    eventFormStashId(userId, eventId),
    now,
  )
  return stashed?.draft ?? null
}

export function stashEventFormDraft(
  userId: string,
  draft: EventFormDraft,
  now: number,
): void {
  stashFillDraft(EVENT_FORM_STASH_SCOPE, eventFormStashId(userId, draft.id), draft, now)
}

export function clearEventFormStash(userId: string, eventId?: string | null): void {
  clearFillDraft(EVENT_FORM_STASH_SCOPE, eventFormStashId(userId, eventId))
  if (eventId) {
    clearFillDraft(EVENT_FORM_STASH_SCOPE, eventFormStashId(userId, null))
  }
}
