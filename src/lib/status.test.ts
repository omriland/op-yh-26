import { describe, expect, it } from 'vitest'
import {
  EVENT_FILTERS,
  EVENT_STATUS_ORDER,
  eventStamp,
  eventStatusTrailSteps,
  leadKmPendingNote,
  mineInboxIsOpen,
  overlayMissingKmOnDoneStamp,
  reportingDocumentationStamp,
  shiftStamp,
  splitRespondersByParticipation,
} from './status'

describe('shift status vocabulary', () => {
  it('labels logging progress, not a live-shift claim', () => {
    expect(shiftStamp('in_progress').label).toBe('פתוחה')
    expect(shiftStamp('draft').label).toBe('טיוטה')
    expect(shiftStamp('closed').label).toBe('נסגרה')
  })
})

describe('event status vocabulary', () => {
  it('uses the approved Hebrew labels for each event status', () => {
    expect(eventStamp('draft').label).toBe('אירוע בהזנה')
    expect(eventStamp('in_progress').label).toBe('ממתין לתיעוד')
    expect(eventStamp('partial').label).toBe('תועד חלקית')
    expect(eventStamp('done').label).toBe('הושלם')
  })

  it('exposes filter chips with the same labels', () => {
    const byValue = Object.fromEntries(EVENT_FILTERS.map((row) => [row.value, row.label]))
    expect(byValue.draft).toBe('אירוע בהזנה')
    expect(byValue.in_progress).toBe('ממתין לתיעוד')
    expect(byValue.partial).toBe('תועד חלקית')
    expect(byValue.done).toBe('הושלם')
  })

  it('explains each status filter on hover, except הכול', () => {
    const byValue = Object.fromEntries(EVENT_FILTERS.map((row) => [row.value, row.tip]))
    expect(byValue.all).toBeUndefined()
    expect(byValue.in_progress).toBe('הוזן ע"י אחמש וטרם תועד ע"י מתנדב')
    expect(byValue.partial).toBe('מתנדב החל בתיעוד אך לא השלים אותו')
    expect(byValue.done).toBe('אירוע סגור שתועד במלואו')
    expect(byValue.draft).toBe('טיוטה נשמרה ע"י אחמ"ש. טרם זמין למתנדב לתיעוד')
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

describe('eventStatusTrailSteps', () => {
  it('orders the four event statuses', () => {
    expect(EVENT_STATUS_ORDER).toEqual(['draft', 'in_progress', 'partial', 'done'])
  })

  it('marks past, current, and future around the active status', () => {
    const steps = eventStatusTrailSteps('partial')
    expect(steps.map((step) => step.phase)).toEqual(['past', 'past', 'current', 'future'])
    expect(steps[2]?.label).toBe('תועד חלקית')
    expect(steps[2]?.tone).toBe('partial')
  })

  it('marks the first step current when draft', () => {
    expect(eventStatusTrailSteps('draft').map((step) => step.phase)).toEqual([
      'current',
      'future',
      'future',
      'future',
    ])
  })

  it('marks all steps past or current when done', () => {
    expect(eventStatusTrailSteps('done').map((step) => step.phase)).toEqual([
      'past',
      'past',
      'past',
      'current',
    ])
  })

  it('keeps the last node on done but labels it חסר ק״מ when KM is missing', () => {
    const steps = eventStatusTrailSteps('done', { missingKm: true })
    expect(steps.map((step) => step.phase)).toEqual(['past', 'past', 'past', 'current'])
    expect(steps[3]).toMatchObject({
      status: 'done',
      label: 'חסר ק״מ',
      tone: 'alert',
      phase: 'current',
    })
    expect(steps.slice(0, 3).every((step) => step.tone !== 'alert')).toBe(true)
  })

  it('does not overlay חסר ק״מ when the trail is not yet הושלם', () => {
    const steps = eventStatusTrailSteps('partial', { missingKm: true })
    expect(steps[2]).toMatchObject({ label: 'תועד חלקית', tone: 'partial', phase: 'current' })
    expect(steps[3]).toMatchObject({ label: 'הושלם', tone: 'done', phase: 'future' })
  })
})

describe('reportingDocumentationStamp', () => {
  it('maps done + missing KM to red חסר ק״מ without inventing a status', () => {
    expect(reportingDocumentationStamp('done', true)).toEqual({
      label: 'חסר ק״מ',
      tone: 'alert',
    })
    expect(reportingDocumentationStamp('done', false)).toEqual({
      label: 'הושלם',
      tone: 'done',
    })
  })

  it('does not override earlier pipeline stamps even if KM is missing', () => {
    expect(reportingDocumentationStamp('partial', true)).toEqual(eventStamp('partial'))
    expect(reportingDocumentationStamp('in_progress', true)).toEqual(eventStamp('in_progress'))
  })

  it('overlays only a green הושלם stamp', () => {
    expect(overlayMissingKmOnDoneStamp({ label: 'הושלם', tone: 'done' }, true)).toEqual({
      label: 'חסר ק״מ',
      tone: 'alert',
    })
    expect(overlayMissingKmOnDoneStamp({ label: 'הושלם', tone: 'done' }, false)).toEqual({
      label: 'הושלם',
      tone: 'done',
    })
    expect(overlayMissingKmOnDoneStamp({ label: 'טיוטה נשמרה', tone: 'draft' }, true)).toEqual({
      label: 'טיוטה נשמרה',
      tone: 'draft',
    })
  })
})

describe('leadKmPendingNote', () => {
  it('keeps הושלם and only notes that the lead has not logged KM', () => {
    expect(leadKmPendingNote('done', null)).toBe('אחמ״ש טרם הזין ק״מ')
    expect(leadKmPendingNote('done', 0)).toBeNull()
    expect(leadKmPendingNote('done', 12)).toBeNull()
    expect(leadKmPendingNote('in_progress', null)).toBeNull()
    expect(leadKmPendingNote(null, null)).toBeNull()
  })

  it('keeps done-without-KM events on ממתינים לתיעוד', () => {
    expect(mineInboxIsOpen('pending', null)).toBe(true)
    expect(mineInboxIsOpen('done', null)).toBe(true)
    expect(mineInboxIsOpen('done', 0)).toBe(false)
    expect(mineInboxIsOpen('done', 12)).toBe(false)
  })
})
