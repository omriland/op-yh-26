import { describe, expect, it } from 'vitest'
import {
  buildEventsByResponderRows,
  type EventsByResponderEventSource,
} from './eventsByResponderReport'

const range = { from: '2026-08-01', to: '2026-08-31' }

function event(
  partial: Partial<EventsByResponderEventSource> & Pick<EventsByResponderEventSource, 'id'>,
): EventsByResponderEventSource {
  return {
    id: partial.id,
    event_date: partial.event_date ?? '2026-08-10',
    is_cancelled: partial.is_cancelled ?? false,
    police_event_id: partial.police_event_id ?? 'P-1',
    location: partial.location ?? 'צומת',
    event_type: partial.event_type ?? { name: 'תאונה' },
    district: partial.district ?? { name: 'מרכז' },
    road: partial.road ?? { name: 'כביש 1' },
    shift_lead: partial.shift_lead ?? { full_name: 'ליאור כהן', callsign: 'L1' },
    responders: partial.responders ?? [
      {
        responder_id: 'r1',
        total_km: 12,
        profile: { full_name: 'דנה לוי', callsign: 'D1' },
      },
    ],
  }
}

describe('buildEventsByResponderRows', () => {
  it('emits one row per volunteer on an event in range', () => {
    const rows = buildEventsByResponderRows(
      [
        event({
          id: 'e1',
          responders: [
            {
              responder_id: 'r1',
              total_km: 12,
              profile: { full_name: 'דנה לוי', callsign: 'D1' },
            },
            {
              responder_id: 'r2',
              total_km: 8,
              profile: { full_name: 'אביב כהן', callsign: 'A1' },
            },
          ],
        }),
      ],
      range,
    )

    expect(rows).toHaveLength(2)
    expect(rows.map((row) => row.responder_id).sort()).toEqual(['r1', 'r2'])
    expect(rows.find((row) => row.responder_id === 'r1')).toMatchObject({
      event_id: 'e1',
      event_date: '2026-08-10',
      police_event_id: 'P-1',
      event_type_name: 'תאונה',
      district_name: 'מרכז',
      road_name: 'כביש 1',
      location: 'צומת',
      shift_lead_name: 'ליאור כהן',
      shift_lead_callsign: 'L1',
      total_km: 12,
      responder_name: 'דנה לוי',
      responder_callsign: 'D1',
    })
  })

  it('keeps events with missing lead km so the row can show —', () => {
    const rows = buildEventsByResponderRows(
      [
        event({
          id: 'e1',
          responders: [{ responder_id: 'r1', total_km: null, profile: { full_name: 'דנה', callsign: 'D1' } }],
        }),
      ],
      range,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]?.total_km).toBeNull()
  })

  it('includes cancelled events and skips dates outside the period', () => {
    const rows = buildEventsByResponderRows(
      [
        event({ id: 'in', is_cancelled: true, police_event_id: 'P-9' }),
        event({ id: 'before', event_date: '2026-07-31' }),
        event({ id: 'after', event_date: '2026-09-01' }),
      ],
      range,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ event_id: 'in', is_cancelled: true, police_event_id: 'P-9' })
  })

  it('sorts by volunteer name, then event date descending within that volunteer', () => {
    const rows = buildEventsByResponderRows(
      [
        event({
          id: 'dana-old',
          event_date: '2026-08-02',
          responders: [{ responder_id: 'dana', total_km: 1, profile: { full_name: 'דנה לוי', callsign: 'D1' } }],
        }),
        event({
          id: 'aviv',
          event_date: '2026-08-20',
          responders: [{ responder_id: 'aviv', total_km: 1, profile: { full_name: 'אביב כהן', callsign: 'A1' } }],
        }),
        event({
          id: 'dana-new',
          event_date: '2026-08-18',
          responders: [{ responder_id: 'dana', total_km: 2, profile: { full_name: 'דנה לוי', callsign: 'D1' } }],
        }),
      ],
      range,
    )

    expect(rows.map((row) => row.event_id)).toEqual(['aviv', 'dana-new', 'dana-old'])
  })
})
