import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
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

const migrationsDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../supabase/migrations')

function lastFunctionDef(sql: string, name: string): string {
  const marker = `create or replace function public.${name}`
  const start = sql.toLowerCase().lastIndexOf(marker)
  if (start < 0) throw new Error(`missing ${name}`)
  const rest = sql.slice(start)
  const end = rest.toLowerCase().indexOf('$$;', marker.length)
  if (end < 0) throw new Error(`unclosed ${name}`)
  return rest.slice(0, end)
}

function auditWriteSql(): string {
  return [
    '20260903054608_event_audit.sql',
    '20260903092200_event_audit_row_fields.sql',
  ]
    .map((name) => {
      try {
        return readFileSync(resolve(migrationsDir, name), 'utf8')
      } catch {
        return ''
      }
    })
    .join('\n')
}

describe('event_audit_write trigger', () => {
  it('does not read old.event_id / new.event_id (events has no such column)', () => {
    const fn = lastFunctionDef(auditWriteSql(), 'event_audit_write')
    expect(fn).not.toMatch(/\b(old|new)\.event_id\b/)
    expect(fn).toMatch(/->>'id'/)
    expect(fn).toMatch(/->>'event_id'/)
  })

  it('does not touch NEW when an event row is deleted', () => {
    const fn = lastFunctionDef(auditWriteSql(), 'trg_refresh_shift_log_status_from_event')
    expect(fn).toMatch(/tg_op = 'DELETE'/)
    expect(fn).toMatch(/old\.shift_id/)
  })
})
