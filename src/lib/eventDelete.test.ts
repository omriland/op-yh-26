import { readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  EVENT_DELETE_FAILED,
  EVENT_DELETE_OTHER_LEAD,
  canUseEventListDeleteContext,
  canViewerDeleteEvent,
  eventDeleteConfirmBody,
  eventDeleteConfirmTitle,
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

  it('loads shift_lead_id on event detail so the page can check ownership', () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), './events.ts'), 'utf8')
    expect(src).toMatch(/const EVENT_DETAIL_SELECT = `\s*id,\s*shift_lead_id,/)
    expect(src).toMatch(/const EVENT_DETAIL_SELECT_NO_PLATES = `\s*id,\s*shift_lead_id,/)
  })

  it('wires event detail delete through canViewerDeleteEvent', () => {
    const src = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '../pages/EventDetailPage.tsx'),
      'utf8',
    )
    expect(src).toContain('canViewerDeleteEvent')
    expect(src).not.toContain('viewerMayDeleteOthersEvents')
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

describe('event list right-click delete', () => {
  it('is Super Admin only', () => {
    expect(canUseEventListDeleteContext(['super_admin'])).toBe(true)
    expect(canUseEventListDeleteContext(['super_admin', 'admin'])).toBe(true)
    expect(canUseEventListDeleteContext(['admin'])).toBe(false)
    expect(canUseEventListDeleteContext(['shift_lead'])).toBe(false)
  })

  it('names the police id in the confirm title', () => {
    expect(eventDeleteConfirmTitle('12345')).toBe('למחוק את האירוע 12345?')
    expect(eventDeleteConfirmTitle(null)).toBe('למחוק את האירוע?')
    expect(eventDeleteConfirmTitle('  ')).toBe('למחוק את האירוע?')
  })

  it('warns specifically when assigned responders will also be deleted', () => {
    expect(eventDeleteConfirmBody(2)).toBe(
      'יש מתנדבים משובצים באירוע. הפעולה תמחק גם את הנתונים שלהם. האם למחוק? לא ניתן לשחזר.',
    )
    expect(eventDeleteConfirmBody(0)).toBe('לא ניתן לשחזר את האירוע לאחר המחיקה.')
  })
})

describe('events delete RLS owns the creator', () => {
  const sql = readFileSync(resolve(migrationsDir, '20260902120000_events_delete_shift_lead_own_only.sql'), 'utf8')
  const allSql = readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => readFileSync(resolve(migrationsDir, name), 'utf8'))
    .join('\n')

  function latestLeadDeletePolicy(): string {
    const marker = 'create policy events_delete_cockpit_draft_lead'
    const start = allSql.toLowerCase().lastIndexOf(marker)
    return allSql.slice(start, allSql.indexOf(';', start))
  }

  it('requires shift_lead_id = auth.uid() on the lead delete policy', () => {
    const policy = latestLeadDeletePolicy()
    expect(policy).toContain('create policy events_delete_cockpit_draft_lead')
    expect(policy).toMatch(/shift_lead_id\s*=\s*auth\.uid\(\)/)
  })

  it('lets the owning shift lead delete an event with assigned responders', () => {
    expect(latestLeadDeletePolicy()).not.toMatch(/not\s+exists[\s\S]*event_responders/)
  })

  it('blocks a shift_lead from dropping another lead\'s shift-born stubs', () => {
    expect(sql).toContain('אין הרשאה למחוק אירוע שנוצר על ידי אחמ״ש אחר.')
    expect(sql).toContain('v_shift.shift_lead_id is distinct from auth.uid()')
    expect(sql).toContain("has_role(auth.uid(), 'admin')")
  })
})

describe('super_admin may delete any event', () => {
  const sql = readFileSync(
    resolve(migrationsDir, '20260913083000_super_admin_delete_any_event.sql'),
    'utf8',
  )

  it('lets super_admin delete events created by other leads or admins', () => {
    expect(sql).toContain('create or replace function public.delete_event')
    expect(sql).toContain("has_role(auth.uid(), 'super_admin')")
    expect(sql).toContain('delete from public.events where id = p_event_id')
    expect(sql).toContain('security definer')
  })

  it('keeps the other-lead error for non-super-admin callers', () => {
    expect(sql).toContain('אין הרשאה למחוק אירוע שנוצר על ידי אחמ״ש אחר.')
  })

  it('sends web delete through the RPC so child RLS cannot block cascade', () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), './events.ts'), 'utf8')
    const fn = src.slice(src.indexOf('export async function deleteEvent'))
    const body = fn.slice(0, fn.indexOf('export async function approveEventFreeze'))
    expect(body).toContain(".rpc('delete_event'")
    expect(body).toContain('p_event_id')
  })
})
