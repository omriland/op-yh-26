import { describe, expect, it } from 'vitest'
import { eventReleasedToResponders } from './eventResponderRelease'

const ready = {
  origin: 'manual' as const,
  policeEventId: '12345',
  patrolCallsignNumber: '411',
  hasRoad: true,
}

describe('eventReleasedToResponders', () => {
  it('holds a manual event until או״ק, כביש, and מספר אירוע are all entered', () => {
    expect(eventReleasedToResponders({ ...ready, policeEventId: null })).toBe(false)
    expect(eventReleasedToResponders({ ...ready, policeEventId: '   ' })).toBe(false)
    expect(eventReleasedToResponders({ ...ready, origin: undefined, policeEventId: '' })).toBe(false)
    expect(eventReleasedToResponders({ ...ready, patrolCallsignNumber: '' })).toBe(false)
    expect(eventReleasedToResponders({ ...ready, patrolCallsignNumber: '   ', hasRoad: true })).toBe(false)
    expect(eventReleasedToResponders({ ...ready, hasRoad: false })).toBe(false)
    expect(eventReleasedToResponders({ ...ready, roadId: '   ', hasRoad: undefined })).toBe(false)
  })

  it('releases once או״ק, כביש, and מספר אירוע are present', () => {
    expect(eventReleasedToResponders(ready)).toBe(true)
    expect(
      eventReleasedToResponders({
        origin: 'manual',
        policeEventId: '12345',
        patrolCallsign: 'ניידת 1',
        roadId: 'road-6',
      }),
    ).toBe(true)
  })

  it('never holds a shift-born event — responders fill those before a police id exists', () => {
    expect(eventReleasedToResponders({ origin: 'shift', policeEventId: null })).toBe(true)
    expect(eventReleasedToResponders({ origin: 'shift', policeEventId: '' })).toBe(true)
  })
})
