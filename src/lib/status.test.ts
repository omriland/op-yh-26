import { describe, expect, it } from 'vitest'
import {
  AWAITING_LEAD_DETAILS_NOTE,
  leadKmPendingNote,
  mineInboxIsOpen,
  mineParticipationStamp,
  shiftStamp,
  storedStatusLabel,
  splitRespondersByParticipation,
} from './status'

describe('shift status vocabulary', () => {
  it('labels logging progress, not a live-shift claim', () => {
    expect(shiftStamp('in_progress').label).toBe('פתוחה')
    expect(shiftStamp('draft').label).toBe('טיוטה')
    expect(shiftStamp('closed').label).toBe('נסגרה')
  })
})

describe('storedStatusLabel', () => {
  it('reads a stored status in the lifecycle vocabulary', () => {
    expect(storedStatusLabel('draft')).toBe('טיוטה')
    expect(storedStatusLabel('in_progress')).toBe('ממתין למתנדב')
    expect(storedStatusLabel('partial')).toBe('תועד חלקית')
    expect(storedStatusLabel('done')).toBe('תועד')
  })
})

describe('splitRespondersByParticipation', () => {
  it('groups done, draft-saved, and waiting responders by name', () => {
    expect(
      splitRespondersByParticipation([
        { status: 'done', name: 'א' },
        { status: 'in_progress', name: 'ב' },
        { status: 'pending', name: 'ג' },
      ]),
    ).toEqual({ done: ['א'], draft: ['ב'], pending: ['ג'] })
  })
})

describe('leadKmPendingNote', () => {
  it('notes that the lead has not logged KM when fill is done', () => {
    expect(leadKmPendingNote('done', null)).toBe('אחמ״ש טרם הזין ק״מ')
    expect(leadKmPendingNote('done', 0)).toBeNull()
    expect(leadKmPendingNote('done', 12)).toBeNull()
    expect(leadKmPendingNote('in_progress', null)).toBeNull()
    expect(leadKmPendingNote(null, null)).toBeNull()
  })

  it('never shows the lead-KM note on shift-origin events', () => {
    expect(leadKmPendingNote('done', null, 'shift')).toBeNull()
  })

  it('prefers ממתין לפרטים נוספים מאחמ״ש when lead done-gate fields are missing', () => {
    expect(leadKmPendingNote('done', 12, 'manual', true)).toBe(AWAITING_LEAD_DETAILS_NOTE)
    expect(leadKmPendingNote('done', null, 'manual', true)).toBe(AWAITING_LEAD_DETAILS_NOTE)
    expect(leadKmPendingNote('done', 12, 'shift', true)).toBeNull()
  })

  it('keeps done-without-KM events on ממתינים לתיעוד', () => {
    expect(mineInboxIsOpen('pending', null)).toBe(true)
    expect(mineInboxIsOpen('done', null)).toBe(true)
    expect(mineInboxIsOpen('done', 0)).toBe(false)
    expect(mineInboxIsOpen('done', 12)).toBe(false)
  })
})

describe('mineParticipationStamp', () => {
  it('shows סיימת לתעד when the responder finished and lead KM is missing', () => {
    expect(mineParticipationStamp('done', null)).toEqual({
      label: 'סיימת לתעד',
      tone: 'done',
    })
  })

  it('keeps הושלם once lead KM is entered', () => {
    expect(mineParticipationStamp('done', 0)).toEqual({ label: 'הושלם', tone: 'done' })
    expect(mineParticipationStamp('done', 12)).toEqual({ label: 'הושלם', tone: 'done' })
  })

  it('shows סיימת לתעד when the responder finished but the lead still owes details', () => {
    expect(mineParticipationStamp('done', 12, { missingLeadDetails: true })).toEqual({
      label: 'סיימת לתעד',
      tone: 'done',
    })
  })

  it('does not treat another responder’s open fill as the viewer’s problem', () => {
    expect(mineParticipationStamp('done', 12, { missingLeadDetails: false })).toEqual({
      label: 'הושלם',
      tone: 'done',
    })
  })
})
