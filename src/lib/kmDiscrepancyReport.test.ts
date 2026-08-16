import { describe, expect, it } from 'vitest'
import {
  buildKmDiscrepancyRows,
  policeEventLabel,
  resolveLeadKmReplacement,
  responderKm,
  type KmDiscrepancyEventSource,
} from './kmDiscrepancyReport'

const range = { from: '2026-08-01', to: '2026-08-31' }

function event(
  partial: Partial<KmDiscrepancyEventSource> & Pick<KmDiscrepancyEventSource, 'id'>,
): KmDiscrepancyEventSource {
  return {
    id: partial.id,
    event_date: partial.event_date ?? '2026-08-10',
    is_cancelled: partial.is_cancelled ?? false,
    police_event_id: partial.police_event_id ?? 'P-1',
    location: partial.location ?? 'צומת',
    road: partial.road ?? { name: 'כביש 1' },
    shift_lead: partial.shift_lead ?? { full_name: 'ליאור', callsign: 'L1' },
    responders: partial.responders ?? [
      {
        id: 'a1',
        responder_id: 'r1',
        status: 'done',
        total_km: 10,
        odometer_start: 100,
        odometer_end: 118,
        profile: { full_name: 'דנה כהן', callsign: 'D1' },
      },
    ],
  }
}

describe('responderKm', () => {
  it('returns end minus start when both are set', () => {
    expect(responderKm(100, 118)).toBe(18)
  })

  it('returns null when either odometer is missing', () => {
    expect(responderKm(null, 118)).toBeNull()
    expect(responderKm(100, null)).toBeNull()
  })
})

describe('policeEventLabel', () => {
  it('marks cancelled events like חריגי ק״מ', () => {
    expect(policeEventLabel('P-1', true)).toBe('בוטל · P-1')
    expect(policeEventLabel(null, true)).toBe('בוטל')
    expect(policeEventLabel('P-1', false)).toBe('P-1')
    expect(policeEventLabel(null, false)).toBe('—')
  })
})

describe('buildKmDiscrepancyRows', () => {
  it('includes done participations with a km gap, including cancelled', () => {
    const rows = buildKmDiscrepancyRows(
      [
        event({ id: 'gap' }),
        event({
          id: 'cancelled',
          is_cancelled: true,
          police_event_id: 'P-9',
          responders: [
            {
              id: 'a9',
              responder_id: 'r9',
              status: 'done',
              total_km: 5,
              odometer_start: 0,
              odometer_end: 9,
              profile: { full_name: 'משה', callsign: 'M1' },
            },
          ],
        }),
      ],
      range,
    )
    expect(rows.map((row) => [row.event_id, row.lead_km, row.responder_km, row.diff])).toEqual([
      ['gap', 10, 18, 8],
      ['cancelled', 5, 9, 4],
    ])
  })

  it('excludes open fills, missing lead km, missing odometers, equal numbers, and dates outside range', () => {
    const rows = buildKmDiscrepancyRows(
      [
        event({
          id: 'pending',
          responders: [
            {
              id: 'a',
              responder_id: 'r',
              status: 'pending',
              total_km: 10,
              odometer_start: 100,
              odometer_end: 120,
              profile: { full_name: 'א', callsign: 'A' },
            },
          ],
        }),
        event({
          id: 'draft-fill',
          responders: [
            {
              id: 'a',
              responder_id: 'r',
              status: 'in_progress',
              total_km: 10,
              odometer_start: 100,
              odometer_end: 120,
              profile: { full_name: 'א', callsign: 'A' },
            },
          ],
        }),
        event({
          id: 'no-lead',
          responders: [
            {
              id: 'a',
              responder_id: 'r',
              status: 'done',
              total_km: null,
              odometer_start: 100,
              odometer_end: 120,
              profile: { full_name: 'א', callsign: 'A' },
            },
          ],
        }),
        event({
          id: 'no-odo',
          responders: [
            {
              id: 'a',
              responder_id: 'r',
              status: 'done',
              total_km: 10,
              odometer_start: 100,
              odometer_end: null,
              profile: { full_name: 'א', callsign: 'A' },
            },
          ],
        }),
        event({
          id: 'equal',
          responders: [
            {
              id: 'a',
              responder_id: 'r',
              status: 'done',
              total_km: 20,
              odometer_start: 100,
              odometer_end: 120,
              profile: { full_name: 'א', callsign: 'A' },
            },
          ],
        }),
        event({ id: 'old', event_date: '2026-07-31' }),
        event({ id: 'future', event_date: '2026-09-01' }),
      ],
      range,
    )
    expect(rows).toEqual([])
  })

  it('emits one row per gapped volunteer on the same event', () => {
    const rows = buildKmDiscrepancyRows(
      [
        event({
          id: 'multi',
          responders: [
            {
              id: 'a1',
              responder_id: 'r1',
              status: 'done',
              total_km: 10,
              odometer_start: 0,
              odometer_end: 12,
              profile: { full_name: 'דנה', callsign: 'D1' },
            },
            {
              id: 'a2',
              responder_id: 'r2',
              status: 'done',
              total_km: 10,
              odometer_start: 0,
              odometer_end: 10,
              profile: { full_name: 'יוסי', callsign: 'Y2' },
            },
            {
              id: 'a3',
              responder_id: 'r3',
              status: 'done',
              total_km: 8,
              odometer_start: 0,
              odometer_end: 20,
              profile: { full_name: 'משה', callsign: 'M1' },
            },
          ],
        }),
      ],
      range,
    )
    expect(rows.map((row) => [row.assignment_id, row.responder_callsign, row.diff])).toEqual([
      ['a3', 'M1', 12],
      ['a1', 'D1', 2],
    ])
  })

  it('sorts by event_date desc, then absolute diff desc, then responder name', () => {
    const rows = buildKmDiscrepancyRows(
      [
        event({
          id: 'old',
          event_date: '2026-08-01',
          responders: [
            {
              id: 'a-old',
              responder_id: 'r',
              status: 'done',
              total_km: 1,
              odometer_start: 0,
              odometer_end: 50,
              profile: { full_name: 'ישן', callsign: 'O' },
            },
          ],
        }),
        event({
          id: 'new',
          event_date: '2026-08-20',
          responders: [
            {
              id: 'a-low',
              responder_id: 'r1',
              status: 'done',
              total_km: 10,
              odometer_start: 0,
              odometer_end: 12,
              profile: { full_name: 'בני', callsign: 'B' },
            },
            {
              id: 'a-high',
              responder_id: 'r2',
              status: 'done',
              total_km: 10,
              odometer_start: 0,
              odometer_end: 40,
              profile: { full_name: 'אבי', callsign: 'A' },
            },
          ],
        }),
      ],
      range,
    )
    expect(rows.map((row) => row.assignment_id)).toEqual(['a-high', 'a-low', 'a-old'])
  })

  it('includes zero lead km when the odometer delta differs', () => {
    const rows = buildKmDiscrepancyRows(
      [
        event({
          id: 'zero',
          responders: [
            {
              id: 'a0',
              responder_id: 'r',
              status: 'done',
              total_km: 0,
              odometer_start: 10,
              odometer_end: 15,
              profile: { full_name: 'א', callsign: 'A' },
            },
          ],
        }),
      ],
      range,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]?.lead_km).toBe(0)
    expect(rows[0]?.responder_km).toBe(5)
    expect(rows[0]?.diff).toBe(5)
  })
})

describe('resolveLeadKmReplacement', () => {
  it('returns the odometer delta when a gap remains', () => {
    expect(
      resolveLeadKmReplacement({ total_km: 10, odometer_start: 100, odometer_end: 118 }),
    ).toEqual({ status: 'replace', totalKm: 18 })
  })

  it('treats an already-aligned row as success', () => {
    expect(
      resolveLeadKmReplacement({ total_km: 18, odometer_start: 100, odometer_end: 118 }),
    ).toEqual({ status: 'already_aligned' })
  })

  it('rejects missing numbers', () => {
    expect(
      resolveLeadKmReplacement({ total_km: null, odometer_start: 100, odometer_end: 118 }),
    ).toEqual({ status: 'invalid' })
    expect(
      resolveLeadKmReplacement({ total_km: 10, odometer_start: null, odometer_end: 118 }),
    ).toEqual({ status: 'invalid' })
  })
})
