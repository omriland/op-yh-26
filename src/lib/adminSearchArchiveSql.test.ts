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
      'v_from', 'v_to', 'v_police_id', 'v_road', 'v_location_words', 'v_type_ids', 'v_branch_ids',
      'v_plate', 'v_vehicle_words', 'v_person_words', 'v_text_words', 'v_damaged', 'v_hit_id',
    ]) {
      expect(gate).toContain(v)
    }
    expect(gate).not.toContain('status')
    expect(gate).not.toContain('cancelled')
    expect(sql).toContain("if v_entity = 'people' or v_source = 'new' then")
  })

  it('ignores an event_type that names no old event type, like district', () => {
    expect(sql).not.toContain("coalesce(array_agg(et.event_id), '{}')")
    expect(sql).toContain('select array_agg(et.event_id) into v_type_ids')
    expect(sql).toContain('and (v_type_ids is null or ve.event_type = any (v_type_ids))')
    expect(sql).toContain("case when v_type_ids is not null then 'סוג אירוע: '")
    expect(sql).not.toMatch(/v_event_type is null or ve\.event_type/)
  })

  it('picks events by the event-level keys, then matches and summarizes every row of them', () => {
    expect(sql).toContain('group by ve.event_fk\n    ),')
    expect(sql).toContain('join cand c on c.event_fk = ve.event_fk')
    const vol = sql.slice(sql.indexOf('    vol as ('), sql.indexOf('    person as ('))
    expect(vol).not.toContain('where')
  })

  it('lets text find plates (and their digits), event numbers, roads and people', () => {
    expect(sql).toMatch(
      /string_agg\(concat_ws\(E'\\n', vol\.event_number, vol\.road_number, vol\.location,\s+vol\.volunteer, vol\.coordinator, vol\.actions_taken, vol\.problems\)/,
    )
    expect(sql).toContain("string_agg(concat_ws(E'\\n', car.plate, regexp_replace(car.plate, '\\D', '', 'g')), E'\\n')")
    expect(sql).toContain('or cardinality(v_text_words) > 0\n    ),')
    for (const label of ["'מספר אירוע '", "'לוחית '", "'מיקום: '", "'אחמ״ש: '", "'כונן: '", "'טיפול: '"]) {
      expect(sql).toContain(label)
    }
    expect(sql).not.toContain("'כביש ' || 'כביש")
  })

  it('narrows the candidates with an indexed prefilter before the per-event matching', () => {
    expect(sql).toContain('create extension if not exists pg_trgm with schema extensions;')
    expect(sql).toContain(
      'create index if not exists vol_events_search_trgm_idx on legacy.vol_events using gin (\n' +
        '  legacy.archive_event_text(event_number, road_number, location, call_sign, coordinator, actions_taken, problems)\n' +
        '  extensions.gin_trgm_ops);',
    )
    expect(sql).toContain(
      'create index if not exists cars_in_hits_search_trgm_idx on legacy.cars_in_hits using gin (\n' +
        '  legacy.archive_car_text(license_plate) extensions.gin_trgm_ops);',
    )
    expect(sql).toContain('revoke all on function legacy.archive_car_text(text) from public, anon, authenticated;')
    expect(sql).toMatch(/revoke all on function legacy\.archive_event_text\(text(, text){6}\)\s+from public, anon, authenticated;/)

    const pre = sql.slice(sql.indexOf('    -- Prefilter.'), sql.indexOf('    with names as ('))
    for (const words of ['v_text_words', 'v_person_words', 'v_location_words', 'v_vehicle_words']) {
      expect(pre).toContain(`foreach v_word in array ${words} loop`)
    }
    // A word's patterns are its variants with no escape character, so % and _ only widen them.
    expect(pre).toContain("like_escape('%' || v.v || '%', '')")
    expect(pre).toContain('from unnest(public.smart_search_word_variants(v_word)) as v(v)')
    expect(pre).toContain('ve.coordinator, ve.actions_taken, ve.problems) like any (v_pats)')
    expect(pre).toContain('where legacy.archive_car_text(ci.license_plate) like any (v_pats)')
    // The prefilter never calls a per-row smart_search_* matcher.
    expect(pre).not.toContain('smart_search_word_in(')
    expect(pre).not.toContain('smart_search_all_words_in(')

    const cand = sql.slice(sql.indexOf('    cand as ('), sql.indexOf('    vol as ('))
    for (const v of ['v_text_fks', 'v_person_fks', 'v_plate_fks', 'v_vehicle_fks']) {
      expect(cand).toContain(`and (${v} is null or ve.event_fk = any (${v}))`)
    }
    for (const v of ['v_police_ids', 'v_location_ids']) {
      expect(cand).toContain(`and (${v} is null or ve.auto_id = any (${v}))`)
    }
  })

  it('ignores text, location_text and vehicle_text words under 3 characters, before the key gate', () => {
    const gate = sql.indexOf('v_has_key :=')
    for (const words of ['v_text_words', 'v_location_words', 'v_vehicle_words']) {
      const rule =
        `  ${words} := array(select w from unnest(${words}) as w\n` +
        `    where char_length(translate(w, '״"׳''', '')) >= 3);`
      expect(sql).toContain(rule)
      expect(sql.indexOf(rule)).toBeLessThan(gate)
      expect(sql.indexOf(rule)).toBeGreaterThan(sql.indexOf("errcode = '42501'"))
    }
    // person keeps short words; the gate counts the filtered arrays.
    expect(sql).not.toContain('  v_person_words := array(')
    expect(sql.slice(gate)).toContain('cardinality(v_text_words) > 0')
  })

  it('returns the actions of every volunteer row, distinct, joined with | and masked', () => {
    expect(sql).toContain(
      "string_agg(distinct btrim(mv.actions_taken), ' | ' order by btrim(mv.actions_taken)) as actions",
    )
    expect(sql).toContain("'actions', coalesce(legacy.mask_id_digits(s.actions), '')")
  })

  it('withholds the function from public and anon', () => {
    expect(sql).toContain('revoke all on function public.admin_search_archive(jsonb, int) from public, anon')
    expect(sql).toContain('grant execute on function public.admin_search_archive(jsonb, int) to authenticated')
  })
})
