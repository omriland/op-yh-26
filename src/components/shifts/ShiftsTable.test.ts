import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ShiftListItem } from '../../lib/shifts'
import { ShiftsTable } from './ShiftsTable'

function shiftWith(born: ShiftListItem['born_events']): ShiftListItem {
  return {
    id: 'shift-1',
    shift_date: '2026-11-04',
    shift_kind: 'midday',
    vehicle_type: 'patrol_center',
    status: 'closed',
    odometer_start: 1,
    odometer_end: 2,
    personal_vehicle: null,
    shift_lead: { full_name: 'אהרון בן ססי', callsign: '1' },
    responders: [
      { id: 'r1', responder_id: 'u1' },
      { id: 'r2', responder_id: 'u2' },
    ],
    linked_events: [],
    last_saved: { full_name: 'איל הררי' },
    born_events: born,
  }
}

describe('ShiftsTable event count', () => {
  it('hovers the real count for a shift with two events', () => {
    const html = renderToStaticMarkup(
      createElement(ShiftsTable, {
        shifts: [
          shiftWith([
            {
              id: 'e-accident',
              event_date: '2026-11-04',
              police_event_id: '5025',
              status: 'done',
              treatment_detail: null,
              treatment_notes: null,
              road_id: null,
              location: null,
              emergency_means: false,
              event_type: { name: 'תאונה' },
              last_saved: { full_name: 'איל הררי' },
              treated: [],
            },
            {
              id: 'e-stuck',
              event_date: '2026-11-04',
              police_event_id: '5325',
              status: 'done',
              treatment_detail: null,
              treatment_notes: null,
              road_id: null,
              location: null,
              emergency_means: false,
              event_type: { name: 'תקוע' },
              last_saved: { full_name: 'איל הררי' },
              treated: [],
            },
          ]),
        ],
        onOpen: () => undefined,
      }),
    )
    expect(html).toContain('title="2 אירועים"')
    expect(html).toContain('>2<')
    expect(html).not.toContain('אירוע אחד')
  })
})

describe('ShiftsTable day groups', () => {
  it('heads each day once, above that day’s shifts', () => {
    const html = renderToStaticMarkup(
      createElement(ShiftsTable, {
        shifts: [
          { ...shiftWith([]), id: 'a', shift_date: '2026-11-04' },
          { ...shiftWith([]), id: 'b', shift_date: '2026-11-04' },
          { ...shiftWith([]), id: 'c', shift_date: '2026-11-03' },
        ],
        onOpen: () => {},
      }),
    )
    expect(html.match(/table-row--day/g)).toHaveLength(2)
    expect(html.indexOf('04.11.2026')).toBeLessThan(html.indexOf('03.11.2026'))
  })
})
