-- Verifies supabase/migrations/20261101120000_admin_smart_search.sql against
-- REAL data, read-only. Run only with Omri's go-ahead, after the migration:
--
--   supabase db query --linked --project-ref rtvizpsfvtjowbimugns \
--     -f scripts/smart-search/verify-admin-search.sql
--
-- Expected: every row has ok = t.
--
-- Nothing is written. Samples (an admin, a non-admin, a plate, a name, a car
-- make) are picked from real rows as postgres, then every check runs as
-- `authenticated` with that user's JWT claims, so RLS applies as in the app.
-- Results go to a temp table dropped at commit. `db query --linked` prints
-- only the last statement's rows, so the results SELECT is last and there is
-- no trailing rollback: the transaction ends with the session, and has
-- nothing to keep. The log RPCs, which do write, are covered by the local
-- fixture test instead.

begin;

create temp table verify_results (n serial, ok boolean, check_name text) on commit drop;
grant all on verify_results to authenticated;
grant all on sequence verify_results_n_seq to authenticated;

create function pg_temp.ok(p_ok boolean, p_name text) returns void language sql as $$
  insert into verify_results (ok, check_name) values (coalesce(p_ok, false), p_name);
$$;

create function pg_temp.act_as(p_setting text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', current_setting(p_setting), 'role', 'authenticated')::text, true);
$$;

-- Event ids admin_search returns for a filter (CSV cap, so nothing is cut off).
create function pg_temp.event_ids(p jsonb) returns text[] language sql as $$
  select coalesce(array_agg(x ->> 'id'), '{}')
  from jsonb_array_elements(public.admin_search(p, 5000) -> 'events') as x;
$$;

-- ---------------------------------------------------------------------------
-- Samples, picked as postgres (no RLS). Empty string when none exists.
-- ---------------------------------------------------------------------------

select set_config('verify.admin', coalesce((
  select ur.user_id::text from public.user_roles ur
  join public.profiles p on p.id = ur.user_id
  where ur.role = 'admin' and not p.is_app_review_demo
  order by ur.user_id limit 1), ''), true);

select set_config('verify.responder', coalesce((
  select p.id::text from public.profiles p
  where not p.is_app_review_demo
    and not exists (select 1 from public.user_roles ur
      where ur.user_id = p.id and ur.role in ('admin', 'super_admin'))
  order by p.id limit 1), ''), true);

-- A plate on a real, non-cancelled event, and that event.
select set_config('verify.plate4', coalesce(right(s.plate_digits, 4), ''), true),
       set_config('verify.plate_event', coalesce(s.event_id::text, ''), true)
from (select null) as dummy
left join lateral (
  select tp.plate_digits, coalesce(tp.event_id, er.event_id) as event_id
  from public.event_treated_plates tp
  left join public.event_responders er on er.id = tp.event_responder_id
  join public.events e on e.id = coalesce(tp.event_id, er.event_id)
  where not e.is_demo and not e.is_cancelled and length(tp.plate_digits) >= 4
  order by e.event_date desc limit 1
) as s on true;

-- The rarest Hebrew first name of 3+ letters, and one person who has it.
select set_config('verify.first_name', coalesce(s.first_name, ''), true),
       set_config('verify.person', coalesce(s.id::text, ''), true)
from (select null) as dummy
left join lateral (
  select split_part(p.full_name, ' ', 1) as first_name, min(p.id::text)::uuid as id
  from public.profiles p
  where not p.is_app_review_demo and split_part(p.full_name, ' ', 1) ~ '^[א-ת]{3,}$'
  group by 1 order by count(*), 1 limit 1
) as s on true;

-- A Hebrew car make from a real plate (סוזוקי of סוזוקי יפן).
select set_config('verify.make', coalesce((
  select split_part(tp.manufacturer, ' ', 1) from public.event_treated_plates tp
  where split_part(tp.manufacturer, ' ', 1) ~ '^[א-ת]{3,}$'
  group by 1 order by count(*) desc limit 1), ''), true);

-- Road 531 this year, counted by hand (the same rules: no demo, no cancelled).
select set_config('verify.road_count', (
  select count(*)::text from public.events e
  join public.roads r on r.id = e.road_id
  where r.name ilike '%531%' and not e.is_demo and not e.is_cancelled
    and e.event_date between date '2026-01-01' and (now() at time zone 'Asia/Jerusalem')::date), true);

select pg_temp.ok(current_setting('verify.admin') <> '', 'sample: an admin exists');
select pg_temp.ok(current_setting('verify.responder') <> '', 'sample: a non-admin exists');
select pg_temp.ok(current_setting('verify.plate4') <> '', 'sample: a real plate exists');
select pg_temp.ok(current_setting('verify.first_name') <> '', 'sample: a Hebrew first name exists');
select pg_temp.ok(current_setting('verify.make') <> '', 'sample: a Hebrew car make exists');

-- ---------------------------------------------------------------------------
-- Words and grants
-- ---------------------------------------------------------------------------

select pg_temp.ok('סוזוקי' = any (public.smart_search_word_variants('בסוזוקי')), 'variants: בסוזוקי contains סוזוקי');
select pg_temp.ok(public.smart_search_word_variants('בית') = '{בית}', 'variants: בית is {בית}');
select pg_temp.ok(not has_function_privilege('anon', 'public.admin_search(jsonb,int)', 'execute'), 'grants: anon cannot run admin_search');
select pg_temp.ok(has_function_privilege('authenticated', 'public.admin_search(jsonb,int)', 'execute'), 'grants: authenticated can run admin_search');
select pg_temp.ok(not has_function_privilege('anon', 'public.log_smart_search(text,jsonb,text,int)', 'execute'), 'grants: anon cannot log');
select pg_temp.ok(not has_table_privilege('authenticated', 'public.smart_search_log', 'insert'), 'grants: no client insert into the log');

-- ---------------------------------------------------------------------------
-- Non-admin: empty arrays (Review Focus 5)
-- ---------------------------------------------------------------------------

set local role authenticated;

select pg_temp.act_as('verify.responder');
select pg_temp.ok(public.admin_search(jsonb_build_object('text', current_setting('verify.plate4')))
  = '{"events":[],"people":[]}', 'non-admin: plate search returns empty arrays');
select pg_temp.ok(public.admin_search('{"road":"531"}') = '{"events":[],"people":[]}', 'non-admin: road search returns empty arrays');
select pg_temp.ok((select count(*) from public.smart_search_log) = 0, 'non-admin: cannot read the log');

-- ---------------------------------------------------------------------------
-- Admin
-- ---------------------------------------------------------------------------

select pg_temp.act_as('verify.admin');

select pg_temp.ok(current_setting('verify.plate_event') = any (
    pg_temp.event_ids(jsonb_build_object('text', current_setting('verify.plate4')))),
  'direct lane: the last 4 plate digits find that event');

select pg_temp.ok(jsonb_array_length(public.admin_search(jsonb_build_object(
    'road', '531', 'date_from', '2026-01-01',
    'date_to', (now() at time zone 'Asia/Jerusalem')::date::text), 5000) -> 'events')
    = current_setting('verify.road_count')::int,
  'road 531 this year matches the hand count (' || current_setting('verify.road_count') || ')');

select pg_temp.ok(exists (
    select 1 from jsonb_array_elements(public.admin_search(jsonb_build_object(
      'entity', 'people', 'person', 'ל' || current_setting('verify.first_name'))) -> 'people') as p
    where p ->> 'id' = current_setting('verify.person')),
  'people: ל + a real first name finds the person');

-- Review Focus 1: a prefixed word finds at least what the bare word finds.
select pg_temp.ok(
    pg_temp.event_ids(jsonb_build_object('text', current_setting('verify.make')))
      <@ pg_temp.event_ids(jsonb_build_object('text', 'ב' || current_setting('verify.make')))
    and cardinality(pg_temp.event_ids(jsonb_build_object('text', current_setting('verify.make')))) > 0,
  'direct lane: ב + a car make finds every event the bare make finds');

select pg_temp.ok(not exists (
    select 1 from unnest(pg_temp.event_ids('{}')) as x(event_id)
    join public.events e on e.id = x.event_id::uuid
    where e.is_demo or e.is_cancelled),
  'no demo or cancelled event comes back by default');

-- Speed of a direct-lane call (the plan's bar is 300 ms).
do $$
declare
  t0 timestamptz := clock_timestamp();
  ms int;
begin
  perform public.admin_search(jsonb_build_object('text', current_setting('verify.plate4')));
  ms := round(extract(epoch from clock_timestamp() - t0) * 1000);
  perform pg_temp.ok(ms < 300, 'direct lane plate search took ' || ms || ' ms (< 300)');
end
$$;

reset role;

select n, ok, check_name from verify_results order by n;
