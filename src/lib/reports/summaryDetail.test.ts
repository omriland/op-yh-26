import { describe, expect, it } from 'vitest'
import type { EventsByResponderEventSource } from '../eventsByResponderReport'
import { responderEventRows, wholeEventRow } from './summaryDetail'

const event: Omit<EventsByResponderEventSource, 'responders'> = {
  id: 'e1',
  event_date: '2026-11-10',
  is_cancelled: false,
  police_event_id: null,
  location: null,
  event_type: null,
  district: null,
  road: { name: 'כביש 1' },
  shift_lead: null,
}

const person = (name: string) => ({ full_name: name, callsign: '' })

describe('wholeEventRow', () => {
  it('keeps an event with no responders, with zero km', () => {
    const row = wholeEventRow({ ...event, responders: [] })
    expect(row.responder_name).toBeNull()
    expect(row.total_km).toBe(0)
  })

  it('lists every responder and sums only the km the summary counts', () => {
    const row = wholeEventRow({
      ...event,
      responders: [
        { responder_id: 'a', total_km: 10, profile: person('אבי') },
        { responder_id: 'b', total_km: 5, profile: person('בני') },
        { responder_id: 'c', total_km: 99, frozen_over_60km: true, profile: person('גדי') },
      ],
    })
    expect(row.responder_name).toBe('אבי، בני، גדי')
    expect(row.total_km).toBe(15)
  })
})

describe('responderEventRows', () => {
  it('shows no km for a frozen participation', () => {
    const rows = responderEventRows(
      [
        {
          responder_id: 'a',
          total_km: 70,
          frozen_suspicious_duplicate: true,
          profile: person('אבי'),
          event,
        },
      ],
      { from: '2026-11-01', to: '2026-11-30' },
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].total_km).toBeNull()
  })
})
