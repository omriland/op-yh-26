import { describe, expect, it } from 'vitest'
import type { EventListItem, EventResponderSummary } from './events'
import {
  incompleteFieldLabels,
  incompleteNoticeLabel,
  isEventIncomplete,
  missingEventFields,
  partitionIncompleteEvents,
} from './eventIncomplete'

function responder(partial: Partial<EventResponderSummary> = {}): EventResponderSummary {
  return {
    id: 'r1',
    responder_id: 'u1',
    status: 'in_progress',
    total_km: 12,
    started_at: '2026-09-04T06:00:00+03:00',
    ended_at: '2026-09-04T07:00:00+03:00',
    profile: { full_name: 'כונן', callsign: 'A1' },
    ...partial,
  }
}

function event(partial: Partial<EventListItem> = {}): EventListItem {
  return {
    id: 'e1',
    event_date: '2026-09-04',
    police_event_id: '12345',
    patrol_callsign: 'ניידת 1',
    location: 'מחלף אייל',
    status: 'in_progress',
    is_cancelled: false,
    origin: 'manual',
    shift_id: null,
    treatment_detail: null,
    treatment_notes: null,
    emergency_means: false,
    district: { name: 'שלוחה צפון' },
    event_type: { name: 'פינוי רכב' },
    road: { name: 'כביש 6' },
    shift_lead: null,
    last_saved: null,
    shift: null,
    shared_treated: [],
    responders: [responder()],
    ...partial,
  }
}

describe('missingEventFields', () => {
  it('returns nothing when every required field is filled', () => {
    expect(missingEventFields(event())).toEqual(new Set())
    expect(isEventIncomplete(event())).toBe(false)
  })

  it('flags each event-level required field', () => {
    expect(missingEventFields(event({ police_event_id: null }))).toEqual(new Set(['police_event_id']))
    expect(missingEventFields(event({ police_event_id: '   ' }))).toEqual(new Set(['police_event_id']))
    expect(missingEventFields(event({ patrol_callsign: null }))).toEqual(new Set(['patrol_callsign']))
    expect(missingEventFields(event({ district: null }))).toEqual(new Set(['district']))
    expect(missingEventFields(event({ event_type: null }))).toEqual(new Set(['event_type']))
    expect(missingEventFields(event({ road: null }))).toEqual(new Set(['road']))
    expect(missingEventFields(event({ location: null }))).toEqual(new Set(['location']))
    expect(missingEventFields(event({ location: '  ' }))).toEqual(new Set(['location']))
  })

  it('flags KM when any responder is missing total_km (0 counts as filled)', () => {
    expect(missingEventFields(event({ responders: [responder({ total_km: null })] }))).toEqual(
      new Set(['responder_km']),
    )
    expect(missingEventFields(event({ responders: [responder({ total_km: 0 })] }))).toEqual(new Set())
    expect(
      missingEventFields(
        event({
          responders: [responder(), responder({ id: 'r2', responder_id: 'u2', total_km: null })],
        }),
      ),
    ).toEqual(new Set(['responder_km']))
  })

  it('flags times when any responder is missing start or end', () => {
    expect(missingEventFields(event({ responders: [responder({ started_at: null })] }))).toEqual(
      new Set(['responder_times']),
    )
    expect(missingEventFields(event({ responders: [responder({ ended_at: '  ' })] }))).toEqual(
      new Set(['responder_times']),
    )
  })

  it('still flags ממתין לתיעוד events', () => {
    const waiting = event({ status: 'in_progress', police_event_id: null })
    expect(waiting.status).toBe('in_progress')
    expect(isEventIncomplete(waiting)).toBe(true)
  })
})

describe('incompleteNoticeLabel', () => {
  it('lists Hebrew labels in definition order', () => {
    expect(incompleteFieldLabels(new Set(['responder_km', 'police_event_id']))).toEqual([
      'מספר אירוע',
      'ק״מ',
    ])
    expect(incompleteNoticeLabel(new Set(['responder_km', 'police_event_id']))).toBe(
      'חסרים: מספר אירוע · ק״מ',
    )
  })
})

describe('partitionIncompleteEvents', () => {
  it('pins incomplete first while keeping each group in input order', () => {
    const complete = event({ id: 'ok' })
    const incomplete = event({ id: 'gap', location: null })
    expect(partitionIncompleteEvents([complete, incomplete])).toEqual({
      incomplete: [incomplete],
      rest: [complete],
    })
  })
})
