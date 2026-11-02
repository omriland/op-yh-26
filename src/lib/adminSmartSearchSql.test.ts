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

  it('matches a numeric road as a whole number, not a substring', () => {
    expect(sql).toContain("when v_road ~ '^\\d+$' then r.name ~ ('(^|\\D)' || v_road || '(\\D|$)')")
  })

  it('plans admin_search per call, like the archive function', () => {
    const header = sql.slice(
      sql.indexOf('create or replace function public.admin_search('),
      sql.indexOf('as $$', sql.indexOf('create or replace function public.admin_search(')),
    )
    expect(header).toContain('set plan_cache_mode = force_custom_plan')
  })

  it('does not double כביש in the road found_by label', () => {
    expect(sql).not.toContain("'כביש ' || ev.road_name, ev.road_name")
    expect(sql).toContain("case when ev.road_name ~ '^כביש' then ev.road_name else 'כביש ' || ev.road_name end")
  })

  it('returns no events for a filter with no event-side key ({} or archive-only damage_location)', () => {
    const gate = sql.slice(
      sql.indexOf('v_has_event_key boolean :='),
      sql.indexOf(';', sql.indexOf('v_has_event_key boolean :=')),
    )
    for (const v of [
      'v_from', 'v_to', 'v_police_id', 'v_road', 'v_location_words', 'v_event_type', 'v_district',
      'v_plate', 'v_vehicle_words', 'v_person_words', 'v_text_words', 'v_status', 'v_damaged',
    ]) {
      expect(gate).toContain(v)
    }
    expect(gate).not.toContain('damage_location')
    expect(sql).toContain("if v_entity <> 'people' and v_source <> 'archive' and v_has_event_key then")
  })

  it('withholds admin_search from anon', () => {
    expect(sql).toContain('revoke all on function public.admin_search(jsonb, int) from public, anon')
    expect(sql).toContain('grant execute on function public.admin_search(jsonb, int) to authenticated')
  })
})
