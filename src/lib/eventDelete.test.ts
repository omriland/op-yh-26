import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  EVENT_DELETE_FAILED,
  EVENT_DELETE_OTHER_LEAD,
  canViewerDeleteEvent,
  viewerMayDeleteOthersEvents,
} from './events'

const migrationsDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../supabase/migrations')

describe('canViewerDeleteEvent', () => {
  it('lets admin and super_admin delete any event', () => {
    expect(viewerMayDeleteOthersEvents(['admin'])).toBe(true)
    expect(viewerMayDeleteOthersEvents(['super_admin'])).toBe(true)
    expect(
      canViewerDeleteEvent({
        roles: ['admin'],
        userId: 'admin-1',
        shiftLeadId: 'lead-b',
      }),
    ).toBe(true)
    expect(
      canViewerDeleteEvent({
        roles: ['super_admin'],
        userId: 'sa-1',
        shiftLeadId: 'lead-b',
      }),
    ).toBe(true)
  })

  it('lets a shift_lead delete only their own event', () => {
    expect(
      canViewerDeleteEvent({
        roles: ['shift_lead'],
        userId: 'lead-a',
        shiftLeadId: 'lead-a',
      }),
    ).toBe(true)
    expect(
      canViewerDeleteEvent({
        roles: ['shift_lead'],
        userId: 'lead-a',
        shiftLeadId: 'lead-b',
      }),
    ).toBe(false)
  })

  it('blocks responders and missing identity', () => {
    expect(
      canViewerDeleteEvent({
        roles: ['responder'],
        userId: 'r1',
        shiftLeadId: 'r1',
      }),
    ).toBe(false)
    expect(
      canViewerDeleteEvent({
        roles: ['shift_lead'],
        userId: undefined,
        shiftLeadId: 'lead-a',
      }),
    ).toBe(false)
  })

  it('uses locked Hebrew copy', () => {
    expect(EVENT_DELETE_OTHER_LEAD).toBe('אין הרשאה למחוק אירוע שנוצר על ידי אחמ״ש אחר.')
    expect(EVENT_DELETE_FAILED).toBe('מחיקת האירוע נכשלה. בדקו את החיבור ונסו שוב.')
  })
})

describe('events delete RLS owns the creator', () => {
  const sql = readFileSync(
    resolve(migrationsDir, '20260902120000_events_delete_shift_lead_own_only.sql'),
    'utf8',
  )

  it('requires shift_lead_id = auth.uid() on the lead delete policy', () => {
    expect(sql).toContain('create policy events_delete_cockpit_draft_lead')
    expect(sql).toMatch(/shift_lead_id\s*=\s*auth\.uid\(\)/)
  })

  it('blocks a shift_lead from dropping another lead\'s shift-born stubs', () => {
    expect(sql).toContain('אין הרשאה למחוק אירוע שנוצר על ידי אחמ״ש אחר.')
    expect(sql).toContain('v_shift.shift_lead_id is distinct from auth.uid()')
    expect(sql).toContain("has_role(auth.uid(), 'admin')")
  })
})
