import { describe, expect, it } from 'vitest'
import {
  FOREIGN_EVENT_EDIT_BODY,
  FOREIGN_EVENT_EDIT_LEAD_FALLBACK,
  foreignEventEditLeadName,
  foreignEventEditTitle,
  isForeignShiftLeadEvent,
} from './foreignEventEdit'

describe('isForeignShiftLeadEvent', () => {
  it('is true only when another lead created the event', () => {
    expect(isForeignShiftLeadEvent({ viewerId: 'me', shiftLeadId: 'them' })).toBe(true)
    expect(isForeignShiftLeadEvent({ viewerId: 'me', shiftLeadId: 'me' })).toBe(false)
  })

  it('is false when either id is missing', () => {
    expect(isForeignShiftLeadEvent({ viewerId: 'me', shiftLeadId: null })).toBe(false)
    expect(isForeignShiftLeadEvent({ viewerId: undefined, shiftLeadId: 'them' })).toBe(false)
    expect(isForeignShiftLeadEvent({ viewerId: '  ', shiftLeadId: 'them' })).toBe(false)
  })
})

describe('foreignEventEdit copy', () => {
  it('uses the lead name in the exact confirm title', () => {
    expect(foreignEventEditTitle('דנה כהן')).toBe(
      'האם אתה בטוח שברצונך לערוך אירוע שהוזן על ידי דנה כהן?',
    )
    expect(FOREIGN_EVENT_EDIT_BODY).toBe('כל שינוי שתבצע יתועד ויישמר במערכת')
  })

  it('falls back from empty name to callsign, then a generic lead', () => {
    expect(foreignEventEditLeadName({ full_name: '  ', callsign: 'A12' })).toBe('A12')
    expect(foreignEventEditLeadName({ full_name: '', callsign: '' })).toBe(
      FOREIGN_EVENT_EDIT_LEAD_FALLBACK,
    )
  })
})
