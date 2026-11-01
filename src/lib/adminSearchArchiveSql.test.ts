import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LEGACY_HIT_TYPE_LABELS } from '../../supabase/functions/_shared/legacyHitTypes'

const srcDir = resolve(import.meta.dirname)

describe('admin_search_archive migration', () => {
  const sql = readFileSync(
    resolve(srcDir, '../../supabase/migrations/20261101121000_admin_search_archive.sql'),
    'utf8',
  )

  it('runs as owner with a fixed search path and refuses non-admins with 42501', () => {
    expect(sql).toContain(
      'create or replace function public.admin_search_archive(p_filter jsonb, p_limit int default 200)',
    )
    expect(sql).toContain('security definer')
    expect(sql).toContain('set search_path = public, legacy')
    expect(sql).toContain("has_role(v_uid, 'super_admin')")
    expect(sql).toContain("has_role(v_uid, 'admin')")
    expect(sql).toContain("errcode = '42501'")
  })

  it('audits every allowed lookup as smart, with the filter masked', () => {
    expect(sql).toContain('insert into legacy.report_lookup_audit')
    expect(sql).toContain("'smart'")
    expect(sql).toContain('legacy.mask_id_like(p_filter::text)')
  })

  it('never selects an ID-number column', () => {
    expect(sql).not.toContain('pid')
    expect(sql).not.toContain('mask_pid')
    expect(sql).not.toContain('user_details')
  })

  it('maps damage_location to hit_id by the 17 labels, in HIT_TYPES order', () => {
    expect(LEGACY_HIT_TYPE_LABELS).toHaveLength(17)
    let from = 0
    LEGACY_HIT_TYPE_LABELS.forEach((label, i) => {
      const at = sql.indexOf(`(${i + 1}, '${label}')`, from)
      expect(at, label).toBeGreaterThan(-1)
      from = at
    })
  })

  it('matches a numeric road as a whole number, not a substring', () => {
    expect(sql).toContain(
      "when v_road ~ '^\\d+$' then ve.road_number ~ ('(^|\\D)' || v_road || '(\\D|$)')",
    )
  })

  it('returns no rows for a filter with no archive-side key, and skips new-only or people-only filters', () => {
    const gate = sql.slice(
      sql.indexOf('v_has_key :='),
      sql.indexOf(';', sql.indexOf('v_has_key :=')),
    )
    for (const v of [
      'v_from', 'v_to', 'v_police_id', 'v_road', 'v_location_words', 'v_event_type', 'v_branch_ids',
      'v_plate', 'v_vehicle_words', 'v_person_words', 'v_text_words', 'v_damaged', 'v_hit_id',
    ]) {
      expect(gate).toContain(v)
    }
    expect(gate).not.toContain('status')
    expect(gate).not.toContain('cancelled')
    expect(sql).toContain("if v_entity = 'people' or v_source = 'new' then")
  })

  it('withholds the function from public and anon', () => {
    expect(sql).toContain('revoke all on function public.admin_search_archive(jsonb, int) from public, anon')
    expect(sql).toContain('grant execute on function public.admin_search_archive(jsonb, int) to authenticated')
  })
})
