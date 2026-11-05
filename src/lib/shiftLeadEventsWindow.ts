/**
 * Default אירועים list for a viewer who has אחמ״ש.
 *
 * Recency is `events.created_at`: the cockpit window and the fuel report
 * already treat that as when the event was reported. `event_date` is a
 * calendar day, so it cannot express a rolling 12 hours.
 *
 * An older event stays only when this viewer is its primary or secondary
 * אחמ״ש and the unit list's פרטים חסרים rule (`missingEventFields`) still
 * has gaps. Shift-born events are exempt there, same as the pinned section.
 */

import { missingEventFields } from './eventIncomplete'
import { mapSecondaryLeadRows, viewerIsEventLead } from './eventShiftLeads'
import type { EventListItem } from './events'

export const SHIFT_LEAD_EVENTS_RECENT_MS = 12 * 60 * 60 * 1000

export const SHOW_OLDER_UNIT_EVENTS_LABEL = 'הצג אירועים ישנים יותר'

export const SHIFT_LEAD_EVENTS_RECENT_HINT =
  'מציג אירועים מ-12 השעות האחרונות ופרטים שחסרים לך.'

export const SHIFT_LEAD_EVENTS_RECENT_EMPTY_TITLE = 'אין אירועים מ-12 השעות האחרונות'

const SHOW_OLDER_STORAGE_KEY = 'yahpaz:unitEventsShowOlder'

/** Shared אירועים screen: anyone with shift_lead, including admin + אחמ״ש. */
export function shouldApplyShiftLeadRecentWindow(roles: readonly string[]): boolean {
  return roles.includes('shift_lead')
}

export function eventWithinShiftLeadRecentWindow(
  createdAt: string | null | undefined,
  now: Date,
): boolean {
  if (!createdAt) return false
  const created = new Date(createdAt).getTime()
  if (Number.isNaN(created)) return false
  return now.getTime() - created <= SHIFT_LEAD_EVENTS_RECENT_MS
}

/** This viewer still owes the list's פרטים חסרים on an event they lead. */
export function shiftLeadOwesEventDetails(
  event: EventListItem,
  viewerId: string | null | undefined,
): boolean {
  const leads = viewerIsEventLead({
    viewerId,
    shiftLeadId: event.shift_lead_id,
    secondaryLeadIds: mapSecondaryLeadRows(event.secondary_leads).map((row) => row.user_id),
  })
  return leads && missingEventFields(event).size > 0
}

export function keepShiftLeadRecentEvent(
  event: EventListItem,
  viewerId: string | null | undefined,
  now: Date,
): boolean {
  if (eventWithinShiftLeadRecentWindow(event.created_at, now)) return true
  return shiftLeadOwesEventDetails(event, viewerId)
}

function sessionStore(storage?: Storage | null): Storage | null {
  return storage ?? (typeof sessionStorage === 'undefined' ? null : sessionStorage)
}

export function readShowOlderUnitEvents(storage?: Storage | null): boolean {
  try {
    return sessionStore(storage)?.getItem(SHOW_OLDER_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function writeShowOlderUnitEvents(show: boolean, storage?: Storage | null): void {
  try {
    const store = sessionStore(storage)
    if (!store) return
    if (show) store.setItem(SHOW_OLDER_STORAGE_KEY, '1')
    else store.removeItem(SHOW_OLDER_STORAGE_KEY)
  } catch {
    // sessionStorage can throw in private mode
  }
}
