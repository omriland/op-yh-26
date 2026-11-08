import { describe, expect, it } from 'vitest'
import {
  listShiftEvents,
  shiftEventCount,
  shiftEventCountLabel,
  shiftListDestination,
} from './shiftListEvents'

const accident = {
  id: 'e-accident',
  event_type_id: 'type-accident',
  police_event_id: '5025',
  notes: 'תאונה',
}
const stuck = {
  id: 'e-stuck',
  event_type_id: 'type-stuck',
  police_event_id: '5325',
  notes: 'תקוע',
}

describe('shift event count', () => {
  it('reports 2 for a shift with two events', () => {
    expect(shiftEventCount([accident, stuck])).toBe(2)
    expect(shiftEventCountLabel(2)).toBe('2 אירועים')
  })

  it('does not collapse two events that share a type or a police number', () => {
    expect(
      shiftEventCount([
        accident,
        { ...stuck, event_type_id: accident.event_type_id, police_event_id: accident.police_event_id },
      ]),
    ).toBe(2)
  })

  it('keeps a single embedded event as one, and says אירוע אחד', () => {
    expect(shiftEventCount(accident)).toBe(1)
    expect(shiftEventCountLabel(1)).toBe('אירוע אחד')
    expect(shiftEventCount(null)).toBe(0)
    expect(shiftEventCountLabel(0)).toBe('0 אירועים')
  })
})

describe('shift list navigation', () => {
  it('opens the shift page and keeps both events', () => {
    expect(shiftListDestination([accident, stuck])).toEqual({
      kind: 'shift',
      eventIds: ['e-accident', 'e-stuck'],
    })
  })

  it('opens the shift page when there is exactly one event', () => {
    expect(shiftListDestination([accident])).toEqual({
      kind: 'shift',
      eventIds: ['e-accident'],
    })
  })

  it('does not drop the second event when the payload is not an array of the first child', () => {
    const destination = shiftListDestination([accident, stuck])
    expect(destination.eventIds).toContain('e-stuck')
    expect(listShiftEvents([accident, stuck]).map((event) => event.notes)).toEqual(['תאונה', 'תקוע'])
  })
})
