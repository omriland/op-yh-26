import { describe, expect, it } from 'vitest'
import {
  COUNT_DECREASE_BLOCKED,
  SHIFT_BORN_TYPE_MARK,
  STALE_SAVE_MESSAGE,
  eventLeadDisplayName,
  eventTypeName,
  isShiftBornEventEmpty,
  lastSavedByLabel,
  shiftBornFillStamp,
  type ShiftBornEventSnapshot,
} from './shiftBornEvents'

function snapshot(patch: Partial<ShiftBornEventSnapshot> = {}): ShiftBornEventSnapshot {
  return {
    status: 'in_progress',
    police_event_id: null,
    treatment_detail: null,
    treatment_notes: null,
    treated_count: 0,
    ...patch,
  }
}

describe('isShiftBornEventEmpty', () => {
  it('is empty when every shared field is blank', () => {
    expect(isShiftBornEventEmpty(snapshot())).toBe(true)
    expect(isShiftBornEventEmpty(snapshot({ police_event_id: '   ' }))).toBe(true)
  })

  it('is filled when any shared field has content', () => {
    expect(isShiftBornEventEmpty(snapshot({ police_event_id: '12' }))).toBe(false)
    expect(isShiftBornEventEmpty(snapshot({ treatment_detail: 'חילוץ' }))).toBe(false)
    expect(isShiftBornEventEmpty(snapshot({ treatment_notes: 'הערה' }))).toBe(false)
    expect(isShiftBornEventEmpty(snapshot({ treated_count: 1 }))).toBe(false)
    expect(isShiftBornEventEmpty(snapshot({ road_id: 'road-1' }))).toBe(false)
    expect(isShiftBornEventEmpty(snapshot({ location: 'צומת' }))).toBe(false)
  })
})

describe('shiftBornFillStamp', () => {
  it('marks done events as completed', () => {
    expect(shiftBornFillStamp(snapshot({ status: 'done', police_event_id: '1' }))).toEqual({
      label: 'הושלם',
      tone: 'done',
    })
  })

  it('marks empty open events as waiting for details', () => {
    expect(shiftBornFillStamp(snapshot())).toEqual({
      label: 'ממתין לתיעוד',
      tone: 'draft',
    })
  })

  it('marks non-empty open events as draft saved, like a regular event', () => {
    expect(shiftBornFillStamp(snapshot({ treatment_detail: 'טיפול' }))).toEqual({
      label: 'טיוטה נשמרה',
      tone: 'draft',
    })
  })
})

describe('eventLeadDisplayName', () => {
  it('hides אחמ״ש on shift-born events', () => {
    expect(eventLeadDisplayName('shift', 'עמרי')).toBeNull()
  })

  it('keeps the lead name on standalone events', () => {
    expect(eventLeadDisplayName('manual', 'עמרי')).toBe('עמרי')
    expect(eventLeadDisplayName('manual', '  ')).toBeNull()
  })
})

describe('lastSavedByLabel', () => {
  it('returns Hebrew last-saved copy', () => {
    expect(lastSavedByLabel('עמרי')).toBe('נשמר ע״י עמרי')
    expect(lastSavedByLabel(null)).toBeNull()
    expect(lastSavedByLabel('  ')).toBeNull()
  })
})

describe('eventTypeName', () => {
  it('appends (משמרת) next to the type on shift-born events', () => {
    expect(SHIFT_BORN_TYPE_MARK).toBe('(משמרת)')
    expect(eventTypeName('גרירה', 'shift')).toBe('גרירה (משמרת)')
    expect(eventTypeName('גרירה', 'manual')).toBe('גרירה')
    expect(eventTypeName('גרירה')).toBe('גרירה')
  })
})

describe('locked Hebrew errors', () => {
  it('keeps the approved stale-save and decrease copy', () => {
    expect(STALE_SAVE_MESSAGE).toBe('מישהו שמר לפניך — רעננו')
    expect(COUNT_DECREASE_BLOCKED).toBe('לא ניתן להקטין — קיימים אירועים שמולאו')
  })
})
