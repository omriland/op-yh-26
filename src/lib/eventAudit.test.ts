import { describe, expect, it } from 'vitest'
import {
  canReadEventAudit,
  eventAuditActorName,
  eventAuditChangedKeys,
  eventAuditEventLabel,
  eventAuditFieldDiffs,
  eventAuditOpLabel,
  eventAuditSummary,
  eventAuditTableLabel,
  eventAuditValueLabel,
} from './eventAudit'

describe('canReadEventAudit', () => {
  it('is true only for super_admin', () => {
    expect(canReadEventAudit(['admin', 'super_admin'])).toBe(true)
    expect(canReadEventAudit(['admin'])).toBe(false)
    expect(canReadEventAudit(['shift_lead'])).toBe(false)
    expect(canReadEventAudit(['responder'])).toBe(false)
  })
})

describe('eventAudit labels', () => {
  it('maps op and table to Hebrew', () => {
    expect(eventAuditOpLabel('INSERT')).toBe('יצירה')
    expect(eventAuditOpLabel('UPDATE')).toBe('עדכון')
    expect(eventAuditOpLabel('DELETE')).toBe('מחיקה')
    expect(eventAuditTableLabel('events')).toBe('אירוע')
    expect(eventAuditTableLabel('event_responders')).toBe('כונן')
  })

  it('names the actor, or מערכת when there is no JWT', () => {
    expect(
      eventAuditActorName({ actor_name: 'עמרי לנדמן', actor_callsign: 'Admin', actor_id: 'u1' }),
    ).toBe('עמרי לנדמן · Admin')
    expect(eventAuditActorName({ actor_name: null, actor_callsign: null, actor_id: 'u1' })).toBe(
      'משתמש',
    )
    expect(eventAuditActorName({ actor_name: null, actor_callsign: null, actor_id: null })).toBe(
      'מערכת',
    )
  })

  it('prefers police event number over the uuid', () => {
    expect(eventAuditEventLabel({ police_event_id: '12-345', event_id: 'evt-1' })).toBe('12-345')
    expect(eventAuditEventLabel({ police_event_id: null, event_id: 'evt-1' })).toBe('evt-1')
    expect(eventAuditEventLabel({ police_event_id: null, event_id: null })).toBe('—')
  })
})

describe('eventAuditChangedKeys', () => {
  it('ignores updated_at-only noise and keeps real field changes', () => {
    expect(
      eventAuditChangedKeys(
        { status: 'draft', updated_at: 'a' },
        { status: 'draft', updated_at: 'b' },
      ),
    ).toEqual([])
    expect(
      eventAuditChangedKeys(
        { status: 'draft', notes: 'x', updated_at: 'a' },
        { status: 'done', notes: 'x', updated_at: 'b' },
      ),
    ).toEqual(['status'])
  })

  it('prefers stored changed_fields when present', () => {
    expect(
      eventAuditChangedKeys({ status: 'draft' }, { status: 'done' }, ['status', 'updated_at']),
    ).toEqual(['status'])
  })
})

describe('eventAuditSummary', () => {
  it('summarizes create, delete, and changed Hebrew keys', () => {
    expect(
      eventAuditSummary({ op: 'INSERT', old_row: null, new_row: { status: 'draft' }, changed_fields: null }),
    ).toBe('יצירה')
    expect(
      eventAuditSummary({ op: 'DELETE', old_row: { status: 'done' }, new_row: null, changed_fields: null }),
    ).toBe('מחיקה')
    expect(
      eventAuditSummary({
        op: 'UPDATE',
        old_row: { total_km: 10, status: 'pending' },
        new_row: { total_km: 12, status: 'done' },
        changed_fields: ['status', 'total_km'],
      }),
    ).toBe('סטטוס · קילומטרים')
  })
})

describe('eventAuditFieldDiffs', () => {
  it('formats before/after values in Hebrew', () => {
    expect(eventAuditValueLabel(true)).toBe('כן')
    expect(eventAuditValueLabel(false)).toBe('לא')
    expect(eventAuditValueLabel(null)).toBe('—')
    expect(
      eventAuditFieldDiffs(
        { emergency_means: false, notes: 'א' },
        { emergency_means: true, notes: 'ב' },
      ),
    ).toEqual([
      { key: 'emergency_means', label: 'אמצעי חירום', before: 'לא', after: 'כן' },
      { key: 'notes', label: 'הערות', before: 'א', after: 'ב' },
    ])
  })
})
