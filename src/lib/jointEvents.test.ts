import { describe, expect, it } from 'vitest'
import {
  JOINT_EVENT_CONFIRM_HINT,
  JOINT_EVENT_CONFIRM_TITLE,
  JOINT_EVENT_LINE_LABEL,
  countEventsWithJointPairsOnce,
  jointPartnerHref,
  jointSaveDecision,
  type JointEventRow,
} from './jointEvents'

function row(overrides: Partial<JointEventRow> & Pick<JointEventRow, 'id'>): JointEventRow {
  return {
    event_date: '2026-11-20',
    police_event_id: '12345',
    origin: 'manual',
    is_cancelled: false,
    ...overrides,
  }
}

describe('texts', () => {
  it('uses the exact confirm sentences', () => {
    expect(JOINT_EVENT_CONFIRM_TITLE).toBe(
      'אירוע זה יתמזג עם אירוע קיים באותו התאריך. האם ברצונך להמשיך?',
    )
    expect(JOINT_EVENT_CONFIRM_HINT).toBe(
      'תופעה זו יכולה לקרות כאשר משמרת ומתנדב ברכב פרטי טיפלו באותו האירוע יחד',
    )
    expect(JOINT_EVENT_LINE_LABEL).toBe('אירוע משותף עם')
  })
})

describe('jointSaveDecision', () => {
  const base = { eventDate: '2026-11-20', policeEventId: '12345' }

  it('is free when nothing shares the number', () => {
    expect(jointSaveDecision({ ...base, origin: 'manual', existing: [] })).toBe('free')
  })

  it('asks to confirm a manual event beside one shift event', () => {
    const existing = [row({ id: 's1', origin: 'shift' })]
    expect(jointSaveDecision({ ...base, origin: 'manual', existing })).toBe('confirm')
  })

  it('asks to confirm a shift event beside one manual event', () => {
    const existing = [row({ id: 'm1', origin: 'manual' })]
    expect(jointSaveDecision({ ...base, origin: 'shift', existing })).toBe('confirm')
  })

  it('blocks a second manual event', () => {
    const existing = [row({ id: 'm1', origin: 'manual' })]
    expect(jointSaveDecision({ ...base, origin: 'manual', existing })).toBe('blocked')
  })

  it('blocks a second shift event', () => {
    const existing = [row({ id: 's1', origin: 'shift' })]
    expect(jointSaveDecision({ ...base, origin: 'shift', existing })).toBe('blocked')
  })

  it('blocks a third event when a pair already exists', () => {
    const existing = [row({ id: 'm1', origin: 'manual' }), row({ id: 's1', origin: 'shift' })]
    expect(jointSaveDecision({ ...base, origin: 'manual', existing })).toBe('blocked')
    expect(jointSaveDecision({ ...base, origin: 'shift', existing })).toBe('blocked')
  })

  it('ignores cancelled events and other dates', () => {
    const existing = [
      row({ id: 's1', origin: 'shift', is_cancelled: true }),
      row({ id: 's2', origin: 'shift', event_date: '2026-11-19' }),
    ]
    expect(jointSaveDecision({ ...base, origin: 'manual', existing })).toBe('free')
  })

  it('trims the number and ignores other numbers', () => {
    const existing = [row({ id: 's1', origin: 'shift' }), row({ id: 's2', origin: 'shift', police_event_id: '999' })]
    expect(jointSaveDecision({ ...base, policeEventId: ' 12345 ', origin: 'manual', existing })).toBe('confirm')
    expect(jointSaveDecision({ ...base, policeEventId: '777', origin: 'manual', existing })).toBe('free')
  })

  it('does not collide with the event being edited', () => {
    const existing = [row({ id: 'm1', origin: 'manual' })]
    expect(
      jointSaveDecision({ ...base, origin: 'manual', currentEventId: 'm1', existing }),
    ).toBe('free')
  })

  it('does not ask again when the edited event is already half of the pair', () => {
    const existing = [row({ id: 'm1', origin: 'manual' }), row({ id: 's1', origin: 'shift' })]
    expect(
      jointSaveDecision({ ...base, origin: 'manual', currentEventId: 'm1', existing }),
    ).toBe('free')
  })

  it('asks to confirm when an edited event not yet in a pair takes a number used by a shift event', () => {
    const existing = [
      row({ id: 'm1', origin: 'manual', police_event_id: '555' }),
      row({ id: 's1', origin: 'shift' }),
    ]
    expect(
      jointSaveDecision({ ...base, origin: 'manual', currentEventId: 'm1', existing }),
    ).toBe('confirm')
  })

  it('is free for an empty number', () => {
    const existing = [row({ id: 's1', origin: 'shift', police_event_id: '' })]
    expect(jointSaveDecision({ ...base, policeEventId: ' ', origin: 'manual', existing })).toBe('free')
  })
})

describe('jointPartnerHref', () => {
  it('links a regular partner to the event detail page', () => {
    expect(jointPartnerHref({ id: 'e1', origin: 'manual', shift_id: null })).toBe('/events/e1')
  })

  it('links a shift partner to the shift report', () => {
    expect(jointPartnerHref({ id: 'e2', origin: 'shift', shift_id: 'sh9' })).toBe(
      '/shifts/sh9/event/e2',
    )
  })
})

describe('counting a joint pair once', () => {
  it('counts a manual and a shift event with one number and date as one event', () => {
    const events = [row({ id: 'm1', origin: 'manual' }), row({ id: 's1', origin: 'shift' })]
    expect(countEventsWithJointPairsOnce(events)).toBe(1)
  })

  it('counts two manual events with the same number and date as two', () => {
    const events = [row({ id: 'm1', origin: 'manual' }), row({ id: 'm2', origin: 'manual' })]
    expect(countEventsWithJointPairsOnce(events)).toBe(2)
  })

  it('counts two shift events with the same number and date as two', () => {
    const events = [row({ id: 's1', origin: 'shift' }), row({ id: 's2', origin: 'shift' })]
    expect(countEventsWithJointPairsOnce(events)).toBe(2)
  })

  it('does not merge a manual and a shift event on different dates', () => {
    const events = [
      row({ id: 'm1', origin: 'manual' }),
      row({ id: 's1', origin: 'shift', event_date: '2026-11-21' }),
    ]
    expect(countEventsWithJointPairsOnce(events)).toBe(2)
  })

  it('does not merge a manual and a shift event with different numbers', () => {
    const events = [
      row({ id: 'm1', origin: 'manual' }),
      row({ id: 's1', origin: 'shift', police_event_id: '999' }),
    ]
    expect(countEventsWithJointPairsOnce(events)).toBe(2)
  })

  it('trims the number when pairing', () => {
    const events = [
      row({ id: 'm1', origin: 'manual', police_event_id: ' 12345' }),
      row({ id: 's1', origin: 'shift', police_event_id: '12345 ' }),
    ]
    expect(countEventsWithJointPairsOnce(events)).toBe(1)
  })

  it('skips cancelled events', () => {
    const events = [
      row({ id: 'm1', origin: 'manual', is_cancelled: true }),
      row({ id: 'm2', origin: 'manual' }),
      row({ id: 's1', origin: 'shift' }),
    ]
    expect(countEventsWithJointPairsOnce(events)).toBe(1)
  })

  it('counts events without a number one each, even across origins', () => {
    const events = [
      row({ id: 'a', police_event_id: null }),
      row({ id: 'b', police_event_id: null, origin: 'shift' }),
    ]
    expect(countEventsWithJointPairsOnce(events)).toBe(2)
  })
})
