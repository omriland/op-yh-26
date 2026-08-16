import type { EventStatus, StampDescriptor } from './status'

export const STALE_SAVE_MESSAGE = 'מישהו שמר לפניך — רעננו'
export const COUNT_DECREASE_BLOCKED = 'לא ניתן להקטין — קיימים אירועים שמולאו'
export const SHIFT_BORN_CHIP = 'ממשמרת'
export const NO_POLICE_EVENT_ID = 'ללא מספר'

export type EventOrigin = 'manual' | 'shift'

export type ShiftBornEventSnapshot = {
  status: EventStatus
  police_event_id: string | null
  treatment_detail: string | null
  treatment_notes: string | null
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
    event.treated_count <= 0
  )
}

export function shiftBornFillStamp(event: ShiftBornEventSnapshot): StampDescriptor {
  if (event.status === 'done') return { label: 'הושלם', tone: 'done' }
  if (isShiftBornEventEmpty(event)) return { label: 'ריק', tone: 'draft' }
  return { label: 'בתהליך', tone: 'partial' }
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
