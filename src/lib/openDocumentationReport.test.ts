import { describe, expect, it } from 'vitest'
import {
  buildOpenDocumentationRows,
  documentationFillLabel,
  type OpenDocumentationEventSource,
} from './openDocumentationReport'

const admin = { userId: 'lead-a', isAdmin: true }
const leadOnly = { userId: 'lead-a', isAdmin: false }
const range = { from: '2026-08-01', to: '2026-08-31' }

function event(
  partial: Partial<OpenDocumentationEventSource> & Pick<OpenDocumentationEventSource, 'id'>,
): OpenDocumentationEventSource {
  return {
    id: partial.id,
    event_date: partial.event_date ?? '2026-08-10',
    status: partial.status ?? 'in_progress',
    is_cancelled: partial.is_cancelled ?? false,
    police_event_id: partial.police_event_id ?? 'P-1',
    location: partial.location ?? 'צומת',
    shift_lead_id: partial.shift_lead_id ?? 'lead-a',
    road: partial.road ?? { name: 'כביש 1' },
    shift_lead: partial.shift_lead ?? { full_name: 'ליאור', callsign: 'L1' },
    responders: partial.responders ?? [
      {
        responder_id: 'r1',
        status: 'pending',
        profile: { full_name: 'דנה כהן', callsign: 'D1' },
      },
    ],
  }
}

describe('documentationFillLabel', () => {
  it('uses report-only copy', () => {
    expect(documentationFillLabel('pending')).toBe('טרם הוזן')
    expect(documentationFillLabel('in_progress')).toBe('נשמרה טיוטה')
  })
})

describe('buildOpenDocumentationRows', () => {
  it('includes in_progress and partial events with open participations', () => {
    const rows = buildOpenDocumentationRows(
      [
        event({ id: 'waiting', status: 'in_progress' }),
        event({
          id: 'partial',
          status: 'partial',
          responders: [
            { responder_id: 'done', status: 'done', profile: { full_name: 'הושלם', callsign: 'X' } },
            { responder_id: 'open', status: 'in_progress', profile: { full_name: 'טיוטה', callsign: 'T' } },
          ],
        }),
      ],
      { ...range, viewer: admin },
    )
    expect(rows.map((row) => [row.event_id, row.responder_callsign, row.fill_status])).toEqual([
      ['waiting', 'D1', 'pending'],
      ['partial', 'T', 'in_progress'],
    ])
  })

  it('excludes draft, done, cancelled, completed participations, and dates outside the range', () => {
    const rows = buildOpenDocumentationRows(
      [
        event({ id: 'draft', status: 'draft' }),
        event({ id: 'done', status: 'done' }),
        event({ id: 'cancelled', is_cancelled: true }),
        event({
          id: 'all-done',
          status: 'partial',
          responders: [{ responder_id: 'r', status: 'done', profile: { full_name: 'א', callsign: 'A' } }],
        }),
        event({ id: 'old', event_date: '2026-07-31' }),
        event({ id: 'future', event_date: '2026-09-01' }),
      ],
      { ...range, viewer: admin },
    )
    expect(rows).toEqual([])
  })

  it('emits one row per open volunteer on the same event', () => {
    const rows = buildOpenDocumentationRows(
      [
        event({
          id: 'e1',
          responders: [
            { responder_id: 'a', status: 'pending', profile: { full_name: 'אלון', callsign: 'A' } },
            { responder_id: 'b', status: 'in_progress', profile: { full_name: 'בת', callsign: 'B' } },
            { responder_id: 'c', status: 'done', profile: { full_name: 'גיא', callsign: 'C' } },
          ],
        }),
      ],
      { ...range, viewer: admin },
    )
    expect(rows.map((row) => row.responder_callsign)).toEqual(['A', 'B'])
    expect(rows.every((row) => row.event_id === 'e1')).toBe(true)
  })

  it('keeps only the viewer lead events when the viewer is not admin', () => {
    const sources = [
      event({ id: 'mine', shift_lead_id: 'lead-a' }),
      event({ id: 'theirs', shift_lead_id: 'lead-b' }),
    ]
    expect(
      buildOpenDocumentationRows(sources, { ...range, viewer: leadOnly }).map((row) => row.event_id),
    ).toEqual(['mine'])
    expect(
      buildOpenDocumentationRows(sources, { ...range, viewer: admin }).map((row) => row.event_id),
    ).toEqual(['mine', 'theirs'])
  })

  it('sorts by event_date desc then responder name', () => {
    const rows = buildOpenDocumentationRows(
      [
        event({
          id: 'old',
          event_date: '2026-08-01',
          responders: [{ responder_id: 'z', status: 'pending', profile: { full_name: 'זיו', callsign: 'Z' } }],
        }),
        event({
          id: 'new',
          event_date: '2026-08-20',
          responders: [
            { responder_id: 'b', status: 'pending', profile: { full_name: 'בת', callsign: 'B' } },
            { responder_id: 'a', status: 'pending', profile: { full_name: 'אלון', callsign: 'A' } },
          ],
        }),
      ],
      { ...range, viewer: admin },
    )
    expect(rows.map((row) => [row.event_id, row.responder_callsign])).toEqual([
      ['new', 'A'],
      ['new', 'B'],
      ['old', 'Z'],
    ])
  })

  it('maps display fields from the event and profiles', () => {
    const [row] = buildOpenDocumentationRows(
      [
        event({
          id: 'e1',
          police_event_id: 'P-9',
          location: 'גשר',
          road: { name: 'כביש 2' },
          shift_lead: { full_name: 'ליאור', callsign: 'SL' },
        }),
      ],
      { ...range, viewer: admin },
    )
    expect(row).toMatchObject({
      id: 'e1:r1',
      event_id: 'e1',
      event_date: '2026-08-10',
      police_event_id: 'P-9',
      responder_name: 'דנה כהן',
      responder_callsign: 'D1',
      shift_lead_name: 'ליאור',
      shift_lead_callsign: 'SL',
      road_name: 'כביש 2',
      location: 'גשר',
      fill_status: 'pending',
    })
  })
})
