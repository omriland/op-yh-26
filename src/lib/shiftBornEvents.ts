import type { EventStatus, StampDescriptor } from './status'

export const STALE_SAVE_MESSAGE = 'מישהו שמר לפניך — רעננו'
export const COUNT_DECREASE_BLOCKED = 'לא ניתן להקטין — קיימים אירועים שמולאו'
export const SHIFT_BORN_CHIP = 'ממשמרת'
/** Shown in brackets next to the event type on list cards/tables. */
export const SHIFT_BORN_TYPE_MARK = '(משמרת)'
export const NO_POLICE_EVENT_ID = 'ללא מספר'
/** Raised by save_shift_born_event_fill; also shown up front on the read-only report. */
export const SHIFT_BORN_TOO_EARLY = 'ניתן לתעד החל מתאריך המשמרת.'
export const SHIFT_BORN_DONE_LOCKED = 'התיעוד כבר הושלם. רק אחמ״ש יכול לערוך.'

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

/**
 * Shift-born documentation stamp, in the event lifecycle's words. The crew's
 * shared report is the whole event, so it is ממתין למתנדב until the report is
 * done with פירוט הטיפול filled, then תועד. It is never טיוטה: the crew sees a
 * shift-born event from the start.
 */
export function shiftBornFillStamp(event: ShiftBornEventSnapshot): StampDescriptor {
  if (shiftBornReportDone(event)) return { label: 'תועד', tone: 'done' }
  return { label: 'ממתין למתנדב', tone: 'pending' }
}

/** Done in the database and פירוט הטיפול filled; the report's own done gate. */
export function shiftBornReportDone(event: {
  status: EventStatus
  treatment_detail?: string | null
}): boolean {
  return event.status === 'done' && !blank(event.treatment_detail)
}

/** Mine inbox: shift-born stays pending until פירוט הטיפול is filled and status is done. */
export function mineShiftBornIsOpen(event: {
  status: EventStatus
  treatment_detail: string | null | undefined
}): boolean {
  if (blank(event.treatment_detail)) return true
  return event.status !== 'done'
}

/** Inbox CTA. One shared report for the crew, so never "שלי". */
export function shiftBornFillCtaLabel(event: ShiftBornEventSnapshot): string | null {
  if (!mineShiftBornIsOpen(event)) return null
  return isShiftBornEventEmpty(event) ? 'השלמת התיעוד' : 'המשך התיעוד'
}

/**
 * Crew may document a shift-born event from the shift date on. The save RPC checks
 * the shift's date, so read that before the event's own copy of it.
 */
export function shiftBornBeforeShiftDate(
  event: {
    origin?: string | null
    event_date: string
    shift?: { shift_date: string } | null
  },
  today: string,
): boolean {
  if (event.origin !== 'shift') return false
  return (event.shift?.shift_date ?? event.event_date) > today
}

/**
 * Who gets the shared report as an editor. Mirrors save_shift_born_event_fill, so
 * nobody types into a form the server will refuse: a lead or admin always, a crew
 * member from the shift date until the report is complete.
 */
export function shiftBornFillAccess(input: {
  canManage: boolean
  onCrew: boolean
  beforeShiftDate: boolean
  done: boolean
}): { readOnly: boolean; note: string | null } {
  if (input.canManage) return { readOnly: false, note: null }
  if (!input.onCrew || input.done) return { readOnly: true, note: null }
  if (input.beforeShiftDate) return { readOnly: true, note: SHIFT_BORN_TOO_EARLY }
  return { readOnly: false, note: null }
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
