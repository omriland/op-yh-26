import { describe, expect, it } from 'vitest'
import {
  EVENT_FILTERS,
  EVENT_STATUS_ORDER,
  eventStamp,
  eventStatusTrailSteps,
  splitRespondersByParticipation,
} from './status'

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
})
