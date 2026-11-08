-- Search for every role: app_search (events and people, as the caller),
-- app_search_archive (old site, admins only, audited once per typing session)
-- and app_search_log (any signed-in user; the log keeps a reason column).
--
-- Why new names instead of replacing admin_search / admin_search_archive /
-- log_smart_search: the Deploy Edge Functions workflow replays
-- 20261101120000 and 20261101121000 on every run, which would restore their old
-- bodies over any change made here. Those functions stay as they are and the app
-- stops calling them.
--
-- The rule: search returns a row only if the caller could already open it.
--   app_search is security invoker, so events, event_responders, plates,
--   profiles and shifts are read through RLS exactly as in the rest of the app
--   (a כונן reads only released events they are on, never a טיוטה).
--   Columns are a role decision RLS cannot make, so app_search itself matches
--   and returns phone and email only for admins, and drops the people-only keys
--   volunteer_status and no_shift_* for callers who are neither admin nor
--   shift lead. Dropped keys come back in `dropped`.
--   The archive stays behind a security definer admin gate, with masking and
--   an audit row.
--
-- p_filter comes from the browser and is untrusted: wrong JSON types are
-- ignored, ilike wildcards are escaped by the smart_search_* helpers.
-- Idempotent.

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Log: a reason column and a rules lane.
-- ---------------------------------------------------------------------------

alter table public.smart_search_log add column if not exists reason text;
alter table public.smart_search_log drop constraint if exists smart_search_log_lane_check;
alter table public.smart_search_log add constraint smart_search_log_lane_check
  check (lane in ('ai', 'direct', 'fallback', 'rules'));
create index if not exists smart_search_log_actor_created_idx
  on public.smart_search_log (actor_id, created_at desc);

-- Any signed-in user. The row is stamped with auth.uid(); reading the log stays admin-only.
create or replace function public.app_search_log(
  p_query text,
  p_filter jsonb,
  p_lane text,
  p_latency_ms int,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'sign in to log a search' using errcode = '42501';
  end if;
  insert into public.smart_search_log (actor_id, query, filter, lane, latency_ms, reason)
  values (
    auth.uid(),
    left(coalesce(p_query, ''), 300),
    coalesce(p_filter, '{}'::jsonb),
    p_lane,
    p_latency_ms,
    nullif(left(coalesce(p_reason, ''), 40), '')
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Text helpers
-- ---------------------------------------------------------------------------

-- Niqqud and cantillation marks (not maqaf, U+05BE, which separates words).
create or replace function public.app_search_strip_niqqud(p_value text)
returns text
language sql
immutable
set search_path = public
as $$
  select regexp_replace(coalesce(p_value, ''),
    '[' || chr(1425) || '-' || chr(1469) || chr(1471) || chr(1473) || chr(1474)
      || chr(1476) || chr(1477) || chr(1479) || ']', '', 'g');
$$;

-- Words of a filter value with niqqud dropped.
create or replace function public.app_search_words(p_text text)
returns text[]
language sql
immutable
set search_path = public
as $$
  select public.smart_search_words(public.app_search_strip_niqqud(p_text));
$$;

-- Escapes like wildcards.
create or replace function public.app_search_like_escape(p_value text)
returns text
language sql
immutable
set search_path = public
as $$
  select replace(replace(replace(coalesce(p_value, ''), E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_');
$$;

-- uuid[] from a JSON array of strings; anything else is ignored.
create or replace function public.app_search_filter_uuids(p_filter jsonb, p_key text)
returns uuid[]
language sql
immutable
set search_path = public
as $$
  select case when jsonb_typeof(p_filter -> p_key) = 'array' then (
    select coalesce(array_agg(distinct v::uuid), '{}')
    from (
      select x as v
      from jsonb_array_elements_text(p_filter -> p_key) as t(x)
      where x ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      limit 50
    ) as ok
  ) else '{}'::uuid[] end;
$$;

-- text[] from a JSON array of strings (trimmed, max 50 of 40 chars).
create or replace function public.app_search_filter_texts(p_filter jsonb, p_key text)
returns text[]
language sql
immutable
set search_path = public
as $$
  select case when jsonb_typeof(p_filter -> p_key) = 'array' then (
    select coalesce(array_agg(distinct v), '{}')
    from (
      select lower(btrim(left(x, 40))) as v
      from jsonb_array_elements_text(p_filter -> p_key) as t(x)
      where btrim(x) <> ''
      limit 50
    ) as ok
  ) else '{}'::text[] end;
$$;

-- Typo-tolerant name suggestions.
create index if not exists profiles_search_trgm_idx on public.profiles
  using gin ((lower(full_name || ' ' || callsign)) extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- app_search
-- ---------------------------------------------------------------------------

create or replace function public.app_search(
  p_filter jsonb,
  p_mode text default 'full',
  p_limit int default 200
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, extensions
set plan_cache_mode = force_custom_plan
as $$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean := public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'super_admin');
  v_is_lead boolean := public.has_role(auth.uid(), 'shift_lead');
  v_suggest boolean := p_mode = 'suggest';
  v_limit int := case when p_mode = 'suggest' then 5 else greatest(1, least(coalesce(p_limit, 200), 5000)) end;
  v_people_limit int;
  v_damage constant text := 'נזק|פגיע|נפגע|פגוע';
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
  v_location_words text[] := public.app_search_words(public.smart_search_filter_string(p_filter, 'location_text'));
  v_vehicle_words text[] := public.app_search_words(public.smart_search_filter_string(p_filter, 'vehicle_text'));
  v_person_words text[] := public.app_search_words(public.smart_search_filter_string(p_filter, 'person'));
  v_person_ids uuid[] := public.app_search_filter_uuids(p_filter, 'person_ids');
  v_text_words text[] := public.app_search_words(public.smart_search_filter_string(p_filter, 'text'));
  v_volunteer_status text := public.smart_search_filter_string(p_filter, 'volunteer_status');
  v_no_shift_from date := public.smart_search_filter_date(p_filter, 'no_shift_from');
  v_no_shift_to date := public.smart_search_filter_date(p_filter, 'no_shift_to');
  v_person_kinds text[] := case public.smart_search_filter_string(p_filter, 'person_role')
    when 'lead' then array['lead']
    when 'responder' then array['responder']
    else array['lead', 'responder']
  end;
  v_include_cancelled boolean := coalesce(p_filter -> 'include_cancelled' = 'true'::jsonb, false);
  v_damaged boolean := coalesce(p_filter -> 'damaged' = 'true'::jsonb, false);
  v_dropped text[] := '{}';
  v_people_words text[];
  v_people_only boolean;
  v_has_event_key boolean;
  v_person_hays text[] := '{}';
  v_events jsonb := '[]'::jsonb;
  v_people jsonb := '[]'::jsonb;
  v_short text;
begin
  if v_uid is null then
    return jsonb_build_object('events', '[]'::jsonb, 'people', '[]'::jsonb, 'dropped', '[]'::jsonb);
  end if;

  -- People-only keys for admins and shift leads; shift coverage follows shifts RLS.
  if not (v_is_admin or v_is_lead) then
    if v_volunteer_status is not null then
      v_dropped := v_dropped || 'volunteer_status'::text;
      v_volunteer_status := null;
    end if;
    if v_no_shift_from is not null or v_no_shift_to is not null then
      v_dropped := v_dropped || 'no_shift'::text;
      v_no_shift_from := null;
      v_no_shift_to := null;
    end if;
  end if;
  if v_volunteer_status is not null
    and v_volunteer_status <> all (enum_range(null::public.volunteer_status)::text[]) then
    v_volunteer_status := null;
  end if;
  if v_no_shift_from is not null and v_no_shift_to is null then v_no_shift_to := v_no_shift_from; end if;
  if v_no_shift_to is not null and v_no_shift_from is null then v_no_shift_from := v_no_shift_to; end if;

  v_people_only := v_volunteer_status is not null or v_no_shift_from is not null;
  v_people_words := case when cardinality(v_person_words) > 0 then v_person_words else v_text_words end;
  v_has_event_key := v_from is not null or v_to is not null
    or v_police_id is not null or v_road is not null or cardinality(v_location_words) > 0
    or v_event_type is not null or v_district is not null or v_plate is not null
    or cardinality(v_vehicle_words) > 0 or cardinality(v_person_words) > 0
    or cardinality(v_person_ids) > 0
    or cardinality(v_text_words) > 0 or v_status is not null or v_damaged;

  if v_entity <> 'people' and v_source <> 'archive' and v_has_event_key and not v_people_only then
    if cardinality(v_person_ids) = 0 and cardinality(v_person_words) > 0 then
      select coalesce(array_agg(concat_ws(' ', p.full_name, p.callsign)), '{}')
      into v_person_hays
      from public.profiles p
      where public.smart_search_all_words_in(concat_ws(' ', p.full_name, p.callsign), v_person_words);
    end if;

    with ev as (
      select
        e.id, e.event_date, e.created_at, e.police_event_id, e.location, e.shift_lead_id,
        e.treatment_detail, e.treatment_notes, e.notes,
        r.name as road_name, t.name as type_name, d.name as district_name
      from public.events e
      left join public.roads r on r.id = e.road_id
      left join public.event_types t on t.id = e.event_type_id
      left join public.districts d on d.id = e.district_id
      where (not e.is_demo or public.is_app_review_demo_caller())
        and (v_include_cancelled or not e.is_cancelled)
        and (v_from is null or e.event_date >= v_from)
        and (v_to is null or e.event_date <= v_to)
        and (v_police_id is null or public.smart_search_word_in(e.police_event_id, v_police_id))
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
      select ev.id as event_id, 10 as ord, 'police' as kind,
        'מספר אירוע ' || ev.police_event_id as label, ev.police_event_id as hay,
        null::text as digits, null::text as vehicle, null::uuid as person_id
      from ev
      where nullif(trim(ev.police_event_id), '') is not null

      union all
      select p.event_id, 20, 'plate',
        'לוחית ' || p.plate_number
          || coalesce(' · ' || nullif(concat_ws(' ', p.manufacturer, p.model), ''), ''),
        concat_ws(' ', p.plate_number, p.plate_digits, p.manufacturer, p.model, p.color),
        p.plate_digits,
        concat_ws(' ', p.manufacturer, p.model, p.color),
        null::uuid
      from (
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
      select ev.id, 30, 'road',
        case when ev.road_name ~ '^כביש' then ev.road_name else 'כביש ' || ev.road_name end,
        ev.road_name, null, null, null
      from ev
      where ev.road_name is not null

      union all
      select ev.id, 40, 'location', 'מיקום: ' || ev.location, ev.location, null, null, null
      from ev
      where nullif(trim(ev.location), '') is not null

      union all
      select ev.id, 50, 'lead', 'אחמ״ש: ' || pr.full_name, concat_ws(' ', pr.full_name, pr.callsign), null, null, pr.id
      from ev
      join public.profiles pr on pr.id = ev.shift_lead_id

      union all
      select ev.id, 51, 'lead', 'אחמ״ש משני: ' || pr.full_name, concat_ws(' ', pr.full_name, pr.callsign), null, null, pr.id
      from ev
      join public.event_secondary_leads sl on sl.event_id = ev.id
      join public.profiles pr on pr.id = sl.user_id

      union all
      select ev.id, 52, 'responder', 'כונן: ' || pr.full_name, concat_ws(' ', pr.full_name, pr.callsign), null, null, pr.id
      from ev
      join public.event_responders er on er.event_id = ev.id
      join public.profiles pr on pr.id = er.responder_id

      union all
      select x.event_id, 60, 'treatment', 'טיפול: ' || left(regexp_replace(x.body, '\s+', ' ', 'g'), 40), x.body, null, null, null
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
      select f.*,
        v_plate is not null and f.kind = 'plate' and f.digits like '%' || v_plate || '%' as plate_hit,
        cardinality(v_vehicle_words) > 0 and f.kind = 'plate' and 2 * (
          select count(*) from unnest(v_vehicle_words) as w where public.smart_search_word_in(f.vehicle, w)
        ) >= cardinality(v_vehicle_words) as vehicle_hit,
        f.kind = any (v_person_kinds) and (
          (cardinality(v_person_ids) > 0 and f.person_id = any (v_person_ids))
          or (cardinality(v_person_ids) = 0 and cardinality(v_person_words) > 0 and f.hay = any (v_person_hays))
        ) as person_hit,
        v_damaged and f.kind = 'treatment' and f.hay ~ v_damage as damage_hit
      from fields f
    ),
    per_event as (
      select m.event_id,
        bool_or(m.plate_hit) as plate_ok,
        bool_or(m.vehicle_hit) as vehicle_ok,
        bool_or(m.person_hit) as person_ok,
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
        and (cardinality(v_person_words) = 0 and cardinality(v_person_ids) = 0 or pe.person_ok)
        and (cardinality(v_text_words) = 0 or pe.text_ok)
        and (not v_damaged or pe.damage_ok)
      order by ev.event_date desc, ev.created_at desc
      limit v_limit
    ),
    found as (
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

  v_people_limit := case when v_suggest then 5 else least(v_limit, 200) end;
  if v_entity <> 'events'
    and (cardinality(v_people_words) > 0 or cardinality(v_person_ids) > 0 or v_people_only) then
    -- One short word: a prefix of a name word or the callsign, so ד does not
    -- match every name that holds a ד.
    v_short := case
      when cardinality(v_people_words) = 1 and char_length(translate(v_people_words[1], '״"׳''', '')) <= 2
        then lower(translate(v_people_words[1], '״"׳''', ''))
    end;

    with candidates as (
      select p.*,
        concat_ws(' ', p.full_name, p.callsign) as name_hay,
        case when v_is_admin then concat_ws(' ', p.phone, regexp_replace(coalesce(p.phone, ''), '\D', '', 'g'), p.email) end as contact_hay
      from public.profiles p
      where p.deleted_at is null
        and (cardinality(v_person_ids) = 0 or p.id = any (v_person_ids))
        and (v_volunteer_status is null or p.volunteer_status::text = v_volunteer_status)
    ),
    matched as (
      select c.*,
        case
          when cardinality(v_people_words) = 0 or cardinality(v_person_ids) > 0 then null
          when v_short is not null then (' ' || lower(c.full_name)) like ('% ' || public.app_search_like_escape(v_short) || '%')
            or lower(c.callsign) like (public.app_search_like_escape(v_short) || '%')
          else public.smart_search_all_words_in(c.name_hay, v_people_words)
        end as name_ok,
        case
          when v_short is not null or cardinality(v_people_words) = 0 or cardinality(v_person_ids) > 0 then false
          else c.contact_hay is not null and public.smart_search_all_words_in(c.contact_hay, v_people_words)
        end as contact_ok,
        case
          when v_suggest and v_short is null and cardinality(v_people_words) = 1
            and char_length(v_people_words[1]) >= 3
            then extensions.word_similarity(lower(v_people_words[1]), lower(c.name_hay))
          else 0
        end as fuzzy
      from candidates c
    ),
    kept as (
      select m.*,
        -- Exact word first, then a word that starts with the query, then the rest,
        -- so בני ranks above names that only hold ני after a stripped prefix.
        case
          when cardinality(v_people_words) = 0 then 3
          when lower(m.callsign) = lower(array_to_string(v_people_words, ' '))
            or lower(m.full_name) = lower(array_to_string(v_people_words, ' ')) then 0
          when (' ' || lower(m.name_hay)) like ('% ' || public.app_search_like_escape(lower(v_people_words[1])) || '%') then 1
          when m.name_ok or m.contact_ok then 2
          else 3
        end as rank
      from matched m
      where (cardinality(v_people_words) = 0 or cardinality(v_person_ids) > 0
          or m.name_ok or m.contact_ok or m.fuzzy >= 0.5)
        and (v_no_shift_from is null or not exists (
          select 1
          from public.shifts s
          where s.shift_date between v_no_shift_from and v_no_shift_to
            and not s.is_demo
            and (s.shift_lead_id = m.id or exists (
              select 1 from public.shift_responders sr where sr.shift_id = s.id and sr.responder_id = m.id))
        ))
      order by rank, fuzzy desc, m.full_name
      limit v_people_limit
    )
    select coalesce(jsonb_agg(x.obj order by x.rank, x.fuzzy desc, x.full_name), '[]'::jsonb)
    into v_people
    from (
      select k.rank, k.fuzzy, k.full_name,
        jsonb_build_object(
          'id', k.id,
          'full_name', k.full_name,
          'callsign', k.callsign,
          'volunteer_status', k.volunteer_status::text,
          'found_by', case
            when cardinality(v_people_words) = 0 then null
            when public.smart_search_all_words_in(k.callsign, v_people_words) then 'או״ק ' || k.callsign
            when k.name_ok or k.fuzzy > 0 then null
            when public.smart_search_all_words_in(
              concat_ws(' ', k.phone, regexp_replace(coalesce(k.phone, ''), '\D', '', 'g')), v_people_words)
              then 'טלפון'
            else 'דוא״ל'
          end
        )
        || case when v_is_admin then jsonb_build_object(
          'phone', k.phone,
          'email', k.email,
          'highest_role', (
            select ur.role::text from public.user_roles ur
            where ur.user_id = k.id
            order by array_position(array['super_admin', 'admin', 'shift_lead', 'responder'], ur.role::text)
            limit 1),
          'last_active_at', (select la.last_active_at from public.admin_list_last_active() la where la.user_id = k.id)
        ) else '{}'::jsonb end
        || case when v_no_shift_from is not null then jsonb_build_object(
          'last_shift_date', (
            select max(s.shift_date) from public.shifts s
            where s.shift_date < v_no_shift_from and not s.is_demo
              and (s.shift_lead_id = k.id or exists (
                select 1 from public.shift_responders sr where sr.shift_id = s.id and sr.responder_id = k.id)))
        ) else '{}'::jsonb end as obj
      from kept k
    ) as x;
  end if;

  return jsonb_build_object('events', v_events, 'people', v_people, 'dropped', to_jsonb(v_dropped));
end;
$$;

-- ---------------------------------------------------------------------------
-- Archive
-- ---------------------------------------------------------------------------

alter table legacy.report_lookup_audit add column if not exists search_session uuid;
alter table legacy.report_lookup_audit add column if not exists lookups int not null default 1;
create unique index if not exists report_lookup_audit_session_idx
  on legacy.report_lookup_audit (actor_user_id, search_session)
  where search_session is not null;

-- The admin_search_archive matching (20261101121000), with person_callsigns
-- added: an old row matches a person by its call sign or coordinator as well
-- as by name. No gate and no audit: only app_search_archive calls it.
create or replace function legacy.archive_search(p_filter jsonb, p_limit int)
returns jsonb
language plpgsql
stable
set search_path = public, legacy
set plan_cache_mode = force_custom_plan
as $$
declare
  v_limit int := greatest(1, least(coalesce(p_limit, 200), 5000));
  v_from date := public.smart_search_filter_date(p_filter, 'date_from');
  v_to date := public.smart_search_filter_date(p_filter, 'date_to');
  v_police_id text := public.smart_search_filter_string(p_filter, 'police_event_id');
  v_road text := public.smart_search_filter_string(p_filter, 'road');
  v_event_type text := public.smart_search_filter_string(p_filter, 'event_type');
  v_district text := public.smart_search_filter_string(p_filter, 'district');
  v_damage_location text := public.smart_search_filter_string(p_filter, 'damage_location');
  v_plate text := nullif(
    regexp_replace(coalesce(public.smart_search_filter_string(p_filter, 'plate'), ''), '\D', '', 'g'), '');
  v_location_words text[] := public.app_search_words(public.smart_search_filter_string(p_filter, 'location_text'));
  v_vehicle_words text[] := public.app_search_words(public.smart_search_filter_string(p_filter, 'vehicle_text'));
  v_person_words text[] := public.app_search_words(public.smart_search_filter_string(p_filter, 'person'));
  v_person_signs text[] := public.app_search_filter_texts(p_filter, 'person_callsigns');
  v_text_words text[] := public.app_search_words(public.smart_search_filter_string(p_filter, 'text'));
  v_person_role text := coalesce(public.smart_search_filter_string(p_filter, 'person_role'), 'any');
  v_damaged boolean := coalesce(p_filter -> 'damaged' = 'true'::jsonb, false);
  v_type_ids int[];
  v_branch_ids int[];
  v_hit_labels constant text[] := array[
    'פגוש קדמי', 'כנף ימין קדמית', 'כנף שמאל קדמית', 'דלת נהג', 'דלת נוסע',
    'דלת אחורית שמאלית', 'דלת אחורית ימנית', 'כנף אחורית ימנית', 'כנף אחורית שמאלית',
    'תא מטען', 'פגוש אחורי', 'גג', 'שמשה קדמית', 'שמשה אחורית', 'מרכב תחתון', 'גלגלים', 'מכסה מנוע'];
  v_hit_id int := array_position(v_hit_labels, v_damage_location);
  v_has_person boolean;
  v_text_fks text[];
  v_person_fks text[];
  v_plate_fks text[];
  v_vehicle_fks text[];
  v_police_ids int[];
  v_location_ids int[];
  v_person_ids int[];
  v_word text;
  v_pats text[];
  v_signs text[];
  v_fks text[];
  v_ids int[];
  v_rows jsonb := '[]'::jsonb;
begin
  v_text_words := array(select w from unnest(v_text_words) as w
    where char_length(translate(w, '״"׳''', '')) >= 3);
  v_location_words := array(select w from unnest(v_location_words) as w
    where char_length(translate(w, '״"׳''', '')) >= 3);
  v_vehicle_words := array(select w from unnest(v_vehicle_words) as w
    where char_length(translate(w, '״"׳''', '')) >= 3);
  v_has_person := cardinality(v_person_words) > 0 or cardinality(v_person_signs) > 0;

  if v_event_type is not null then
    select array_agg(et.event_id) into v_type_ids
    from legacy.event_types et
    where public.smart_search_all_words_in(et.event_description, public.smart_search_words(v_event_type));
  end if;
  if v_district is not null then
    select array_agg(b.branch_id) into v_branch_ids
    from legacy.branches b
    where public.smart_search_all_words_in(b.branch_name, public.smart_search_words(v_district));
  end if;

  if not (v_from is not null or v_to is not null
    or v_police_id is not null or v_road is not null or cardinality(v_location_words) > 0
    or v_type_ids is not null or v_branch_ids is not null
    or v_plate is not null or cardinality(v_vehicle_words) > 0
    or v_has_person or cardinality(v_text_words) > 0
    or v_damaged or v_hit_id is not null) then
    return '[]'::jsonb;
  end if;

  foreach v_word in array v_text_words loop
    v_pats := array(select like_escape('%' || v.v || '%', '')
      from unnest(public.smart_search_word_variants(v_word)) as v(v) where v.v <> '');
    v_signs := array(select btrim(u.call_sign) from legacy.users u
      where lower(translate(coalesce(u.first_name, '') || E'\n' || coalesce(u.last_name, ''), '״"׳''', ''))
        like any (v_pats));
    select coalesce(array_agg(distinct x.event_fk), '{}') into v_fks
    from (
      select ve.event_fk from legacy.vol_events ve
      where legacy.archive_event_text(ve.event_number, ve.road_number, ve.location, ve.call_sign,
        ve.coordinator, ve.actions_taken, ve.problems) like any (v_pats)
      union all
      select ve.event_fk from legacy.vol_events ve
      where cardinality(v_signs) > 0
        and (btrim(ve.call_sign) = any (v_signs) or btrim(ve.coordinator) = any (v_signs))
      union all
      select ve.event_fk from legacy.cars_in_hits ci
      join legacy.vol_events ve on ve.auto_id = ci.event_fk
      where legacy.archive_car_text(ci.license_plate) like any (v_pats)
    ) as x;
    v_text_fks := case when v_text_fks is null then v_fks
      else array(select unnest(v_text_fks) intersect select unnest(v_fks)) end;
  end loop;

  -- person by name: rows whose call signs or names hold every word.
  foreach v_word in array v_person_words loop
    v_pats := array(select like_escape('%' || v.v || '%', '')
      from unnest(public.smart_search_word_variants(v_word)) as v(v) where v.v <> '');
    v_signs := array(select btrim(u.call_sign) from legacy.users u
      where lower(translate(coalesce(u.first_name, '') || E'\n' || coalesce(u.last_name, ''), '״"׳''', ''))
        like any (v_pats));
    v_ids := array(
      select ve.auto_id from legacy.vol_events ve
      where legacy.archive_event_text(ve.event_number, ve.road_number, ve.location, ve.call_sign,
        ve.coordinator, ve.actions_taken, ve.problems) like any (v_pats)
      union
      select ve.auto_id from legacy.vol_events ve
      where cardinality(v_signs) > 0
        and (btrim(ve.call_sign) = any (v_signs) or btrim(ve.coordinator) = any (v_signs)));
    v_person_ids := case when v_person_ids is null then v_ids
      else array(select unnest(v_person_ids) intersect select unnest(v_ids)) end;
  end loop;
  -- ... or by call sign (a resolved profile's או״ק), either one.
  if cardinality(v_person_signs) > 0 then
    v_ids := array(select ve.auto_id from legacy.vol_events ve
      where lower(btrim(ve.call_sign)) = any (v_person_signs)
        or lower(btrim(ve.coordinator)) = any (v_person_signs));
    v_person_ids := case when v_person_ids is null then v_ids
      else array(select unnest(v_person_ids) union select unnest(v_ids)) end;
  end if;
  if v_person_ids is not null then
    v_person_fks := array(select distinct ve.event_fk from legacy.vol_events ve
      where ve.auto_id = any (v_person_ids));
  end if;

  foreach v_word in array v_location_words loop
    v_pats := array(select like_escape('%' || v.v || '%', '')
      from unnest(public.smart_search_word_variants(v_word)) as v(v) where v.v <> '');
    v_ids := array(select ve.auto_id from legacy.vol_events ve
      where legacy.archive_event_text(ve.event_number, ve.road_number, ve.location, ve.call_sign,
        ve.coordinator, ve.actions_taken, ve.problems) like any (v_pats));
    v_location_ids := case when v_location_ids is null then v_ids
      else array(select unnest(v_location_ids) intersect select unnest(v_ids)) end;
  end loop;

  if v_police_id is not null then
    v_pats := array(select like_escape('%' || v.v || '%', '')
      from unnest(public.smart_search_word_variants(v_police_id)) as v(v) where v.v <> '');
    v_police_ids := array(select ve.auto_id from legacy.vol_events ve
      where legacy.archive_event_text(ve.event_number, ve.road_number, ve.location, ve.call_sign,
        ve.coordinator, ve.actions_taken, ve.problems) like any (v_pats));
  end if;

  if v_plate is not null then
    v_plate_fks := array(select distinct ve.event_fk from legacy.cars_in_hits ci
      join legacy.vol_events ve on ve.auto_id = ci.event_fk
      where legacy.archive_car_text(ci.license_plate) like '%' || v_plate || '%'
        and regexp_replace(coalesce(ci.license_plate, ''), '\D', '', 'g') like '%' || v_plate || '%');
  end if;

  foreach v_word in array v_vehicle_words loop
    v_pats := array(select like_escape('%' || v.v || '%', '')
      from unnest(public.smart_search_word_variants(v_word)) as v(v) where v.v <> '');
    v_vehicle_fks := array(select unnest(v_vehicle_fks) union
      select ve.event_fk from legacy.cars_in_hits ci
      join legacy.vol_events ve on ve.auto_id = ci.event_fk
      where legacy.archive_car_text(ci.license_plate) like any (v_pats));
  end loop;

  with names as (
    select distinct on (btrim(u.call_sign)) btrim(u.call_sign) as sign,
      btrim(u.first_name) || ' ' || btrim(u.last_name) as name
    from legacy.users u
    order by btrim(u.call_sign)
  ),
  cand as (
    select ve.event_fk,
      min(btrim(ve.location)) filter (where btrim(ve.location) <> '') as location_hit,
      min(btrim(ve.road_number)) filter (where btrim(ve.road_number) <> '') as road_hit
    from legacy.vol_events ve
    where (v_from is null or ve.event_date::date >= v_from)
      and (v_to is null or ve.event_date::date <= v_to)
      and (v_police_id is null or public.smart_search_word_in(btrim(ve.event_number), v_police_id))
      and (v_road is null or case
        when v_road ~ '^\d+$' then ve.road_number ~ ('(^|\D)' || v_road || '(\D|$)')
        else public.smart_search_word_in(ve.road_number, v_road)
      end)
      and (cardinality(v_location_words) = 0 or public.smart_search_all_words_in(ve.location, v_location_words))
      and (v_type_ids is null or ve.event_type = any (v_type_ids))
      and (v_branch_ids is null or ve.branch_id = any (v_branch_ids))
      and (v_text_fks is null or ve.event_fk = any (v_text_fks))
      and (v_person_fks is null or ve.event_fk = any (v_person_fks))
      and (v_plate_fks is null or ve.event_fk = any (v_plate_fks))
      and (v_vehicle_fks is null or ve.event_fk = any (v_vehicle_fks))
      and (v_police_ids is null or ve.auto_id = any (v_police_ids))
      and (v_location_ids is null or ve.auto_id = any (v_location_ids))
    group by ve.event_fk
  ),
  vol as (
    select ve.auto_id, ve.event_fk, ve.event_date, btrim(ve.event_number) as event_number,
      btrim(ve.road_number) as road_number, btrim(ve.location) as location,
      ve.event_type, ve.branch_id, ve.actions_taken, ve.problems,
      lower(btrim(ve.call_sign)) as volunteer_sign,
      lower(btrim(ve.coordinator)) as coordinator_sign,
      concat_ws(' ', nullif(btrim(ve.call_sign), ''), nv.name) as volunteer,
      concat_ws(' ', nullif(btrim(ve.coordinator), ''), nc.name) as coordinator
    from legacy.vol_events ve
    join cand c on c.event_fk = ve.event_fk
    left join names nv on nv.sign = btrim(ve.call_sign)
    left join names nc on nc.sign = btrim(ve.coordinator)
  ),
  person as (
    select x.who
    from (select distinct p.who, p.sign
      from vol cross join lateral (values (vol.volunteer, vol.volunteer_sign), (vol.coordinator, vol.coordinator_sign)) as p(who, sign)
      offset 0) as x
    where v_has_person and x.who <> ''
      and ((cardinality(v_person_words) > 0 and public.smart_search_all_words_in(x.who, v_person_words))
        or x.sign = any (v_person_signs))
  ),
  car as (
    select vol.event_fk, btrim(ci.license_plate) as plate,
      v_plate is not null
        and regexp_replace(coalesce(ci.license_plate, ''), '\D', '', 'g') like '%' || v_plate || '%' as plate_hit,
      cardinality(v_vehicle_words) > 0 and 2 * (
        select count(*) from unnest(v_vehicle_words) as w where public.smart_search_word_in(ci.license_plate, w)
      ) >= cardinality(v_vehicle_words) as vehicle_hit,
      exists (select 1 from legacy.event_car_hits h
        where h.cars_in_hits_index = ci.auto_id and h.value) as damaged,
      v_hit_id is not null and exists (select 1 from legacy.event_car_hits h
        where h.cars_in_hits_index = ci.auto_id and h.value and h.hit_id = v_hit_id) as location_hit
    from vol
    join legacy.cars_in_hits ci on ci.event_fk = vol.auto_id
    where v_plate is not null or cardinality(v_vehicle_words) > 0 or v_damaged or v_hit_id is not null
      or cardinality(v_text_words) > 0
  ),
  car_per_event as (
    select car.event_fk,
      min(car.plate) filter (where car.plate_hit) as plate_hit,
      min(car.plate) filter (where car.vehicle_hit) as vehicle_hit,
      bool_or(car.damaged) as damaged,
      bool_or(car.location_hit) as location_hit,
      string_agg(concat_ws(E'\n', car.plate, regexp_replace(car.plate, '\D', '', 'g')), E'\n')
        filter (where cardinality(v_text_words) > 0) as text_hay
    from car
    group by car.event_fk
  ),
  per_event as (
    select vol.event_fk,
      min(vol.event_date) as event_date,
      min(vol.event_number) as event_number,
      min(nullif(vol.road_number, '')) as road_number,
      min(nullif(vol.location, '')) as location,
      min(vol.event_type) as event_type,
      min(vol.branch_id) as branch_id,
      min(case
        when v_person_role <> 'lead' and vol.volunteer in (select who from person) then 'כונן: ' || vol.volunteer
        when v_person_role <> 'responder' and vol.coordinator in (select who from person) then 'אחמ״ש: ' || vol.coordinator
      end) as person_hit,
      string_agg(concat_ws(E'\n', vol.event_number, vol.road_number, vol.location,
          vol.volunteer, vol.coordinator, vol.actions_taken, vol.problems), E'\n')
        filter (where cardinality(v_text_words) > 0) as text_hay
    from vol
    group by vol.event_fk
  ),
  matched as (
    select pe.*, c.location_hit, c.road_hit, cpe.plate_hit, cpe.vehicle_hit, cpe.damaged
    from per_event pe
    join cand c on c.event_fk = pe.event_fk
    left join car_per_event cpe on cpe.event_fk = pe.event_fk
    where (v_plate is null or cpe.plate_hit is not null)
      and (cardinality(v_vehicle_words) = 0 or cpe.vehicle_hit is not null)
      and (not v_has_person or pe.person_hit is not null)
      and (cardinality(v_text_words) = 0
        or public.smart_search_all_words_in(concat_ws(E'\n', pe.text_hay, cpe.text_hay), v_text_words))
      and (not v_damaged or cpe.damaged)
      and (v_hit_id is null or cpe.location_hit)
    order by pe.event_date desc nulls last, pe.event_fk
    limit v_limit
  ),
  matched_vol as (
    select vol.* from vol join matched m on m.event_fk = vol.event_fk
  ),
  people as (
    select mv.event_fk, string_agg(distinct mv.volunteer, ', ' order by mv.volunteer) as people
    from matched_vol mv
    where mv.volunteer <> ''
    group by mv.event_fk
  ),
  cars as (
    select mv.event_fk, string_agg(distinct btrim(ci.license_plate), ', ' order by btrim(ci.license_plate)) as cars
    from matched_vol mv
    join legacy.cars_in_hits ci on ci.event_fk = mv.auto_id
    where btrim(ci.license_plate) <> ''
    group by mv.event_fk
  ),
  actions as (
    select mv.event_fk,
      string_agg(distinct btrim(mv.actions_taken), ' | ' order by btrim(mv.actions_taken)) as actions
    from matched_vol mv
    where btrim(mv.actions_taken) <> ''
    group by mv.event_fk
  ),
  damage as (
    select x.event_fk, string_agg(v_hit_labels[x.hit_id], ', ' order by x.hit_id) as damage
    from (
      select distinct mv.event_fk, ech.hit_id
      from matched_vol mv
      join legacy.cars_in_hits ci on ci.event_fk = mv.auto_id
      join legacy.event_car_hits ech on ech.cars_in_hits_index = ci.auto_id
      where ech.value
    ) as x
    group by x.event_fk
  ),
  text_hit as (
    select distinct on (f.event_fk) f.event_fk, f.label as text_hit
    from (
      select mv.event_fk, 10 as ord, mv.auto_id as sub, 'מספר אירוע ' || mv.event_number as label,
        mv.event_number as hay
      from matched_vol mv
      union all
      select mv.event_fk, 20, ci.auto_id, 'לוחית ' || btrim(ci.license_plate),
        concat_ws(' ', ci.license_plate, regexp_replace(ci.license_plate, '\D', '', 'g'))
      from matched_vol mv
      join legacy.cars_in_hits ci on ci.event_fk = mv.auto_id
      union all
      select mv.event_fk, 30, mv.auto_id,
        case when mv.road_number ~ '^כביש' then mv.road_number else 'כביש ' || mv.road_number end,
        mv.road_number
      from matched_vol mv
      union all
      select mv.event_fk, 40, mv.auto_id, 'מיקום: ' || mv.location, mv.location
      from matched_vol mv
      union all
      select mv.event_fk, 50, mv.auto_id, 'אחמ״ש: ' || mv.coordinator, mv.coordinator
      from matched_vol mv
      union all
      select mv.event_fk, 52, mv.auto_id, 'כונן: ' || mv.volunteer, mv.volunteer
      from matched_vol mv
      union all
      select mv.event_fk, 60, mv.auto_id,
        'טיפול: ' || left(regexp_replace(legacy.mask_id_digits(b.body), '\s+', ' ', 'g'), 40), b.body
      from matched_vol mv
      cross join lateral (values (mv.actions_taken), (mv.problems)) as b(body)
    ) as f
    where cardinality(v_text_words) > 0 and btrim(f.hay) <> ''
      and exists (select 1 from unnest(v_text_words) as w where public.smart_search_word_in(f.hay, w))
    order by f.event_fk, f.ord, f.sub
  ),
  summary as (
    select m.*, p.people, c.cars, a.actions, d.damage, t.text_hit
    from matched m
    left join people p on p.event_fk = m.event_fk
    left join cars c on c.event_fk = m.event_fk
    left join actions a on a.event_fk = m.event_fk
    left join damage d on d.event_fk = m.event_fk
    left join text_hit t on t.event_fk = m.event_fk
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'event_fk', s.event_fk,
      'event_date', coalesce(to_char(s.event_date, 'YYYY-MM-DD'), ''),
      'event_number', coalesce(s.event_number, ''),
      'road', coalesce(s.road_number, ''),
      'location', coalesce(legacy.mask_id_digits(s.location), ''),
      'people', coalesce(s.people, ''),
      'cars', coalesce(legacy.mask_id_digits(s.cars), ''),
      'damage', coalesce(s.damage, ''),
      'actions', coalesce(legacy.mask_id_digits(s.actions), ''),
      'found_by', legacy.mask_id_digits(coalesce(
        case when v_plate is not null then 'לוחית ' || s.plate_hit end,
        case when v_police_id is not null then 'מספר אירוע ' || s.event_number end,
        s.person_hit,
        case when cardinality(v_vehicle_words) > 0 then 'רכב: ' || s.vehicle_hit end,
        s.text_hit,
        case when cardinality(v_location_words) > 0 then 'מיקום: ' || s.location_hit end,
        case when v_road is not null then
          case when s.road_hit ~ '^כביש' then s.road_hit else 'כביש ' || s.road_hit end
        end,
        case when v_hit_id is not null then 'נזק: ' || v_damage_location end,
        case when v_damaged then 'נזק: ' || s.damage end,
        case when v_type_ids is not null then 'סוג אירוע: ' || (
          select btrim(et.event_description) from legacy.event_types et where et.event_id = s.event_type) end,
        case when v_branch_ids is not null then 'מחוז: ' || (
          select btrim(b.branch_name) from legacy.branches b where b.branch_id = s.branch_id) end,
        'תאריך ' || to_char(s.event_date, 'DD.MM.YYYY')
      ))
    )
    order by s.event_date desc nulls last, s.event_fk
  ), '[]'::jsonb)
  into v_rows
  from summary s;

  return v_rows;
end;
$$;

-- Admins only. p_session set (the instant panel): one audit row per typing
-- session, updated to the latest lookup, so keystrokes do not flood the audit.
-- p_session null (the results page, export): one row per call, as before.
create or replace function public.app_search_archive(
  p_filter jsonb,
  p_session uuid default null,
  p_limit int default 200
)
returns jsonb
language plpgsql
security definer
set search_path = public, legacy
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_entity text := coalesce(public.smart_search_filter_string(p_filter, 'entity'), 'both');
  v_source text := coalesce(public.smart_search_filter_string(p_filter, 'source'), 'both');
  v_rows jsonb := '[]'::jsonb;
  v_fks text[];
  v_numbers text[];
begin
  if public.has_role(v_uid, 'super_admin') then
    v_role := 'super_admin';
  elsif public.has_role(v_uid, 'admin') then
    v_role := 'admin';
  else
    raise exception 'not authorized to read the legacy event archive' using errcode = '42501';
  end if;

  if v_entity = 'people' or v_source = 'new' then
    return jsonb_build_object('rows', '[]'::jsonb);
  end if;

  v_rows := legacy.archive_search(p_filter, p_limit);
  v_fks := array(select r ->> 'event_fk' from jsonb_array_elements(v_rows) with ordinality t(r, n) order by n);
  v_numbers := array(select r ->> 'event_number' from jsonb_array_elements(v_rows) with ordinality t(r, n) order by n);

  if p_session is null then
    insert into legacy.report_lookup_audit
      (actor_user_id, actor_role, search_kind, search_value, search_date,
       result_count, result_fks, result_event_numbers)
    values
      (v_uid, v_role, 'smart', legacy.mask_id_like(p_filter::text), null,
       jsonb_array_length(v_rows), v_fks, v_numbers);
  else
    insert into legacy.report_lookup_audit
      (actor_user_id, actor_role, search_kind, search_value, search_date,
       result_count, result_fks, result_event_numbers, search_session)
    values
      (v_uid, v_role, 'instant', legacy.mask_id_like(p_filter::text), null,
       jsonb_array_length(v_rows), v_fks, v_numbers, p_session)
    on conflict (actor_user_id, search_session) where search_session is not null do update
      set search_value = excluded.search_value,
          result_count = excluded.result_count,
          result_fks = excluded.result_fks,
          result_event_numbers = excluded.result_event_numbers,
          lookups = legacy.report_lookup_audit.lookups + 1;
  end if;

  return jsonb_build_object('rows', v_rows);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function public.app_search_log(text, jsonb, text, int, text) from public, anon;
revoke all on function public.app_search_strip_niqqud(text) from public, anon;
revoke all on function public.app_search_words(text) from public, anon;
revoke all on function public.app_search_like_escape(text) from public, anon;
revoke all on function public.app_search_filter_uuids(jsonb, text) from public, anon;
revoke all on function public.app_search_filter_texts(jsonb, text) from public, anon;
revoke all on function public.app_search(jsonb, text, int) from public, anon;
revoke all on function public.app_search_archive(jsonb, uuid, int) from public, anon;
revoke all on function legacy.archive_search(jsonb, int) from public, anon, authenticated;

grant execute on function public.app_search_log(text, jsonb, text, int, text) to authenticated;
grant execute on function public.app_search_strip_niqqud(text) to authenticated;
grant execute on function public.app_search_words(text) to authenticated;
grant execute on function public.app_search_like_escape(text) to authenticated;
grant execute on function public.app_search_filter_uuids(jsonb, text) to authenticated;
grant execute on function public.app_search_filter_texts(jsonb, text) to authenticated;
grant execute on function public.app_search(jsonb, text, int) to authenticated;
grant execute on function public.app_search_archive(jsonb, uuid, int) to authenticated;
