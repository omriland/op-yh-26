import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const srcDir = resolve(import.meta.dirname)

describe('admin smart search migration', () => {
  const sql = readFileSync(
    resolve(srcDir, '../../supabase/migrations/20261101120000_admin_smart_search.sql'),
    'utf8',
  )

  it('runs admin_search as the caller and gates it to admins', () => {
    expect(sql).toContain(
      'create or replace function public.admin_search(p_filter jsonb, p_limit int default 200)',
    )
    expect(sql).toContain('security invoker')
    expect(sql).toContain("has_role(auth.uid(), 'admin')")
    expect(sql).toContain("'super_admin'")
  })

  it('excludes demo events and reaches leads, plates and last activity', () => {
    expect(sql).toContain('is_demo')
    expect(sql).toContain('event_secondary_leads')
    expect(sql).toContain('plate_digits')
    expect(sql).toContain('admin_list_last_active()')
  })

  it('keeps the search log and is re-runnable', () => {
    expect(sql).toContain('create table if not exists public.smart_search_log')
    expect(sql).not.toMatch(/drop table/i)
  })

  it('withholds admin_search from anon', () => {
    expect(sql).toContain('revoke all on function public.admin_search(jsonb, int) from public, anon')
    expect(sql).toContain('grant execute on function public.admin_search(jsonb, int) to authenticated')
  })
})
