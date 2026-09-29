import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const srcDir = resolve(import.meta.dirname)

describe('locked lead km RPC', () => {
  const sql = readFileSync(
    resolve(srcDir, '../../supabase/migrations/20260929120000_set_locked_event_lead_km.sql'),
    'utf8',
  )

  it('updates only total_km from null, for a shift lead, on an event past 7 days', () => {
    expect(sql).toContain('set_locked_event_lead_km')
    expect(sql).toContain('security definer')
    expect(sql).toContain("has_role(auth.uid(), 'shift_lead')")
    expect(sql).toContain("has_role(auth.uid(), 'admin')")
    expect(sql).toContain("has_role(auth.uid(), 'super_admin')")
    expect(sql).toContain("interval '7 days'")
    expect(sql).toContain('v_created_at >= (now() - interval \'7 days\')')
    expect(sql).toContain('v_current_km is not null')
    expect(sql).toContain('and not v.archived')
    expect(sql).toContain('and total_km is null')
    expect(sql).toMatch(/update public\.event_responders\s+set\s+total_km = p_total_km,\s+updated_at = now\(\)/)
    expect(sql).not.toMatch(/update public\.events/i)
    expect(sql).not.toContain('drop policy')
    expect(sql).not.toContain('is_event_edit_unlocked')
    expect(sql).toContain('revoke all on function public.set_locked_event_lead_km(uuid, numeric) from anon')
    expect(sql).toContain('grant execute on function public.set_locked_event_lead_km(uuid, numeric) to authenticated')
  })

  it('keeps the full-form save rejected after the lock', () => {
    const form = readFileSync(resolve(srcDir, 'eventForm.ts'), 'utf8')
    expect(form).toContain('return { ok: false, error: EVENT_EDIT_LOCKED_TOOLTIP }')
    expect(form).toContain(".rpc('set_locked_event_lead_km'")
    expect(form).not.toMatch(/saveLockedEventLeadKm[\s\S]{0,500}\.from\('events'\)/)
  })
})

describe('event edit-lock RLS', () => {
  it('does not let write policies read events through RLS on SELECT', () => {
    const fix = readFileSync(
      resolve(
        srcDir,
        '../../supabase/migrations/20260910070000_fix_event_edit_lock_rls_recursion.sql',
      ),
      'utf8',
    )

    expect(fix).toContain('security definer')
    expect(fix).toContain('is_event_id_edit_unlocked')
    expect(fix).toContain('drop policy if exists event_responders_lead_admin_write')
    expect(fix).toContain('drop policy if exists treated_vehicles_lead_admin_write')
    expect(fix).not.toMatch(
      /create policy event_responders_lead_admin_\w+[\s\S]{0,80}for all/,
    )
    expect(fix).not.toMatch(
      /create policy treated_vehicles_lead_admin_\w+[\s\S]{0,80}for all/,
    )
  })
})
