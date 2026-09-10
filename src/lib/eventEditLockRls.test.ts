import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const srcDir = resolve(import.meta.dirname)

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
