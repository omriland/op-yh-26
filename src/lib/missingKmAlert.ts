/** Shift-lead / admin alert when multiple events still lack lead-entered ק״מ. */

import { supabase } from './supabase'

export const MISSING_KM_ALERT_THRESHOLD = 2

/** sessionStorage — dismisses the popup for this tab until the browser session ends.
 *  The Events-page banner is never silenced by this key. */
export const MISSING_KM_POPUP_DISMISS_KEY = 'yahpaz:missing_km_popup_dismissed'

export function missingKmAlertMessage(eventCount: number): string {
  return `לתשומת ליבך! לא הזנת ק"מ ב-${eventCount} אירועים. יש לעשות זאת בהקדם`
}

export function shouldShowMissingKmAlert(eventCount: number): boolean {
  return eventCount >= MISSING_KM_ALERT_THRESHOLD
}

export function canSeeMissingKmAlert(roles: readonly string[]): boolean {
  return (
    roles.includes('shift_lead') ||
    roles.includes('admin') ||
    roles.includes('super_admin')
  )
}

export function readMissingKmPopupDismissed(
  storage: Pick<Storage, 'getItem'> | null = typeof sessionStorage === 'undefined'
    ? null
    : sessionStorage,
): boolean {
  try {
    return storage?.getItem(MISSING_KM_POPUP_DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

export function writeMissingKmPopupDismissed(
  storage: Pick<Storage, 'setItem'> | null = typeof sessionStorage === 'undefined'
    ? null
    : sessionStorage,
): void {
  try {
    storage?.setItem(MISSING_KM_POPUP_DISMISS_KEY, '1')
  } catch {
    // Private mode / quota — popup may reappear; banner still works.
  }
}

export function countEventsMissingResponderKmFromList(
  events: ReadonlyArray<{ responders: ReadonlyArray<{ total_km: number | null }> }>,
): number {
  let count = 0
  for (const event of events) {
    if (event.responders.some((row) => row.total_km == null)) count += 1
  }
  return count
}

/** Unit-wide count via RLS-aware RPC. Returns null when the call fails. */
export async function fetchEventsMissingLeadKmCount(): Promise<number | null> {
  const { data, error } = await supabase.rpc('count_events_missing_lead_km')
  if (error) return null
  const count = typeof data === 'number' ? data : Number(data)
  return Number.isFinite(count) ? count : null
}
