/** Shift-lead / admin alert when multiple events still lack lead-entered ק״מ. */

import { mapSecondaryLeadRows, viewerIsEventLead } from './eventShiftLeads'
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
  events: ReadonlyArray<{
    shift_lead_id?: string | null
    secondary_leads?: unknown
    responders: ReadonlyArray<{ total_km: number | null }>
  }>,
  viewerId?: string,
): number {
  let count = 0
  for (const event of events) {
    if (
      viewerId &&
      !viewerIsEventLead({
        viewerId,
        shiftLeadId: event.shift_lead_id,
        secondaryLeadIds: mapSecondaryLeadRows(event.secondary_leads).map((row) => row.user_id),
      })
    ) {
      continue
    }
    if (event.responders.some((row) => row.total_km == null)) count += 1
  }
  return count
}

type LeadKmEventRow = {
  id: string
  responders: { total_km: number | null }[] | null
}

function countMissingKmRows(rows: ReadonlyArray<LeadKmEventRow> | null | undefined): {
  ids: Set<string>
  count: number
} {
  const ids = new Set<string>()
  let count = 0
  for (const row of rows ?? []) {
    if (ids.has(row.id)) continue
    ids.add(row.id)
    if ((row.responders ?? []).some((item) => item.total_km == null)) count += 1
  }
  return { ids, count }
}

/** Count of events this viewer leads that still need lead-entered ק״מ. */
export async function fetchEventsMissingLeadKmCount(): Promise<number | null> {
  const { data: session, error: sessionError } = await supabase.auth.getUser()
  const userId = session.user?.id
  if (sessionError || !userId) return null

  const { data: mainRows, error: mainError } = await supabase
    .from('events')
    .select('id, responders:event_responders(total_km)')
    .eq('shift_lead_id', userId)
  if (mainError) return null

  const { data: secondaryLinks, error: secondaryError } = await supabase
    .from('event_secondary_leads')
    .select('event_id')
    .eq('user_id', userId)
  if (secondaryError) return null

  const counted = countMissingKmRows(mainRows as LeadKmEventRow[] | null)
  const extraIds = [
    ...new Set(
      (secondaryLinks ?? [])
        .map((row) => row.event_id)
        .filter((id): id is string => Boolean(id) && !counted.ids.has(id)),
    ),
  ]
  if (extraIds.length === 0) return counted.count

  const { data: secondaryRows, error: extraError } = await supabase
    .from('events')
    .select('id, responders:event_responders(total_km)')
    .in('id', extraIds)
  if (extraError) return null

  return counted.count + countMissingKmRows(secondaryRows as LeadKmEventRow[] | null).count
}
