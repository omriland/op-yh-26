import { describe, expect, it } from 'vitest'
import type { EventListItem, EventResponderSummary } from './events'
import {
  SHIFT_LEAD_EVENTS_RECENT_MS,
  eventWithinShiftLeadRecentWindow,
  keepShiftLeadRecentEvent,
  shouldApplyShiftLeadRecentWindow,
} from './shiftLeadEventsWindow'

const NOW = new Date('2026-11-04T12:00:00.000Z')

function hoursAgo(hours: number): string {
  return new Date(NOW.getTime() - hours * 60 * 60 * 1000).toISOString()
}

function responder(partial: Partial<EventResponderSummary> = {}): EventResponderSummary {
  return {
    id: 'r1',
    responder_id: 'u1',
    status: 'done',
    total_km: 12,
    started_at: '2026-11-04T06:00:00+03:00',
    ended_at: '2026-11-04T07:00:00+03:00',
    profile: { full_name: 'כונן', callsign: 'A1' },
    ...partial,
  }
}

function event(partial: Partial<EventListItem> = {}): EventListItem {
  return {
    id: 'e1',
    shift_lead_id: 'lead',
    created_at: hoursAgo(1),
    event_date: '2026-11-04',
    police_event_id: '12345',
    patrol_callsign: 'ניידת 1',
    location: 'מחלף אייל',
    status: 'done',
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

describe('shift-lead events window', () => {
  it('is a rolling 12 hours', () => {
    expect(SHIFT_LEAD_EVENTS_RECENT_MS).toBe(12 * 60 * 60 * 1000)
    expect(eventWithinShiftLeadRecentWindow(hoursAgo(12), NOW)).toBe(true)
    expect(
      eventWithinShiftLeadRecentWindow(
        new Date(NOW.getTime() - SHIFT_LEAD_EVENTS_RECENT_MS - 1).toISOString(),
        NOW,
      ),
    ).toBe(false)
  })

  it('keeps an event inside 12 hours', () => {
    expect(keepShiftLeadRecentEvent(event({ created_at: hoursAgo(1), shift_lead_id: 'other' }), 'lead', NOW)).toBe(
      true,
    )
  })

  it('drops an older complete event, including one this lead finished', () => {
    expect(
      keepShiftLeadRecentEvent(event({ created_at: hoursAgo(13), shift_lead_id: 'lead' }), 'lead', NOW),
    ).toBe(false)
  })

  it('keeps an older event that still misses this lead’s פרטים חסרים', () => {
    const pending = event({
      created_at: hoursAgo(30),
      shift_lead_id: 'lead',
      police_event_id: null,
    })
    expect(keepShiftLeadRecentEvent(pending, 'lead', NOW)).toBe(true)
  })

  it('keeps an older event when this viewer is only the secondary lead', () => {
    const pending = event({
      created_at: hoursAgo(30),
      shift_lead_id: 'other',
      police_event_id: null,
      secondary_leads: [{ user_id: 'lead', locked: true }],
    })
    expect(keepShiftLeadRecentEvent(pending, 'lead', NOW)).toBe(true)
  })

  it('drops an older event whose missing details belong to someone else', () => {
    const pending = event({
      created_at: hoursAgo(30),
      shift_lead_id: 'other',
      police_event_id: null,
      secondary_leads: [{ user_id: 'sec', locked: false }],
    })
    expect(keepShiftLeadRecentEvent(pending, 'lead', NOW)).toBe(false)
  })

  it('does not keep an older shift-born event; that report is not פרטים חסרים', () => {
    const born = event({
      created_at: hoursAgo(30),
      origin: 'shift',
      shift_lead_id: 'lead',
      police_event_id: null,
      district: null,
      responders: [responder({ total_km: null })],
    })
    expect(keepShiftLeadRecentEvent(born, 'lead', NOW)).toBe(false)
  })
})

describe('who gets the 12-hour list', () => {
  it('applies for אחמ״ש, including admin who is also אחמ״ש', () => {
    expect(shouldApplyShiftLeadRecentWindow(['shift_lead'])).toBe(true)
    expect(shouldApplyShiftLeadRecentWindow(['shift_lead', 'responder'])).toBe(true)
    expect(shouldApplyShiftLeadRecentWindow(['admin', 'shift_lead'])).toBe(true)
    expect(shouldApplyShiftLeadRecentWindow(['super_admin', 'shift_lead'])).toBe(true)
  })

  it('does not apply for a pure admin or a responder', () => {
    expect(shouldApplyShiftLeadRecentWindow(['admin'])).toBe(false)
    expect(shouldApplyShiftLeadRecentWindow(['super_admin'])).toBe(false)
    expect(shouldApplyShiftLeadRecentWindow(['responder'])).toBe(false)
    expect(shouldApplyShiftLeadRecentWindow([])).toBe(false)
  })
})
