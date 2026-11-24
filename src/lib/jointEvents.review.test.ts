import { describe, expect, it } from 'vitest'
import {
  jointConfirmKey,
  jointPartnerHref,
  jointSaveDecision,
  type JointEventRow,
} from './jointEvents'
import { keepCountedEvents } from './reports/summaryDetail'

function row(id: string, origin: 'manual' | 'shift', policeEventId: string): JointEventRow {
  return { id, event_date: '2026-11-20', police_event_id: policeEventId, origin }
}

describe('jointSaveDecision number matching', () => {
  it('compares digits only, like the lookup', () => {
    expect(
      jointSaveDecision({
        eventDate: '2026-11-20',
        policeEventId: '12-345',
        origin: 'manual',
        existing: [row('m1', 'manual', '12345')],
      }),
    ).toBe('blocked')
  })

  it('blocks a unit ID that another origin already holds', () => {
    expect(
      jointSaveDecision({
        eventDate: '2026-11-20',
        policeEventId: 'AB12CD',
        origin: 'manual',
        existing: [row('s1', 'shift', 'AB12CD')],
      }),
    ).toBe('blocked')
  })
})

describe('jointConfirmKey', () => {
  it('gives one key for the same date and number however it is typed', () => {
    expect(jointConfirmKey(' 2026-11-20', ' 12-345 ')).toBe(jointConfirmKey('2026-11-20', '12345'))
  })
})

describe('jointPartnerHref for volunteers', () => {
  it('links into the personal lists', () => {
    expect(jointPartnerHref({ id: 'e1', origin: 'manual', shift_id: null }, false)).toBe('/mine/e1')
    expect(jointPartnerHref({ id: 'e2', origin: 'shift', shift_id: 'sh9' }, false)).toBe(
      '/my-shifts/sh9/event/e2',
    )
  })
})

describe('keepCountedEvents', () => {
  it('drops the events the summary did not count', () => {
    expect(keepCountedEvents([{ id: 'a' }, { id: 'b' }], new Set(['b']))).toEqual([{ id: 'a' }])
  })
})
