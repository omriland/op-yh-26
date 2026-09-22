import { describe, expect, it } from 'vitest'
import { eventReleasedToResponders } from './eventResponderRelease'

describe('eventReleasedToResponders', () => {
  it('holds a manual event until מספר אירוע is entered', () => {
    expect(eventReleasedToResponders({ origin: 'manual', policeEventId: null })).toBe(false)
    expect(eventReleasedToResponders({ origin: 'manual', policeEventId: '   ' })).toBe(false)
    expect(eventReleasedToResponders({ origin: undefined, policeEventId: '' })).toBe(false)
  })

  it('releases once מספר אירוע is present', () => {
    expect(eventReleasedToResponders({ origin: 'manual', policeEventId: '12345' })).toBe(true)
  })

  it('never holds a shift-born event — responders fill those before a police id exists', () => {
    expect(eventReleasedToResponders({ origin: 'shift', policeEventId: null })).toBe(true)
    expect(eventReleasedToResponders({ origin: 'shift', policeEventId: '' })).toBe(true)
  })
})
