import { describe, expect, it } from 'vitest'
import type { EventListItem, EventResponderSummary } from './events'
import {
  incompleteFieldLabels,
  incompleteLeadNoticeLabels,
  incompleteNoticeLabel,
  isEventIncomplete,
  eventHasMissingResponderKm,
  leadEnteredAwaitingStamp,
  leadFacingMissingKm,
  missingEventFields,
  missingEventFieldsForViewer,
  missingFullyLoggedFieldLabels,
  partialStampHoverText,
  partitionIncompleteEvents,
  partitionIncompleteEventsForViewer,
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

describe('KM is not required from a responder with no vehicle', () => {
  const noVehicle = responder({
    responder_id: 'u2',
    total_km: null,
    profile: { full_name: 'ללא רכב', callsign: 'B2', vehicles: [] },
  })

  it('does not flag ק״מ when the only empty KM belongs to a ללא-רכב volunteer', () => {
    expect(missingEventFields(event({ responders: [noVehicle] }))).toEqual(new Set())
    expect(eventHasMissingResponderKm(event({ responders: [noVehicle] }))).toBe(false)
  })

  it('still flags ק״מ for a teammate who does have a vehicle', () => {
    const withVehicle = responder({
      total_km: null,
      profile: { full_name: 'כונן', callsign: 'A1', vehicles: [{ archived: false }] },
    })
    expect(missingEventFields(event({ responders: [noVehicle, withVehicle] }))).toEqual(
      new Set(['responder_km']),
    )
  })

  it('treats an archived-only vehicle list as no vehicle', () => {
    const archivedOnly = responder({
      total_km: null,
      profile: { full_name: 'כונן', callsign: 'A1', vehicles: [{ archived: true }] },
    })
    expect(missingEventFields(event({ responders: [archivedOnly] }))).toEqual(new Set())
  })

  it('keeps requiring KM when vehicle data was not selected at all', () => {
    // Safe default: an older query shape must not silently clear real KM gaps.
    expect(missingEventFields(event({ responders: [responder({ total_km: null })] }))).toEqual(
      new Set(['responder_km']),
    )
  })
})

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
    expect(eventHasMissingResponderKm(event({ responders: [responder({ total_km: null })] }))).toBe(
      true,
    )
    expect(missingEventFields(event({ responders: [responder({ total_km: 0 })] }))).toEqual(new Set())
    expect(eventHasMissingResponderKm(event({ responders: [responder({ total_km: 0 })] }))).toBe(
      false,
    )
    expect(
      missingEventFields(
        event({
          responders: [responder(), responder({ id: 'r2', responder_id: 'u2', total_km: null })],
        }),
      ),
    ).toEqual(new Set(['responder_km']))
  })

  it('flags times when the event is missing start or end', () => {
    expect(missingEventFields(event({ started_at: null, ended_at: '2026-09-04T07:00:00' }))).toEqual(
      new Set(['event_times']),
    )
    expect(missingEventFields(event({ started_at: '2026-09-04T06:00:00', ended_at: null }))).toEqual(
      new Set(['event_times']),
    )
  })

  it('falls back to responder times when event columns are absent', () => {
    expect(missingEventFields(event({ responders: [responder({ started_at: null })] }))).toEqual(
      new Set(['event_times']),
    )
  })

  it('still flags ממתין לתיעוד events', () => {
    const waiting = event({ status: 'in_progress', police_event_id: null })
    expect(waiting.status).toBe('in_progress')
    expect(isEventIncomplete(waiting)).toBe(true)
  })
})

describe('shift-born events', () => {
  const born = event({
    origin: 'shift',
    shift_lead_id: 'lead',
    police_event_id: null,
    patrol_callsign: null,
    district: null,
    started_at: null,
    ended_at: null,
    responders: [responder({ total_km: null })],
  })

  it('are never listed as missing lead fields the shared report has no input for', () => {
    expect(missingEventFields(born)).toEqual(new Set())
    expect(partitionIncompleteEventsForViewer([born], 'lead').incomplete).toEqual([])
  })

  it('never carry a lead-facing missing KM mark', () => {
    expect(eventHasMissingResponderKm(born)).toBe(false)
    expect(leadFacingMissingKm(born, 'lead')).toBe(false)
  })
})

describe('missingFullyLoggedFieldLabels', () => {
  const lead = 'lead-1'

  it('names a missing end time as שעת סיום', () => {
    expect(
      missingFullyLoggedFieldLabels(
        event({ shift_lead_id: lead, started_at: '2026-09-04T06:00:00', ended_at: null }),
        lead,
      ),
    ).toEqual(['שעת סיום'])
  })

  it('builds a hover line for the partially-logged stamp', () => {
    expect(
      partialStampHoverText(
        event({
          shift_lead_id: lead,
          started_at: '2026-09-04T06:00:00',
          ended_at: null,
          responders: [responder({ status: 'done' })],
        }),
        lead,
      ),
    ).toBe('חסרים: שעת סיום')
    expect(
      partialStampHoverText(
        event({
          shift_lead_id: lead,
          responders: [responder({ status: 'pending', profile: { full_name: 'דנה', callsign: 'D1' } })],
        }),
        lead,
      ),
    ).toBe('ממתין לתיעוד: דנה')
  })

  it('hides ק״מ from a כונן, who cannot see a single KM value on the page', () => {
    const partial = event({
      shift_lead_id: lead,
      started_at: '2026-09-04T06:00:00',
      ended_at: null,
      responders: [responder({ status: 'done', total_km: null })],
    })
    expect(partialStampHoverText(partial, lead)).toBe('חסרים: ק״מ · שעת סיום')
    expect(partialStampHoverText(partial, 'u1')).toBe('חסרים: שעת סיום')
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

describe('missing volunteer', () => {
  it('lists מתנדב when nobody is assigned', () => {
    expect(incompleteLeadNoticeLabels(event({ responders: [] }), 'lead')).toEqual(['מתנדב'])
  })

  it('leaves a cancelled event with nobody on it alone', () => {
    expect(missingEventFields(event({ responders: [], is_cancelled: true })).has('responders')).toBe(false)
  })
})

describe('incomplete lead notice when responders are held', () => {
  it('adds לא נשלח למתנדבים once a volunteer is assigned before the event is released', () => {
    expect(incompleteLeadNoticeLabels(event({ police_event_id: null }), 'lead')).toEqual([
      'מספר אירוע',
      'לא נשלח למתנדבים',
    ])
    expect(incompleteLeadNoticeLabels(event({ police_event_id: null, responders: [] }), 'lead')).toEqual(
      ['מספר אירוע', 'מתנדב'],
    )
    expect(incompleteLeadNoticeLabels(event({ road: null }), 'lead')).toEqual([
      'כביש',
      'לא נשלח למתנדבים',
    ])
    expect(incompleteLeadNoticeLabels(event({ event_type: null }), 'lead')).toEqual([
      'סוג אירוע',
      'לא נשלח למתנדבים',
    ])
    expect(
      incompleteLeadNoticeLabels(
        event({ patrol_callsign: null, patrol_callsign_number: null, patrol_callsign_prefix: null }),
        'lead',
      ),
    ).toEqual(['אוק - מס', 'לא נשלח למתנדבים'])
    expect(incompleteLeadNoticeLabels(event(), 'lead')).toEqual([])
    // Shift-born: never held, and never chipped for fields the shared report lacks.
    expect(
      incompleteLeadNoticeLabels(event({ origin: 'shift', police_event_id: null }), 'lead'),
    ).toEqual([])
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

describe('lead-facing missing KM', () => {
  const missingKm = event({
    shift_lead_id: 'lead',
    secondary_leads: [{ user_id: 'sec', locked: false, full_name: 'משני', callsign: 'S1' }],
    responders: [responder({ responder_id: 'lead-as-volunteer', total_km: null })],
  })

  it('shows the lead KM note only to the event main or secondary lead', () => {
    expect(leadFacingMissingKm(missingKm, 'lead')).toBe(true)
    expect(leadFacingMissingKm(missingKm, 'sec')).toBe(true)
    expect(leadFacingMissingKm(missingKm, 'lead-as-volunteer')).toBe(false)
    expect(leadFacingMissingKm(missingKm, 'admin-who-is-not-the-lead')).toBe(false)
    expect(missingEventFieldsForViewer(missingKm, 'lead')).toEqual(new Set(['responder_km']))
    expect(missingEventFieldsForViewer(missingKm, 'lead-as-volunteer')).toEqual(new Set())
  })

  it('does not pin a KM-only gap for a lead-role responder who is not the event lead', () => {
    expect(partitionIncompleteEventsForViewer([missingKm], 'lead-as-volunteer')).toEqual({
      incomplete: [],
      rest: [missingKm],
    })
    expect(partitionIncompleteEventsForViewer([missingKm], 'lead')).toEqual({
      incomplete: [missingKm],
      rest: [],
    })
  })
})

describe('lead-facing הוזן בהצלחה', () => {
  const complete = (partial: Partial<EventListItem> = {}) =>
    event({
      shift_lead_id: 'lead',
      started_at: '2026-09-04T06:00:00+03:00',
      ended_at: '2026-09-04T07:00:00+03:00',
      secondary_leads: [{ user_id: 'sec', locked: false, full_name: 'משני', callsign: 'S1' }],
      responders: [responder({ status: 'pending' })],
      ...partial,
    })

  it('tells the lead their part is saved and one volunteer still owes a fill', () => {
    expect(leadEnteredAwaitingStamp(complete(), 'lead')).toEqual({
      label: 'הוזן בהצלחה',
      tone: 'done',
      caption: 'ממתין למתנדב',
    })
    expect(leadEnteredAwaitingStamp(complete(), 'sec')?.label).toBe('הוזן בהצלחה')
  })

  it('counts open volunteers, including a saved draft, and skips finished ones', () => {
    const several = complete({
      status: 'partial',
      responders: [
        responder({ id: 'r1', responder_id: 'u1', status: 'pending' }),
        responder({ id: 'r2', responder_id: 'u2', status: 'in_progress' }),
        responder({ id: 'r3', responder_id: 'u3', status: 'done' }),
      ],
    })
    expect(leadEnteredAwaitingStamp(several, 'lead')?.caption).toBe('ממתין ל־2 מתנדבים')
  })

  it('stays off while the lead still owes a field', () => {
    expect(leadEnteredAwaitingStamp(complete({ ended_at: null }), 'lead')).toBeNull()
    expect(leadEnteredAwaitingStamp(complete({ police_event_id: null }), 'lead')).toBeNull()
    const noKm = complete({ responders: [responder({ status: 'pending', total_km: null })] })
    expect(leadEnteredAwaitingStamp(noKm, 'lead')).toBeNull()
  })

  it('is viewer-relative: volunteers and admins who do not lead keep the old stamp', () => {
    expect(leadEnteredAwaitingStamp(complete(), 'u1')).toBeNull()
    expect(leadEnteredAwaitingStamp(complete(), 'admin-who-is-not-the-lead')).toBeNull()
    expect(leadEnteredAwaitingStamp(complete(), null)).toBeNull()
  })

  it('lets a lead who is also an open volunteer see their own to-do instead', () => {
    const leadOnCrew = complete({
      responders: [
        responder({ id: 'r1', responder_id: 'lead', status: 'pending' }),
        responder({ id: 'r2', responder_id: 'u2', status: 'pending' }),
      ],
    })
    expect(leadEnteredAwaitingStamp(leadOnCrew, 'lead')).toBeNull()
  })

  it('does not apply once every volunteer is done, to drafts, cancelled or shift-born events', () => {
    const allDone = complete({ status: 'partial', responders: [responder({ status: 'done' })] })
    expect(leadEnteredAwaitingStamp(allDone, 'lead')).toBeNull()
    expect(leadEnteredAwaitingStamp(complete({ status: 'done' }), 'lead')).toBeNull()
    expect(leadEnteredAwaitingStamp(complete({ status: 'draft' }), 'lead')).toBeNull()
    expect(leadEnteredAwaitingStamp(complete({ is_cancelled: true }), 'lead')).toBeNull()
    expect(leadEnteredAwaitingStamp(complete({ origin: 'shift' }), 'lead')).toBeNull()
  })
})
