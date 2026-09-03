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
}): boolean {
  if (input.eventId) return false
  if (input.loadState !== 'ready') return false
  if (!input.draft || input.draft.id) return false
  return !isAbandonedEmptyEventDraft(input.draft, input.initialEventDate)
}

export function applyStashedEventDraft(
  base: EventFormDraft,
  stashed: unknown,
): EventFormDraft | null {
  if (!stashed || typeof stashed !== 'object') return null
  const draft = stashed as Partial<EventFormDraft>
  if (typeof draft.event_date !== 'string') return null
  return {
    ...base,
    ...draft,
    event_date: draft.event_date,
    shift_lead: base.shift_lead,
    shift_lead_id: base.shift_lead_id,
    responders: Array.isArray(draft.responders) ? draft.responders : base.responders,
  }
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
  // A create that autosaved still remounts as אירוע חדש (no id in the route).
  // Keep the create key until an explicit clear so that remount can restore.
  if (draft.id) {
    stashFillDraft(EVENT_FORM_STASH_SCOPE, eventFormStashId(userId, null), draft, now)
  }
}

export function clearEventFormStash(userId: string, eventId?: string | null): void {
  clearFillDraft(EVENT_FORM_STASH_SCOPE, eventFormStashId(userId, eventId))
  if (eventId) {
    clearFillDraft(EVENT_FORM_STASH_SCOPE, eventFormStashId(userId, null))
  }
}
