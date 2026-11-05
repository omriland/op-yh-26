-- Admin smart search over the old-site event archive (legacy.*).
--
-- admin_search_archive takes the same filter as admin_search and returns one
-- summary row per old report (event_fk). legacy.vol_events has one row per
-- volunteer, so rows are grouped by event_fk.
--
-- Security: the legacy schema is reachable only through security definer
-- functions, so this one runs as owner and gates on admin / super_admin like
-- legacy_report_search. It never reads the ID-number table, and free text
-- that leaves it (location, cars, actions, found_by) has any run of 9+ digits masked.
-- Every allowed call writes one legacy.report_lookup_audit row (search_kind
-- 'smart'), except a new-only or people-only filter, which never reaches the
-- archive.
--
-- p_filter comes from the browser and is treated as untrusted: wrong JSON
-- types are ignored, ilike wildcards are escaped (the smart_search_* helpers
-- from 20261101120000_admin_smart_search.sql).
--
-- Re-runnable: the Deploy Edge Functions workflow applies it on every run.

-- An Israeli ID number has 9 digits and a plate 7 or 8, so a run of 9+ digits
-- in old free text (a driver's ID typed into the actions) keeps its last 3.
create or replace function legacy.mask_id_digits(p_value text)
returns text
language sql
immutable
as $$
  select regexp_replace(p_value, '[0-9]{6,}([0-9]{3})', '******\1', 'g');
$$;

-- The text admin_search_archive's prefilter looks words up in: the columns its
-- matching reads, joined by newlines, with quotes dropped and lowercased like
-- the haystack of smart_search_word_in. Trigram indexes on them let a word
-- find its rows and cars without scanning the archive, which is static
-- imported data. Changing either function's body needs a reindex.
create extension if not exists pg_trgm with schema extensions;

create or replace function legacy.archive_event_text(p_event_number text, p_road_number text,
  p_location text, p_call_sign text, p_coordinator text, p_actions_taken text, p_problems text)
returns text
language sql
immutable
as $$
  select lower(translate(coalesce(p_event_number, '') || E'\n' || coalesce(p_road_number, '')
    || E'\n' || coalesce(p_location, '') || E'\n' || coalesce(p_call_sign, '')
    || E'\n' || coalesce(p_coordinator, '') || E'\n' || coalesce(p_actions_taken, '')
    || E'\n' || coalesce(p_problems, ''), '״"׳''', ''));
$$;

-- A car's text and its digits, so 12-345-67 is found by 1234567.
create or replace function legacy.archive_car_text(p_license_plate text)
returns text
language sql
immutable
as $$
  select lower(translate(coalesce(p_license_plate, '') || E'\n'
    || regexp_replace(coalesce(p_license_plate, ''), '\D', '', 'g'), '״"׳''', ''));
$$;

create index if not exists vol_events_search_trgm_idx on legacy.vol_events using gin (
  legacy.archive_event_text(event_number, road_number, location, call_sign, coordinator, actions_taken, problems)
  extensions.gin_trgm_ops);
create index if not exists cars_in_hits_search_trgm_idx on legacy.cars_in_hits using gin (
  legacy.archive_car_text(license_plate) extensions.gin_trgm_ops);

create or replace function public.admin_search_archive(p_filter jsonb, p_limit int default 200)
returns jsonb
language plpgsql
security definer
set search_path = public, legacy
-- One query serves every filter shape; a cached generic plan cannot drop the
-- branches of the keys that are not set, so plan each call for its filter.
set plan_cache_mode = force_custom_plan
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_limit int := greatest(1, least(coalesce(p_limit, 200), 5000));
  v_entity text := coalesce(public.smart_search_filter_string(p_filter, 'entity'), 'both');
  v_source text := coalesce(public.smart_search_filter_string(p_filter, 'source'), 'both');
  v_from date := public.smart_search_filter_date(p_filter, 'date_from');
  v_to date := public.smart_search_filter_date(p_filter, 'date_to');
  v_police_id text := public.smart_search_filter_string(p_filter, 'police_event_id');
  v_road text := public.smart_search_filter_string(p_filter, 'road');
  v_event_type text := public.smart_search_filter_string(p_filter, 'event_type');
  v_district text := public.smart_search_filter_string(p_filter, 'district');
  v_damage_location text := public.smart_search_filter_string(p_filter, 'damage_location');
  v_plate text := nullif(
    regexp_replace(coalesce(public.smart_search_filter_string(p_filter, 'plate'), ''), '\D', '', 'g'), '');
  v_location_words text[] := public.smart_search_words(public.smart_search_filter_string(p_filter, 'location_text'));
  v_vehicle_words text[] := public.smart_search_words(public.smart_search_filter_string(p_filter, 'vehicle_text'));
  v_person_words text[] := public.smart_search_words(public.smart_search_filter_string(p_filter, 'person'));
  v_text_words text[] := public.smart_search_words(public.smart_search_filter_string(p_filter, 'text'));
  -- The coordinator is the old report's lead; call_sign is the volunteer.
  v_person_role text := coalesce(public.smart_search_filter_string(p_filter, 'person_role'), 'any');
  v_damaged boolean := coalesce(p_filter -> 'damaged' = 'true'::jsonb, false);
  v_type_ids int[];
  v_branch_ids int[];
  -- HIT_TYPES (src/lib/reports/legacyReport.ts): hit_id is the 1-based place
  -- of the label. An unknown damage_location label is ignored.
  v_hit_labels constant text[] := array(
    select h.label from (values
      (1, 'פגוש קדמי'),
      (2, 'כנף ימין קדמית'),
      (3, 'כנף שמאל קדמית'),
      (4, 'דלת נהג'),
      (5, 'דלת נוסע'),
      (6, 'דלת אחורית שמאלית'),
      (7, 'דלת אחורית ימנית'),
      (8, 'כנף אחורית ימנית'),
      (9, 'כנף אחורית שמאלית'),
      (10, 'תא מטען'),
      (11, 'פגוש אחורי'),
      (12, 'גג'),
      (13, 'שמשה קדמית'),
      (14, 'שמשה אחורית'),
      (15, 'מרכב תחתון'),
      (16, 'גלגלים'),
      (17, 'מכסה מנוע')
    ) as h(hit_id, label)
    order by h.hit_id);
  v_hit_id int := array_position(v_hit_labels, v_damage_location);
  v_has_key boolean;
  -- Prefilter (see below). The events each costly key can match, or for
  -- police_event_id and location_text the volunteer rows; null: key not set.
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
  if public.has_role(v_uid, 'super_admin') then
    v_role := 'super_admin';
  elsif public.has_role(v_uid, 'admin') then
    v_role := 'admin';
  else
    raise exception 'not authorized to read the legacy event archive' using errcode = '42501';
  end if;

  -- The archive holds events only, and none of them are new.
  if v_entity = 'people' or v_source = 'new' then
    return jsonb_build_object('rows', '[]'::jsonb);
  end if;

  -- A text, location_text or vehicle_text word of 1–2 characters (quotes
  -- dropped, as smart_search_word_variants does) is ignored: it hits much of
  -- the archive and no trigram index helps, so it took 3–21 s. A key of only
  -- such words is unset, and with no other key there are no rows. person keeps
  -- them: short names are common and stayed under 3 s.
  v_text_words := array(select w from unnest(v_text_words) as w
    where char_length(translate(w, '״"׳''', '')) >= 3);
  v_location_words := array(select w from unnest(v_location_words) as w
    where char_length(translate(w, '״"׳''', '')) >= 3);
  v_vehicle_words := array(select w from unnest(v_vehicle_words) as w
    where char_length(translate(w, '״"׳''', '')) >= 3);

  -- An event type that names no old event type is ignored, like district.
  if v_event_type is not null then
    select array_agg(et.event_id) into v_type_ids
    from legacy.event_types et
    where public.smart_search_all_words_in(et.event_description, public.smart_search_words(v_event_type));
  end if;

  -- A district that names no old branch is ignored.
  if v_district is not null then
    select array_agg(b.branch_id) into v_branch_ids
    from legacy.branches b
    where public.smart_search_all_words_in(b.branch_name, public.smart_search_words(v_district));
  end if;

  -- Without one of these keys a filter does not narrow the archive ({} or a
  -- status-only filter), so no rows are returned. The lookup is still audited.
  -- event_type and district count only when they name an old type or branch.
  v_has_key := v_from is not null or v_to is not null
    or v_police_id is not null or v_road is not null or cardinality(v_location_words) > 0
    or v_type_ids is not null or v_branch_ids is not null
    or v_plate is not null or cardinality(v_vehicle_words) > 0
    or cardinality(v_person_words) > 0 or cardinality(v_text_words) > 0
    or v_damaged or v_hit_id is not null;

  if v_has_key then
    -- Prefilter. text, person, plate and vehicle_text are judged below per
    -- event, over text built from every row, name and car of the event, and
    -- each smart_search_* call costs a fraction of a millisecond, so on the
    -- whole archive (64k rows, 215k cars) that took 20 s or more. So first,
    -- per word, the trigram indexes on legacy.archive_event_text and
    -- legacy.archive_car_text find the rows and cars the word can hit, and
    -- legacy.users the call signs whose name it can hit:
    -- - Those texts are the raw columns joined by newlines, quotes dropped and
    --   lowercased, like the haystack of smart_search_word_in, which ilikes
    --   the word and its variants. A word has no whitespace, so it cannot
    --   span two columns.
    -- - A pattern has no escape character (like_escape(…, '')), so % or _ in
    --   a word only widens it.
    -- So these sets are a superset of the matches. They only narrow the
    -- candidates; the matching below is unchanged and still decides.
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
      -- Every word must hit the event.
      v_text_fks := case when v_text_fks is null then v_fks
        else array(select unnest(v_text_fks) intersect select unnest(v_fks)) end;
    end loop;

    -- person: rows whose call signs or names hold every word.
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
    if v_person_ids is not null then
      v_person_fks := array(select distinct ve.event_fk from legacy.vol_events ve
        where ve.auto_id = any (v_person_ids));
    end if;

    -- location_text: rows whose text holds every word.
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
      -- v_plate is digits only, so it needs no escaping.
      v_plate_fks := array(select distinct ve.event_fk from legacy.cars_in_hits ci
        join legacy.vol_events ve on ve.auto_id = ci.event_fk
        where legacy.archive_car_text(ci.license_plate) like '%' || v_plate || '%'
          and regexp_replace(coalesce(ci.license_plate, ''), '\D', '', 'g') like '%' || v_plate || '%');
    end if;

    -- vehicle_text: cars that some word hits (the match below needs half).
    foreach v_word in array v_vehicle_words loop
      v_pats := array(select like_escape('%' || v.v || '%', '')
        from unnest(public.smart_search_word_variants(v_word)) as v(v) where v.v <> '');
      v_vehicle_fks := array(select unnest(v_vehicle_fks) union
        select ve.event_fk from legacy.cars_in_hits ci
        join legacy.vol_events ve on ve.auto_id = ci.event_fk
        where legacy.archive_car_text(ci.license_plate) like any (v_pats));
    end loop;

    with names as (
      -- "first last" per old call sign, for volunteers and coordinators.
      select distinct on (btrim(u.call_sign)) btrim(u.call_sign) as sign,
        btrim(u.first_name) || ' ' || btrim(u.last_name) as name
      from legacy.users u
      order by btrim(u.call_sign)
    ),
    cand as (
      -- Events with a volunteer row matching the keys that describe the event
      -- itself. Each old row is one volunteer's report (its own road, place
      -- and cars), so everything after this uses every row of these events.
      select ve.event_fk,
        min(btrim(ve.location)) filter (where btrim(ve.location) <> '') as location_hit,
        min(btrim(ve.road_number)) filter (where btrim(ve.road_number) <> '') as road_hit
      from legacy.vol_events ve
      where (v_from is null or ve.event_date::date >= v_from)
        and (v_to is null or ve.event_date::date <= v_to)
        and (v_police_id is null or public.smart_search_word_in(btrim(ve.event_number), v_police_id))
        -- A numeric road matches as a whole number: 4 is road 4, not 40 or 431.
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
      -- Every volunteer row of the candidate events.
      select ve.auto_id, ve.event_fk, ve.event_date, btrim(ve.event_number) as event_number,
        btrim(ve.road_number) as road_number, btrim(ve.location) as location,
        ve.event_type, ve.branch_id, ve.actions_taken, ve.problems,
        concat_ws(' ', nullif(btrim(ve.call_sign), ''), nv.name) as volunteer,
        concat_ws(' ', nullif(btrim(ve.coordinator), ''), nc.name) as coordinator
      from legacy.vol_events ve
      join cand c on c.event_fk = ve.event_fk
      left join names nv on nv.sign = btrim(ve.call_sign)
      left join names nc on nc.sign = btrim(ve.coordinator)
    ),
    person as (
      -- Every person word must match the same volunteer or coordinator, so
      -- each distinct "call sign name" is matched once, not once per row.
      select x.who
      -- offset 0 keeps the planner from pushing the match below the distinct.
      from (select distinct p.who from vol cross join lateral (values (vol.volunteer), (vol.coordinator)) as p(who)
        offset 0) as x
      where cardinality(v_person_words) > 0 and x.who <> ''
        and public.smart_search_all_words_in(x.who, v_person_words)
    ),
    car as (
      -- Only when a car key or text is set.
      select vol.event_fk, btrim(ci.license_plate) as plate,
        v_plate is not null
          and regexp_replace(coalesce(ci.license_plate, ''), '\D', '', 'g') like '%' || v_plate || '%' as plate_hit,
        -- vehicle_text carries Hebrew and Latin spellings of the same car, and
        -- the old free text holds one of them, so half the words must match.
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
        -- text also finds a plate by its digits (12-345-67 typed with dashes).
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
        -- What text searches besides the plates: like admin_search, the event
        -- number, road, place, people and treatment text.
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
        and (cardinality(v_person_words) = 0 or pe.person_hit is not null)
        -- Every text word must match some field. Fields are joined by a
        -- newline, so a word (which has no whitespace) cannot span two.
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
      -- The archive CSV's פעולות שבוצעו column.
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
      -- found_by for text: the first field holding a text word, in
      -- admin_search's field order.
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
        -- Old road numbers are mostly bare digits, some already say כביש.
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
  end if;

  insert into legacy.report_lookup_audit
    (actor_user_id, actor_role, search_kind, search_value, search_date,
     result_count, result_fks, result_event_numbers)
  values
    (v_uid, v_role, 'smart', legacy.mask_id_like(p_filter::text), null,
     jsonb_array_length(v_rows),
     array(select r ->> 'event_fk' from jsonb_array_elements(v_rows) with ordinality t(r, n) order by n),
     array(select r ->> 'event_number' from jsonb_array_elements(v_rows) with ordinality t(r, n) order by n));

  return jsonb_build_object('rows', v_rows);
end;
$$;

-- Supabase's default privileges grant every new public function to anon, so a
-- revoke from public alone leaves anon able to call it.
revoke all on function public.admin_search_archive(jsonb, int) from public, anon;
grant execute on function public.admin_search_archive(jsonb, int) to authenticated;

-- Internal: only the definer function (as owner) uses them.
revoke all on function legacy.mask_id_digits(text) from public, anon, authenticated;
revoke all on function legacy.archive_event_text(text, text, text, text, text, text, text)
  from public, anon, authenticated;
revoke all on function legacy.archive_car_text(text) from public, anon, authenticated;
