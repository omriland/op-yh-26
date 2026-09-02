import type { EventStatus, StampDescriptor } from './status'

export const STALE_SAVE_MESSAGE = 'מישהו שמר לפניך — רעננו'
export const COUNT_DECREASE_BLOCKED = 'לא ניתן להקטין — קיימים אירועים שמולאו'
export const SHIFT_BORN_CHIP = 'ממשמרת'
/** Shown in brackets next to the event type on list cards/tables. */
export const SHIFT_BORN_TYPE_MARK = '(משמרת)'
export const NO_POLICE_EVENT_ID = 'ללא מספר'

export type EventOrigin = 'manual' | 'shift'

export function eventTypeName(name: string, origin?: EventOrigin): string {
  return origin === 'shift' ? `${name} ${SHIFT_BORN_TYPE_MARK}` : name
}

export type ShiftBornEventSnapshot = {
  status: EventStatus
  police_event_id: string | null
  treatment_detail: string | null
  treatment_notes: string | null
  road_id?: string | null
  location?: string | null
  treated_count: number
}

function blank(value: string | null | undefined): boolean {
  return !value || value.trim() === ''
}

export function isShiftBornEventEmpty(event: ShiftBornEventSnapshot): boolean {
  return (
    blank(event.police_event_id) &&
    blank(event.treatment_detail) &&
    blank(event.treatment_notes) &&
    blank(event.road_id) &&
    blank(event.location) &&
    event.treated_count <= 0
  )
}

export function shiftBornFillStamp(event: ShiftBornEventSnapshot): StampDescriptor {
  if (event.status === 'done') return { label: 'הושלם', tone: 'done' }
  if (isShiftBornEventEmpty(event)) return { label: 'ממתין לתיעוד', tone: 'draft' }
  return { label: 'טיוטה נשמרה', tone: 'draft' }
}

export function lastSavedByLabel(name: string | null | undefined): string | null {
  const trimmed = name?.trim()
  if (!trimmed) return null
  return `נשמר ע״י ${trimmed}`
}

export function policeEventLabel(policeEventId: string | null | undefined): string {
  const trimmed = policeEventId?.trim()
  return trimmed ? trimmed : NO_POLICE_EVENT_ID
}

/** Shift-born events have no meaningful אחמ״ש — the crew shares the fill. */
export function eventLeadDisplayName(
  origin: EventOrigin,
  name: string | null | undefined,
): string | null {
  if (origin === 'shift') return null
  const trimmed = name?.trim()
  return trimmed ? trimmed : null
}
