-- Admin smart search: admin_search over new events and people, Hebrew word
-- variants, and a small search log used to tune the prompt.
--
-- admin_search runs as the caller (security invoker), so RLS applies exactly
-- as everywhere else, and it returns empty arrays for anyone who is not an
-- admin or super admin. p_filter comes from the browser: it is validated by
-- the Edge Function first, but here it is still treated as untrusted (wrong
-- types are ignored, ilike wildcards are escaped).
--
-- Re-runnable: the Deploy Edge Functions workflow applies it on every run.

-- ---------------------------------------------------------------------------
-- Words
-- ---------------------------------------------------------------------------

-- Hebrew glues ב ה ו כ ל מ ש onto words (בסוזוקי, לדני), so a word of 4 or
-- more letters that starts with one of them is also tried without it.
-- Gershayim and geresh are dropped, so אחמ״ש and אחמש match alike.
create or replace function public.smart_search_word_variants(p_word text)
returns text[]
language sql
immutable
set search_path = public
as $$
  select case
    when char_length(w) >= 4 and w ~ '^[בהוכלמש]' then array[w, substr(w, 2)]
    else array[w]
  end
  from (select translate(lower(coalesce(p_word, '')), '״"׳''', '') as w) as normalized;
$$;

-- The whitespace words of a filter value. Words that are only gershayim drop out.
create or replace function public.smart_search_words(p_text text)
returns text[]
language sql
immutable
set search_path = public
as $$
  select coalesce(array_agg(w), '{}')
  from regexp_split_to_table(coalesce(p_text, ''), '\s+') as w
  where translate(w, '״"׳''', '') <> '';
$$;

-- True when the word, or its prefix-stripped variant, appears in the value.
create or replace function public.smart_search_word_in(p_value text, p_word text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select exists (
    select 1
    from unnest(public.smart_search_word_variants(p_word)) as v(w)
    where v.w <> ''
      and translate(coalesce(p_value, ''), '״"׳''', '') ilike (
        '%'
        || replace(replace(replace(v.w, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_')
        || '%'
      ) escape '\'
  );
$$;

-- True when every word appears in the value. No words: true.
create or replace function public.smart_search_all_words_in(p_value text, p_words text[])
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(bool_and(public.smart_search_word_in(p_value, w)), true)
  from unnest(p_words) as w;
$$;

-- ---------------------------------------------------------------------------
-- Filter values: a key of the wrong JSON type is treated as absent.
-- ---------------------------------------------------------------------------

create or replace function public.smart_search_filter_string(p_filter jsonb, p_key text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when jsonb_typeof(p_filter -> p_key) = 'string'
      then nullif(trim(left(p_filter ->> p_key, 300)), '')
  end;
$$;

create or replace function public.smart_search_filter_date(p_filter jsonb, p_key text)
returns date
language plpgsql
stable
set search_path = public
as $$
declare
  v text := public.smart_search_filter_string(p_filter, p_key);
begin
  if v is null or v !~ '^\d{4}-\d{2}-\d{2}$' then
    return null;
  end if;
  return v::date;
exception when others then
  -- An impossible date such as 2026-02-30.
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_search
-- ---------------------------------------------------------------------------

create or replace function public.admin_search(p_filter jsonb, p_limit int default 200)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
-- One query serves every filter shape; a cached generic plan cannot drop the
-- branches of the keys that are not set, so plan each call for its filter.
set plan_cache_mode = force_custom_plan
as $$
declare
  v_empty constant jsonb := jsonb_build_object('events', '[]'::jsonb, 'people', '[]'::jsonb);
  -- On new events, damaged adds these stems to the treatment and notes match.
  v_damage constant text := 'נזק|פגיע|נפגע|פגוע';
  v_limit int := greatest(1, least(coalesce(p_limit, 200), 5000));
  v_entity text := coalesce(public.smart_search_filter_string(p_filter, 'entity'), 'both');
  v_source text := coalesce(public.smart_search_filter_string(p_filter, 'source'), 'both');
  v_from date := public.smart_search_filter_date(p_filter, 'date_from');
  v_to date := public.smart_search_filter_date(p_filter, 'date_to');
  v_police_id text := public.smart_search_filter_string(p_filter, 'police_event_id');
  v_road text := public.smart_search_filter_string(p_filter, 'road');
  v_event_type text := public.smart_search_filter_string(p_filter, 'event_type');
  v_district text := public.smart_search_filter_string(p_filter, 'district');
  v_status text := public.smart_search_filter_string(p_filter, 'status');
  v_plate text := nullif(
    regexp_replace(coalesce(public.smart_search_filter_string(p_filter, 'plate'), ''), '\D', '', 'g'), '');
  v_location_words text[] := public.smart_search_words(public.smart_search_filter_string(p_filter, 'location_text'));
  v_vehicle_words text[] := public.smart_search_words(public.smart_search_filter_string(p_filter, 'vehicle_text'));
  v_person_words text[] := public.smart_search_words(public.smart_search_filter_string(p_filter, 'person'));
  v_text_words text[] := public.smart_search_words(public.smart_search_filter_string(p_filter, 'text'));
  v_person_kinds text[] := case public.smart_search_filter_string(p_filter, 'person_role')
    when 'lead' then array['lead']
    when 'responder' then array['responder']
    else array['lead', 'responder']
  end;
  v_include_cancelled boolean := coalesce(p_filter -> 'include_cancelled' = 'true'::jsonb, false);
  v_damaged boolean := coalesce(p_filter -> 'damaged' = 'true'::jsonb, false);
  -- The direct lane sends only { text }, so people are found by text when
  -- there is no person key.
  v_people_words text[] := case
    when cardinality(v_person_words) > 0 then v_person_words
    else v_text_words
  end;
  -- Without one of these keys, a filter does not narrow new events (e.g. {}
  -- or the archive-only damage_location), so no events are returned.
  v_has_event_key boolean := v_from is not null or v_to is not null
    or v_police_id is not null or v_road is not null or cardinality(v_location_words) > 0
    or v_event_type is not null or v_district is not null or v_plate is not null
    or cardinality(v_vehicle_words) > 0 or cardinality(v_person_words) > 0
    or cardinality(v_text_words) > 0 or v_status is not null or v_damaged;
  -- "full_name callsign" of every profile matching all person words.
  v_person_hays text[] := '{}';
  v_events jsonb := '[]'::jsonb;
  v_people jsonb := '[]'::jsonb;
begin
  if not (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'super_admin')
  ) then
    return v_empty;
  end if;

  if v_entity <> 'people' and v_source <> 'archive' and v_has_event_key then
    -- Every person word must match the same lead or responder. Matched once
    -- per profile here, not once per event link below.
    if cardinality(v_person_words) > 0 then
      select coalesce(array_agg(concat_ws(' ', p.full_name, p.callsign)), '{}')
      into v_person_hays
      from public.profiles p
      where public.smart_search_all_words_in(concat_ws(' ', p.full_name, p.callsign), v_person_words);
    end if;

    with ev as (
      -- Candidate events: the keys that live on the event row itself.
      select
        e.id, e.event_date, e.created_at, e.police_event_id, e.location, e.shift_lead_id,
        e.treatment_detail, e.treatment_notes, e.notes,
        r.name as road_name, t.name as type_name, d.name as district_name
      from public.events e
      left join public.roads r on r.id = e.road_id
      left join public.event_types t on t.id = e.event_type_id
      left join public.districts d on d.id = e.district_id
      where not e.is_demo
        and (v_include_cancelled or not e.is_cancelled)
        and (v_from is null or e.event_date >= v_from)
        and (v_to is null or e.event_date <= v_to)
        and (v_police_id is null or public.smart_search_word_in(e.police_event_id, v_police_id))
        -- A numeric road matches as a whole number: 4 is כביש 4, not 40 or 431.
        and (v_road is null or case
          when v_road ~ '^\d+$' then r.name ~ ('(^|\D)' || v_road || '(\D|$)')
          else public.smart_search_word_in(r.name, v_road)
        end)
        and (v_event_type is null or t.name = v_event_type)
        and (v_district is null or d.name = v_district)
        and (v_status is null or e.status::text = v_status)
        and public.smart_search_all_words_in(e.location, v_location_words)
    ),
    fields as (
      -- Every searchable field of every candidate event. ord is the found_by
      -- order. hay is what words match; plates also carry digits and vehicle
      -- (manufacturer, model, color).
      select ev.id as event_id, 10 as ord, 'police' as kind,
        'מספר אירוע ' || ev.police_event_id as label, ev.police_event_id as hay,
        null::text as digits, null::text as vehicle
      from ev
      where nullif(trim(ev.police_event_id), '') is not null

      union all
      select p.event_id, 20, 'plate',
        'לוחית ' || p.plate_number
          || coalesce(' · ' || nullif(concat_ws(' ', p.manufacturer, p.model), ''), ''),
        concat_ws(' ', p.plate_number, p.plate_digits, p.manufacturer, p.model, p.color),
        p.plate_digits,
        concat_ws(' ', p.manufacturer, p.model, p.color)
      from (
        -- Plates belong to a volunteer row (fill) or to the event (shift-born).
        select ev.id as event_id, tp.plate_number, tp.plate_digits, tp.manufacturer, tp.model, tp.color
        from ev
        join public.event_treated_plates tp on tp.event_id = ev.id
        union all
        select ev.id, tp.plate_number, tp.plate_digits, tp.manufacturer, tp.model, tp.color
        from ev
        join public.event_responders er on er.event_id = ev.id
        join public.event_treated_plates tp on tp.event_responder_id = er.id
      ) as p

      union all
      -- Some road names already say כביש.
      select ev.id, 30, 'road',
        case when ev.road_name ~ '^כביש' then ev.road_name else 'כביש ' || ev.road_name end,
        ev.road_name, null, null
      from ev
      where ev.road_name is not null

      union all
      select ev.id, 40, 'location', 'מיקום: ' || ev.location, ev.location, null, null
      from ev
      where nullif(trim(ev.location), '') is not null

      union all
      select ev.id, 50, 'lead', 'אחמ״ש: ' || pr.full_name, concat_ws(' ', pr.full_name, pr.callsign), null, null
      from ev
      join public.profiles pr on pr.id = ev.shift_lead_id

      union all
      select ev.id, 51, 'lead', 'אחמ״ש משני: ' || pr.full_name, concat_ws(' ', pr.full_name, pr.callsign), null, null
      from ev
      join public.event_secondary_leads sl on sl.event_id = ev.id
      join public.profiles pr on pr.id = sl.user_id

      union all
      select ev.id, 52, 'responder', 'כונן: ' || pr.full_name, concat_ws(' ', pr.full_name, pr.callsign), null, null
      from ev
      join public.event_responders er on er.event_id = ev.id
      join public.profiles pr on pr.id = er.responder_id

      union all
      select x.event_id, 60, 'treatment', 'טיפול: ' || left(regexp_replace(x.body, '\s+', ' ', 'g'), 40), x.body, null, null
      from (
        select ev.id as event_id, v.body
        from ev
        cross join lateral (values (ev.treatment_detail), (ev.treatment_notes), (ev.notes)) as v(body)
        union all
        select ev.id, v.body
        from ev
        join public.event_responders er on er.event_id = ev.id
        cross join lateral (values (er.treatment_detail), (er.treatment_notes)) as v(body)
      ) as x
      where nullif(trim(x.body), '') is not null
    ),
    marked as (
      -- Which field matches which key. Each check runs only when its key is set.
      select f.*,
        v_plate is not null and f.kind = 'plate' and f.digits like '%' || v_plate || '%' as plate_hit,
        -- vehicle_text carries Hebrew and Latin spellings of the same car
        -- (סוזוקי suzuki), and a plate holds only one of them (Hebrew make,
        -- Latin model). So a plate must match at least half of the words.
        cardinality(v_vehicle_words) > 0 and f.kind = 'plate' and 2 * (
          select count(*) from unnest(v_vehicle_words) as w where public.smart_search_word_in(f.vehicle, w)
        ) >= cardinality(v_vehicle_words) as vehicle_hit,
        cardinality(v_person_words) > 0 and f.kind = any (v_person_kinds)
          and f.hay = any (v_person_hays) as person_hit,
        v_damaged and f.kind = 'treatment' and f.hay ~ v_damage as damage_hit
      from fields f
    ),
    per_event as (
      select m.event_id,
        bool_or(m.plate_hit) as plate_ok,
        bool_or(m.vehicle_hit) as vehicle_ok,
        bool_or(m.person_hit) as person_ok,
        -- Every text word must match some field. Fields are joined by a
        -- newline, so a word (which has no whitespace) cannot span two.
        cardinality(v_text_words) > 0
          and public.smart_search_all_words_in(string_agg(m.hay, E'\n'), v_text_words) as text_ok,
        bool_or(m.damage_hit) as damage_ok
      from marked m
      group by m.event_id
    ),
    matched as (
      select ev.*
      from ev
      left join per_event pe on pe.event_id = ev.id
      where (v_plate is null or pe.plate_ok)
        and (cardinality(v_vehicle_words) = 0 or pe.vehicle_ok)
        and (cardinality(v_person_words) = 0 or pe.person_ok)
        and (cardinality(v_text_words) = 0 or pe.text_ok)
        and (not v_damaged or pe.damage_ok)
      order by ev.event_date desc, ev.created_at desc
      limit v_limit
    ),
    found as (
      -- found_by: the first matched field, in filter-key order, then field order.
      select distinct on (k.event_id) k.event_id, k.label
      from (
        select m.event_id, m.ord, m.label,
          case
            when m.plate_hit then 1
            when v_police_id is not null and m.kind = 'police' then 2
            when m.person_hit then 3
            when m.vehicle_hit then 4
            when cardinality(v_text_words) > 0 and exists (
              select 1 from unnest(v_text_words) as w where public.smart_search_word_in(m.hay, w)
            ) then 5
            when cardinality(v_location_words) > 0 and m.kind = 'location' then 6
            when v_road is not null and m.kind = 'road' then 7
            when m.damage_hit then 8
          end as priority
        from marked m
        join matched on matched.id = m.event_id
        -- offset 0 keeps the planner from pushing "priority is not null"
        -- below the join, so the text check runs only for the kept events.
        offset 0
      ) as k
      where k.priority is not null
      order by k.event_id, k.priority, k.ord, k.label
    )
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', matched.id,
          'found_by', coalesce(
            found.label,
            case when v_event_type is not null then 'סוג אירוע: ' || matched.type_name end,
            case when v_district is not null then 'מחוז: ' || matched.district_name end,
            'תאריך ' || to_char(matched.event_date, 'DD.MM.YYYY')
          )
        )
        order by matched.event_date desc, matched.created_at desc
      ),
      '[]'::jsonb
    )
    into v_events
    from matched
    left join found on found.event_id = matched.id;
  end if;

  if v_entity <> 'events' and cardinality(v_people_words) > 0 then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.full_name), '[]'::jsonb)
    into v_people
    from (
      select
        p.id,
        p.full_name,
        p.callsign,
        (
          select ur.role::text
          from public.user_roles ur
          where ur.user_id = p.id
          order by array_position(array['super_admin', 'admin', 'shift_lead', 'responder'], ur.role::text)
          limit 1
        ) as highest_role,
        p.volunteer_status::text as volunteer_status,
        la.last_active_at
      from public.profiles p
      left join public.admin_list_last_active() la on la.user_id = p.id
      where public.smart_search_all_words_in(
        concat_ws(' ', p.full_name, p.callsign, p.phone, regexp_replace(p.phone, '\D', '', 'g'), p.email),
        v_people_words
      )
      order by p.full_name
      limit 50
    ) as x;
  end if;

  return jsonb_build_object('events', v_events, 'people', v_people);
end;
$$;

-- ---------------------------------------------------------------------------
-- Search log: admin-read only. Rows are written only through the functions
-- below, which stamp actor_id = auth.uid().
-- ---------------------------------------------------------------------------

create table if not exists public.smart_search_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles (id) on delete cascade,
  query text not null,
  filter jsonb not null default '{}'::jsonb,
  lane text not null check (lane in ('ai', 'direct', 'fallback')),
  event_count int,
  archive_count int,
  people_count int,
  latency_ms int,
  chip_removed boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.smart_search_log enable row level security;

drop policy if exists smart_search_log_admin_select on public.smart_search_log;
create policy smart_search_log_admin_select on public.smart_search_log
for select to authenticated
using (
  public.has_role(auth.uid(), 'admin')
  or public.has_role(auth.uid(), 'super_admin')
);

revoke all on table public.smart_search_log from public, anon, authenticated;
grant select on table public.smart_search_log to authenticated;

create or replace function public.log_smart_search(
  p_query text,
  p_filter jsonb,
  p_lane text,
  p_latency_ms int
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'super_admin')
  ) then
    raise exception 'Only admins can log a smart search' using errcode = '42501';
  end if;

  insert into public.smart_search_log (actor_id, query, filter, lane, latency_ms)
  values (auth.uid(), coalesce(p_query, ''), coalesce(p_filter, '{}'::jsonb), p_lane, p_latency_ms)
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.set_smart_search_log_counts(
  p_id uuid,
  p_events int,
  p_archive int,
  p_people int
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.smart_search_log
  set event_count = p_events, archive_count = p_archive, people_count = p_people
  where id = p_id and actor_id = auth.uid();
$$;

create or replace function public.mark_smart_search_chip_removed(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.smart_search_log
  set chip_removed = true
  where id = p_id and actor_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Grants. Supabase's default privileges grant every new public function to
-- anon, so a revoke from public alone leaves anon able to call it.
-- admin_search runs as the caller, so the caller needs its helpers too.
-- ---------------------------------------------------------------------------

revoke all on function public.smart_search_word_variants(text) from public, anon;
revoke all on function public.smart_search_words(text) from public, anon;
revoke all on function public.smart_search_word_in(text, text) from public, anon;
revoke all on function public.smart_search_all_words_in(text, text[]) from public, anon;
revoke all on function public.smart_search_filter_string(jsonb, text) from public, anon;
revoke all on function public.smart_search_filter_date(jsonb, text) from public, anon;
revoke all on function public.admin_search(jsonb, int) from public, anon;
revoke all on function public.log_smart_search(text, jsonb, text, int) from public, anon;
revoke all on function public.set_smart_search_log_counts(uuid, int, int, int) from public, anon;
revoke all on function public.mark_smart_search_chip_removed(uuid) from public, anon;

grant execute on function public.smart_search_word_variants(text) to authenticated;
grant execute on function public.smart_search_words(text) to authenticated;
grant execute on function public.smart_search_word_in(text, text) to authenticated;
grant execute on function public.smart_search_all_words_in(text, text[]) to authenticated;
grant execute on function public.smart_search_filter_string(jsonb, text) to authenticated;
grant execute on function public.smart_search_filter_date(jsonb, text) to authenticated;
grant execute on function public.admin_search(jsonb, int) to authenticated;
grant execute on function public.log_smart_search(text, jsonb, text, int) to authenticated;
grant execute on function public.set_smart_search_log_counts(uuid, int, int, int) to authenticated;
grant execute on function public.mark_smart_search_chip_removed(uuid) to authenticated;
