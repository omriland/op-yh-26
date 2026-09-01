import {
  clearFillDraft,
  readFillDraft,
  stashFillDraft,
} from './fillDraftStash'
import type { EventFormDraft } from './eventForm'

export const EVENT_FORM_STASH_SCOPE = 'eventForm'
export const EVENT_FORM_STASH_DEBOUNCE_MS = 600

/** Tablet + phone — same breakpoint as the mobile shell (`useIsDesktop`). */
const MOBILE_WEB_QUERY = '(max-width: 1024px)'

export function eventFormStashId(userId: string, eventId?: string | null): string {
  return `${userId}:${eventId ?? 'new'}`
}

export function isMobileWebViewport(
  matchMedia: (query: string) => { matches: boolean } = (query) =>
    window.matchMedia(query),
): boolean {
  try {
    return matchMedia(MOBILE_WEB_QUERY).matches
  } catch {
    return false
  }
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
