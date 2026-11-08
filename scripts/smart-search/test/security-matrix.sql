-- Search security matrix (20261108150000_app_search.sql): each role finds a row
-- it can open and does not find one it cannot. LOCAL database only:
--   scripts/app-review-demo/test/run-local-db.sh scripts/smart-search/test/security-matrix.sql
--
-- Admin impersonation signs in as the target (admin-users: generateLink then
-- verifyOtp), so the JWT sub is the target and search runs as them. act_as
-- below sets the same sub, which is what the impersonation rows exercise.

\set QUIET on
\o /dev/null
set client_min_messages = notice;
begin;

create or replace function public.prelaunch_launch_at()
returns timestamptz language sql stable as $$ select timestamptz '2000-01-01 00:00:00+00' $$;

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

create function pg_temp.act_as(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

-- Event ids app_search returns for this filter.
create function pg_temp.event_ids(p_filter jsonb) returns uuid[] language sql as $$
  select coalesce(array_agg((e ->> 'id')::uuid), '{}')
  from jsonb_array_elements(public.app_search(p_filter) -> 'events') as e
$$;

create function pg_temp.people(p_filter jsonb) returns jsonb language sql as $$
  select public.app_search(p_filter) -> 'people'
$$;

create function pg_temp.person_ids(p_filter jsonb) returns uuid[] language sql as $$
  select coalesce(array_agg((p ->> 'id')::uuid), '{}')
  from jsonb_array_elements(public.app_search(p_filter) -> 'people') as p
$$;

create function pg_temp.archive_denied(p_filter jsonb) returns boolean language plpgsql as $$
begin
  perform public.app_search_archive(p_filter);
  return false;
exception when insufficient_privilege then
  return true;
end
$$;

create function pg_temp.archive_fks(p_filter jsonb, p_session uuid default null) returns text[] language sql as $$
  select coalesce(array_agg(r ->> 'event_fk'), '{}')
  from jsonb_array_elements(public.app_search_archive(p_filter, p_session) -> 'rows') as r
$$;

-- ---------------------------------------------------------------------------
-- Fixtures, written as postgres (RLS bypassed).
--   A admin · L shift lead · R1 R2 responders · X responder on nothing
--   S a stranger to R1 (on no shared event), with a phone and email
--   ED a טיוטה with R1 and R2 · E1 released with R1 and R2 · E2 released with S only
--   DEMO a demo event
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-4000-8000-00000000000a', 'a@test.local',  '{"full_name":"מנהלת בדיקה","callsign":"T900"}'),
  ('10000000-0000-4000-8000-00000000000b', 'l@test.local',  '{"full_name":"רונית אחמשית","callsign":"T800"}'),
  ('11111111-1111-4111-8111-111111111111', 'r1@test.local', '{"full_name":"יוסי לוי","callsign":"T411"}'),
  ('22222222-2222-4222-8222-222222222222', 'r2@test.local', '{"full_name":"דנה ברק","callsign":"T412"}'),
  ('29292929-2929-4292-8292-292929292929', 'x@test.local',  '{"full_name":"עמית זר","callsign":"T413"}'),
  ('55555555-5555-4555-8555-555555555555', 's@test.local',  '{"full_name":"שירה נסתרת","callsign":"T777"}');
insert into public.user_roles (user_id, role) values
  ('a0000000-0000-4000-8000-00000000000a', 'admin'),
  ('10000000-0000-4000-8000-00000000000b', 'shift_lead'),
  ('11111111-1111-4111-8111-111111111111', 'responder'),
  ('22222222-2222-4222-8222-222222222222', 'responder'),
  ('29292929-2929-4292-8292-292929292929', 'responder'),
  ('55555555-5555-4555-8555-555555555555', 'responder');
update public.profiles set phone = '050-7654321' where id = '55555555-5555-4555-8555-555555555555';
update public.profiles set phone = '050-1111111' where id = '22222222-2222-4222-8222-222222222222';
update public.profiles set volunteer_status = 'phone_training' where id = '29292929-2929-4292-8292-292929292929';

insert into public.event_types (id, name) values ('7e7e7e7e-7e7e-47e7-87e7-7e7e7e7e7e7e', 'תקוע');
insert into public.roads (id, name) values ('70707070-7070-4707-8707-707070707070', 'כביש 6');

insert into public.events (id, shift_lead_id, police_event_id, road_id, patrol_callsign_number, status, event_date) values
  ('ed000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-00000000000b', '9001',
   '70707070-7070-4707-8707-707070707070', '411', 'in_progress', date '2026-11-05');
insert into public.events (id, shift_lead_id, police_event_id, event_type_id, road_id, patrol_callsign_number, status, event_date) values
  ('e1000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-00000000000b', '9002',
   '7e7e7e7e-7e7e-47e7-87e7-7e7e7e7e7e7e', '70707070-7070-4707-8707-707070707070', '412', 'in_progress', date '2026-11-06'),
  ('e2000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-00000000000b', '9003',
   '7e7e7e7e-7e7e-47e7-87e7-7e7e7e7e7e7e', '70707070-7070-4707-8707-707070707070', '413', 'in_progress', date '2026-11-07');
-- The demo-link guard trigger would refuse a demo event led by a real lead.
set local session_replication_role = replica;
insert into public.events (id, shift_lead_id, police_event_id, event_type_id, road_id, patrol_callsign_number, status, event_date, is_demo) values
  ('de000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-00000000000b', '9004',
   '7e7e7e7e-7e7e-47e7-87e7-7e7e7e7e7e7e', '70707070-7070-4707-8707-707070707070', '414', 'in_progress', date '2026-11-07', true);
set local session_replication_role = origin;

insert into public.event_responders (event_id, responder_id) values
  ('ed000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111'),
  ('ed000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222'),
  ('e1000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111'),
  ('e1000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222'),
  ('e2000000-0000-4000-8000-000000000001', '55555555-5555-4555-8555-555555555555');

-- A shift for S in the week of 2026-11-08; X has none.
insert into public.shifts (id, shift_date, shift_lead_id, vehicle_type) values
  ('5f000000-0000-4000-8000-000000000001', date '2026-11-09', '10000000-0000-4000-8000-00000000000b', 'patrol_center');
insert into public.shift_responders (shift_id, responder_id) values
  ('5f000000-0000-4000-8000-000000000001', '55555555-5555-4555-8555-555555555555');

-- Old site: one report by call sign T411 (יוסי לוי), one unrelated.
insert into legacy.users (call_sign, first_name, last_name) values ('T411', 'יוסף', 'לוי');
insert into legacy.vol_events (auto_id, event_fk, event_number, call_sign, event_date, road_number, location, actions_taken) values
  (1, 'OLD-1', '5501', 'T411', timestamp '2025-01-14 10:00', '90', 'גשר עין גדי', 'גרירה לשול'),
  (2, 'OLD-2', '5502', 'T999', timestamp '2025-02-01 10:00', '1', 'מחלף חמד', 'פינוי');

-- ---------------------------------------------------------------------------
-- Admin
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('a0000000-0000-4000-8000-00000000000a');

select pg_temp.ok('e1000000-0000-4000-8000-000000000001' = any (pg_temp.event_ids('{"text":"9002"}')),
  'admin: finds a released event by number');
select pg_temp.ok('ed000000-0000-4000-8000-000000000001' = any (pg_temp.event_ids('{"text":"9001"}')),
  'admin: finds a טיוטה');
select pg_temp.ok(not ('de000000-0000-4000-8000-000000000001' = any (pg_temp.event_ids('{"text":"9004"}'))),
  'admin: demo events stay out of search');
select pg_temp.ok('55555555-5555-4555-8555-555555555555' = any (pg_temp.person_ids('{"entity":"people","text":"7654321"}')),
  'admin: finds a person by phone digits');
select pg_temp.ok((pg_temp.people('{"entity":"people","text":"שירה"}') -> 0) ? 'phone',
  'admin: people rows carry the phone');
select pg_temp.ok(pg_temp.archive_fks('{"text":"עין גדי"}') = array['OLD-1'],
  'admin: finds an old-site report');
select pg_temp.ok(pg_temp.archive_fks('{"person_callsigns":["t411"]}') = array['OLD-1'],
  'admin: finds an old-site report by a profile call sign');
select pg_temp.ok(
  'e2000000-0000-4000-8000-000000000001' = any (pg_temp.event_ids('{"person_ids":["55555555-5555-4555-8555-555555555555"]}'))
  and not ('e1000000-0000-4000-8000-000000000001' = any (pg_temp.event_ids('{"person_ids":["55555555-5555-4555-8555-555555555555"]}'))),
  'admin: person_ids narrows events to that person');
select pg_temp.ok(
  '29292929-2929-4292-8292-292929292929' = any (pg_temp.person_ids('{"entity":"people","no_shift_from":"2026-11-08","no_shift_to":"2026-11-14"}'))
  and not ('55555555-5555-4555-8555-555555555555' = any (pg_temp.person_ids('{"entity":"people","no_shift_from":"2026-11-08","no_shift_to":"2026-11-14"}'))),
  'admin: without a shift this week finds X and not S');
select pg_temp.ok(
  pg_temp.person_ids('{"entity":"people","volunteer_status":"phone_training"}') = array['29292929-2929-4292-8292-292929292929'::uuid],
  'admin: volunteer_status filters people');

-- Typing session: the panel looks up three times, the audit keeps one row.
select pg_temp.archive_fks('{"text":"עין"}', '5e550000-0000-4000-8000-000000000001');
select pg_temp.archive_fks('{"text":"עין ג"}', '5e550000-0000-4000-8000-000000000001');
select pg_temp.archive_fks('{"text":"עין גדי"}', '5e550000-0000-4000-8000-000000000001');
reset role;
select pg_temp.ok(
  (select count(*) from legacy.report_lookup_audit where search_session = '5e550000-0000-4000-8000-000000000001') = 1
  and (select lookups from legacy.report_lookup_audit where search_session = '5e550000-0000-4000-8000-000000000001') = 3,
  'archive audit: one row per typing session, counting its lookups');
select pg_temp.ok(
  (select count(*) from legacy.report_lookup_audit where search_session is null and search_kind = 'smart') = 2,
  'archive audit: each results-page lookup still writes its own row');

-- ---------------------------------------------------------------------------
-- Shift lead
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('10000000-0000-4000-8000-00000000000b');

select pg_temp.ok('ed000000-0000-4000-8000-000000000001' = any (pg_temp.event_ids('{"text":"9001"}')),
  'shift lead: finds a טיוטה');
select pg_temp.ok('55555555-5555-4555-8555-555555555555' = any (pg_temp.person_ids('{"entity":"people","text":"שירה"}')),
  'shift lead: finds anyone by name');
select pg_temp.ok(cardinality(pg_temp.person_ids('{"entity":"people","text":"7654321"}')) = 0,
  'shift lead: phone does not match');
select pg_temp.ok(not ((pg_temp.people('{"entity":"people","text":"שירה"}') -> 0) ? 'phone')
  and not ((pg_temp.people('{"entity":"people","text":"שירה"}') -> 0) ? 'email'),
  'shift lead: people rows carry no phone or email');
select pg_temp.ok(pg_temp.archive_denied('{"text":"עין גדי"}'),
  'shift lead: the archive is refused');
select pg_temp.ok(public.app_search('{"entity":"people","volunteer_status":"phone_training"}') -> 'dropped' = '[]'::jsonb,
  'shift lead: volunteer_status is allowed');

-- ---------------------------------------------------------------------------
-- Responder (also what an admin impersonating R1 gets)
-- ---------------------------------------------------------------------------

select pg_temp.act_as('11111111-1111-4111-8111-111111111111');

select pg_temp.ok('e1000000-0000-4000-8000-000000000001' = any (pg_temp.event_ids('{"text":"9002"}')),
  'responder: finds a released event they are on');
select pg_temp.ok(cardinality(pg_temp.event_ids('{"text":"9001"}')) = 0,
  'responder: does not find the טיוטה they are on, by number');
select pg_temp.ok(
  not ('ed000000-0000-4000-8000-000000000001' = any (pg_temp.event_ids('{"person_ids":["11111111-1111-4111-8111-111111111111"]}'))),
  'responder: does not find the טיוטה by their own name');
select pg_temp.ok(
  not ('ed000000-0000-4000-8000-000000000001' = any (pg_temp.event_ids('{"road":"6"}'))),
  'responder: does not find the טיוטה by road');
select pg_temp.ok(cardinality(pg_temp.event_ids('{"text":"9003"}')) = 0,
  'responder: does not find an event they are not on');
select pg_temp.ok('22222222-2222-4222-8222-222222222222' = any (pg_temp.person_ids('{"entity":"people","text":"דנה"}')),
  'responder: finds a teammate from a shared event');
select pg_temp.ok(cardinality(pg_temp.person_ids('{"entity":"people","text":"שירה"}')) = 0,
  'responder: does not find a stranger by name');
select pg_temp.ok(cardinality(pg_temp.person_ids('{"entity":"people","text":"1111111"}')) = 0,
  'responder: a teammate''s phone does not match');
select pg_temp.ok(not ((pg_temp.people('{"entity":"people","text":"דנה"}') -> 0) ? 'phone'),
  'responder: people rows carry no phone');
select pg_temp.ok(pg_temp.archive_denied('{"text":"עין גדי"}'),
  'responder: the archive is refused');
select pg_temp.ok(
  public.app_search('{"entity":"people","volunteer_status":"active_volunteer","no_shift_from":"2026-11-08"}') -> 'dropped'
    = '["volunteer_status", "no_shift"]'::jsonb,
  'responder: shift coverage and volunteer status are dropped and reported');
select pg_temp.ok(public.app_search_log('9002', '{"text":"9002"}', 'direct', 3) is not null,
  'responder: can write a search log row');
select pg_temp.ok((select count(*) from public.smart_search_log) = 0,
  'responder: cannot read the search log');

select pg_temp.act_as('29292929-2929-4292-8292-292929292929');
select pg_temp.ok(cardinality(pg_temp.event_ids('{"text":"9002"}')) = 0,
  'responder on nothing: finds no events');
select pg_temp.ok(pg_temp.person_ids('{"entity":"people","text":"T41"}') = array['29292929-2929-4292-8292-292929292929'::uuid],
  'responder on nothing: finds only themself');

reset role;
select set_config('request.jwt.claims', '', true);

do $$
begin
  if coalesce(nullif(current_setting('test.failed', true), ''), '0')::int > 0 then
    raise exception '% of % checks failed', current_setting('test.failed'), current_setting('test.n');
  end if;
  raise notice 'all % checks passed', current_setting('test.n');
end
$$;

rollback;
