-- Legacy event-report archive (supabase/migrations/20261030120000_legacy_event_archive.sql).
-- Plain SQL, no pgTAP. Runs on a LOCAL database only, with fake rows only:
--   scripts/app-review-demo/test/run-local-db.sh scripts/legacy-archive/test/archive.sql
-- One transaction, rolled back at the end. Prints "ok N - ..." per check and
-- fails with a non-zero exit if any check fails.

\set QUIET on
\o /dev/null
set client_min_messages = notice;
begin;

create function pg_temp.ok(p_ok boolean, p_label text) returns void language plpgsql as $$
declare
  n int := coalesce(nullif(current_setting('test.n', true), ''), '0')::int + 1;
begin
  perform set_config('test.n', n::text, false);
  if p_ok is true then
    raise notice 'ok % - %', n, p_label;
  else
    perform set_config('test.failed',
      (coalesce(nullif(current_setting('test.failed', true), ''), '0')::int + 1)::text, false);
    raise warning 'not ok % - %', n, p_label;
  end if;
end
$$;

-- Passes when p_sql raises; p_state, when given, must match.
create function pg_temp.throws(p_sql text, p_state text, p_label text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    perform pg_temp.ok(p_state is null or sqlstate = p_state,
      case when p_state is null or sqlstate = p_state
        then p_label else format('%s (got %s: %s)', p_label, sqlstate, sqlerrm) end);
    return;
  end;
  perform pg_temp.ok(false, p_label || ' (no error raised)');
end
$$;

create function pg_temp.act_as(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

-- ---------------------------------------------------------------------------
-- Re-run: the deploy workflow applies the migration on every run.
-- ---------------------------------------------------------------------------

\o
\ir ../../../supabase/migrations/20261030120000_legacy_event_archive.sql
\o /dev/null
select pg_temp.ok(true, 'migration re-runs on top of itself');

-- ---------------------------------------------------------------------------
-- Fake fixtures, written as postgres (no JWT, RLS bypassed).
--   R responder · L shift lead · A admin · S super admin · N no role
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('c0000000-0000-4000-8000-000000000001', 'r@legacy.local', '{"full_name":"מתנדב בדיקה","callsign":"T-R"}'),
  ('c0000000-0000-4000-8000-000000000002', 'l@legacy.local', '{"full_name":"אחמש בדיקה","callsign":"T-L"}'),
  ('c0000000-0000-4000-8000-000000000003', 'a@legacy.local', '{"full_name":"מנהל בדיקה","callsign":"T-A"}'),
  ('c0000000-0000-4000-8000-000000000004', 's@legacy.local', '{"full_name":"מנהל על בדיקה","callsign":"T-S"}'),
  ('c0000000-0000-4000-8000-000000000005', 'n@legacy.local', '{"full_name":"בלי תפקיד","callsign":"T-N"}');
insert into public.user_roles (user_id, role) values
  ('c0000000-0000-4000-8000-000000000001', 'responder'),
  ('c0000000-0000-4000-8000-000000000002', 'shift_lead'),
  ('c0000000-0000-4000-8000-000000000003', 'admin'),
  ('c0000000-0000-4000-8000-000000000004', 'super_admin');

insert into legacy.users (call_sign, first_name, last_name) values
  ('000', 'בדיקה', 'אחת'), ('001', 'בדיקה', 'שתיים');
insert into legacy.user_details (users_fk, pid) values ('000', '000000018'), ('001', '  ');
insert into legacy.branches (branch_id, branch_name) values (1, 'סניף בדיקה');
insert into legacy.event_types (event_id, event_description) values (1, 'אירוע בדיקה');
insert into legacy.vol_events (auto_id, event_fk, event_number, call_sign, event_date, branch_id, event_type, location) values
  (1, 'T-FK-1', '9001', '000', '2024-01-02 10:00', 1, 1, 'מקום בדיקה'),
  (2, 'T-FK-2', '9002', '000', '2023-05-06 08:00', 1, 1, 'מקום בדיקה'),
  (3, 'T-FK-3', '9003', '001', '2024-01-02 11:00', 1, 1, 'מקום בדיקה');
insert into legacy.cars_in_hits (auto_id, event_fk, car_index, license_plate) values (10, 1, 1, 'רכב בדיקה');
insert into legacy.event_car_hits (cars_in_hits_index, hit_id, value) values (10, 3, true), (10, 4, false);

-- ---------------------------------------------------------------------------
-- Structure
-- ---------------------------------------------------------------------------

select pg_temp.ok(count(*) = 7 and bool_and(c.relrowsecurity),
  'every legacy table has RLS on')
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'legacy' and c.relkind = 'r';
select pg_temp.ok(count(*) = 0, 'no RLS policy on any legacy table (deny-all)')
from pg_policies where schemaname = 'legacy';

-- ---------------------------------------------------------------------------
-- Grants (Supabase's default privileges grant new public functions to anon)
-- ---------------------------------------------------------------------------

select pg_temp.ok(not has_function_privilege('anon', 'public.legacy_report_search(text,text,date)', 'execute'),
  'anon cannot execute the RPC');
select pg_temp.ok(not exists (
    select 1 from pg_proc p, aclexplode(p.proacl) a
    where p.oid = 'public.legacy_report_search(text,text,date)'::regprocedure and a.grantee = 0),
  'PUBLIC cannot execute the RPC');
select pg_temp.ok(has_function_privilege('authenticated', 'public.legacy_report_search(text,text,date)', 'execute'),
  'authenticated can execute the RPC (the role check is inside)');
select pg_temp.ok(not has_schema_privilege('anon', 'legacy', 'usage')
    and not has_schema_privilege('authenticated', 'legacy', 'usage'),
  'anon and authenticated have no USAGE on the legacy schema');
select pg_temp.ok(not has_function_privilege('authenticated', 'legacy.build_report(integer)', 'execute')
    and not has_function_privilege('anon', 'legacy.build_report(integer)', 'execute'),
  'nobody but the owner executes legacy.build_report');

set local role anon;
select pg_temp.throws($$select * from public.legacy_report_search('callsign_list', '000')$$, '42501',
  'anon: refused before the function body runs');
reset role;

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

set local role authenticated;

select pg_temp.act_as('c0000000-0000-4000-8000-000000000003');
select pg_temp.ok(count(*) = 2, 'admin: call sign list finds both events')
from public.legacy_report_search('callsign_list', '000');
select pg_temp.ok(array_agg(r ->> 'fk') = array['T-FK-2', 'T-FK-1'], 'admin: call sign list is sorted by date')
from public.legacy_report_search('callsign_list', '000') r;
select pg_temp.ok(count(*) = 1, 'admin: lookup by report id')
from public.legacy_report_search('id', 'T-FK-3');
select pg_temp.ok(count(*) = 1, 'admin: lookup by call sign and date')
from public.legacy_report_search('callsign_date', '000', '2024-01-02');
select pg_temp.ok((select r -> 'hits' from public.legacy_report_search('id', 'T-FK-1') r) = '[[1, 3]]'::jsonb,
  'admin: only checked hits are returned');

select pg_temp.act_as('c0000000-0000-4000-8000-000000000004');
select pg_temp.ok(count(*) = 1, 'super admin: lookup by event number')
from public.legacy_report_search('report', '9002');

-- ---------------------------------------------------------------------------
-- ID masking: the RPC never returns a full ת.ז.
-- ---------------------------------------------------------------------------

select pg_temp.ok(bool_and(r -> 'header' ->> 'pid' = '******018'), 'pid is masked to its last 3 digits')
from public.legacy_report_search('callsign_list', '000') r;
select pg_temp.ok(bool_and(position('000000018' in r::text) = 0), 'the full ID appears nowhere in the payload')
from public.legacy_report_search('callsign_list', '000') r;
select pg_temp.ok((select r -> 'header' -> 'pid' from public.legacy_report_search('id', 'T-FK-3') r) = 'null'::jsonb,
  'a blank ID comes back as null');

select pg_temp.act_as('c0000000-0000-4000-8000-000000000001');
select pg_temp.throws($$select * from public.legacy_report_search('callsign_list', '000')$$, '42501',
  'responder: refused');
select pg_temp.act_as('c0000000-0000-4000-8000-000000000002');
select pg_temp.throws($$select * from public.legacy_report_search('callsign_list', '000')$$, '42501',
  'shift lead: refused');
select pg_temp.act_as('c0000000-0000-4000-8000-000000000005');
select pg_temp.throws($$select * from public.legacy_report_search('callsign_list', '000')$$, '42501',
  'member with no role: refused');
select pg_temp.act_as('c0000000-0000-4000-8000-000000000003');
select pg_temp.throws($$select * from legacy.vol_events$$, '42501',
  'admin: legacy tables are not readable directly');

reset role;

do $$
begin
  if coalesce(nullif(current_setting('test.failed', true), ''), '0')::int > 0 then
    raise exception '% of % checks failed', current_setting('test.failed'), current_setting('test.n');
  end if;
  raise notice 'all % checks passed', current_setting('test.n');
end
$$;

rollback;
