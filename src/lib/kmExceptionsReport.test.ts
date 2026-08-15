import { describe, expect, it } from 'vitest'
import {
  KM_EXCEPTION_THRESHOLD,
  buildKmExceptionRows,
  type KmExceptionEventSource,
} from './kmExceptionsReport'

function event(partial: Partial<KmExceptionEventSource> & Pick<KmExceptionEventSource, 'id'>): KmExceptionEventSource {
  return {
    id: partial.id,
    event_date: partial.event_date ?? '2026-08-10',
    is_cancelled: partial.is_cancelled ?? false,
    police_event_id: partial.police_event_id ?? null,
    location: partial.location ?? null,
    event_type: partial.event_type ?? { name: 'תאונה' },
    road: partial.road ?? { name: 'כביש 1' },
    shift_lead: partial.shift_lead ?? { full_name: 'אחמש', callsign: 'L1' },
    responders: partial.responders ?? [],
  }
}

describe('KM_EXCEPTION_THRESHOLD', () => {
  it('is 60', () => {
    expect(KM_EXCEPTION_THRESHOLD).toBe(60)
  })
})

describe('buildKmExceptionRows', () => {
  it('includes done responder at exactly 60 km', () => {
    const rows = buildKmExceptionRows([
      event({
        id: 'e1',
        responders: [
          {
            status: 'done',
            total_km: 60,
            profile: { full_name: 'בני', callsign: 'B1' },
          },
        ],
      }),
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      event_id: 'e1',
      total_km: 60,
      responder_name: 'בני',
      responder_callsign: 'B1',
    })
  })

  it('excludes 59 km and null lead km', () => {
    const rows = buildKmExceptionRows([
      event({
        id: 'e1',
        responders: [
          { status: 'done', total_km: 59, profile: { full_name: 'א', callsign: 'A' } },
          { status: 'done', total_km: null, profile: { full_name: 'ב', callsign: 'B' } },
        ],
      }),
    ])
    expect(rows).toEqual([])
  })

  it('includes lead-entered km >= 60 even when participation is not done', () => {
    const rows = buildKmExceptionRows([
      event({
        id: 'e1',
        responders: [
          {
            status: 'pending',
            total_km: 287,
            profile: { full_name: 'גיל', callsign: '000' },
          },
          {
            status: 'in_progress',
            total_km: 240,
            profile: { full_name: 'עמרי', callsign: '336' },
          },
        ],
      }),
    ])
    expect(rows.map((r) => [r.responder_callsign, r.total_km])).toEqual([
      ['000', 287],
      ['336', 240],
    ])
  })

  it('includes cancelled events when participation matches', () => {
    const rows = buildKmExceptionRows([
      event({
        id: 'e-cancelled',
        is_cancelled: true,
        responders: [
          { status: 'done', total_km: 80, profile: { full_name: 'דן', callsign: 'D1' } },
        ],
      }),
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].is_cancelled).toBe(true)
    expect(rows[0].total_km).toBe(80)
  })

  it('emits one row per exceptional responder on the same event', () => {
    const rows = buildKmExceptionRows([
      event({
        id: 'e1',
        responders: [
          { status: 'done', total_km: 70, profile: { full_name: 'א', callsign: 'A' } },
          { status: 'done', total_km: 65, profile: { full_name: 'ב', callsign: 'B' } },
          { status: 'done', total_km: 10, profile: { full_name: 'ג', callsign: 'C' } },
        ],
      }),
    ])
    expect(rows.map((r) => r.responder_callsign)).toEqual(['A', 'B'])
  })

  it('sorts by event_date desc then total_km desc', () => {
    const rows = buildKmExceptionRows([
      event({
        id: 'old',
        event_date: '2026-08-01',
        responders: [
          { status: 'done', total_km: 90, profile: { full_name: 'ישן', callsign: 'O' } },
        ],
      }),
      event({
        id: 'new',
        event_date: '2026-08-10',
        responders: [
          { status: 'done', total_km: 60, profile: { full_name: 'נמוך', callsign: 'L' } },
          { status: 'done', total_km: 100, profile: { full_name: 'גבוה', callsign: 'H' } },
        ],
      }),
    ])
    expect(rows.map((r) => [r.event_id, r.total_km])).toEqual([
      ['new', 100],
      ['new', 60],
      ['old', 90],
    ])
  })

  it('maps display fields from event and profiles', () => {
    const rows = buildKmExceptionRows([
      event({
        id: 'e1',
        police_event_id: 'P-9',
        location: 'צומת',
        event_type: { name: 'תקלה' },
        road: { name: 'כביש 2' },
        shift_lead: { full_name: 'ליאור', callsign: 'SL' },
        responders: [
          { status: 'done', total_km: 61, profile: { full_name: 'נועם', callsign: 'N1' } },
        ],
      }),
    ])
    expect(rows[0]).toMatchObject({
      police_event_id: 'P-9',
      location: 'צומת',
      event_type_name: 'תקלה',
      road_name: 'כביש 2',
      shift_lead_name: 'ליאור',
      shift_lead_callsign: 'SL',
      event_date: '2026-08-10',
    })
  })

  it('keeps only event_date inside an inclusive range', () => {
    const rows = buildKmExceptionRows(
      [
        event({
          id: 'old',
          event_date: '2026-07-31',
          responders: [{ status: 'done', total_km: 80, profile: { full_name: 'א', callsign: 'A' } }],
        }),
        event({
          id: 'start',
          event_date: '2026-08-01',
          responders: [{ status: 'done', total_km: 80, profile: { full_name: 'ב', callsign: 'B' } }],
        }),
        event({
          id: 'end',
          event_date: '2026-08-31',
          responders: [{ status: 'done', total_km: 80, profile: { full_name: 'ג', callsign: 'C' } }],
        }),
        event({
          id: 'next',
          event_date: '2026-09-01',
          responders: [{ status: 'done', total_km: 80, profile: { full_name: 'ד', callsign: 'D' } }],
        }),
      ],
      { from: '2026-08-01', to: '2026-08-31' },
    )
    expect(rows.map((row) => row.event_id)).toEqual(['end', 'start'])
  })
})
