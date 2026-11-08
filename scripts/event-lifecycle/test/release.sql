-- A volunteer never sees, writes, or hears about a טיוטה
-- (20261108120000_event_lifecycle_release.sql). LOCAL database only:
--   scripts/app-review-demo/test/run-local-db.sh scripts/event-lifecycle/test/release.sql

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

create function pg_temp.released(
  p_origin public.event_origin, p_police text, p_type boolean, p_road boolean,
  p_prefix text, p_number text, p_legacy text
) returns boolean language sql as $$
  select public.event_released_to_responders(
    p_origin, p_police,
    case when p_type then gen_random_uuid() end,
    case when p_road then gen_random_uuid() end,
    p_prefix, p_number, p_legacy)
$$;

-- ---------------------------------------------------------------------------
-- 1. The release rule, case for case with src/lib/eventLifecycle.test.ts.
-- ---------------------------------------------------------------------------

select pg_temp.ok(pg_temp.released('shift', null, false, false, null, null, null),
  'release: shift-born is released with nothing filled');
select pg_temp.ok(pg_temp.released('manual', '9001', true, true, '', '411', null),
  'release: number, type, road and callsign number');
select pg_temp.ok(not pg_temp.released('manual', '  ', true, true, '', '411', null),
  'release: blank מספר אירוע holds it');
select pg_temp.ok(not pg_temp.released('manual', '9001', false, true, '', '411', null),
  'release: missing סוג אירוע holds it');
select pg_temp.ok(not pg_temp.released('manual', '9001', true, false, '', '411', null),
  'release: missing כביש holds it');
select pg_temp.ok(not pg_temp.released('manual', '9001', true, true, 'אביב', '', 'אביב 411'),
  'release: a prefix without a number holds it, whatever the legacy column says');
select pg_temp.ok(pg_temp.released('manual', '9001', true, true, null, null, 'אביב 411'),
  'release: a legacy combined callsign with digits counts');
select pg_temp.ok(not pg_temp.released('manual', '9001', true, true, null, null, 'אביב'),
  'release: a legacy callsign without digits holds it');

-- ---------------------------------------------------------------------------
-- Fixtures, written as postgres (no JWT, RLS bypassed).
--   R1, R2 responders · X a responder on nothing · L shift lead · A admin
--   ED a טיוטה (no סוג אירוע) · ER a released event; R1 and R2 on both
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-4111-8111-111111111111', 'r1@test.local', '{"full_name":"מתנדב אחד","callsign":"T-R1"}'),
  ('22222222-2222-4222-8222-222222222222', 'r2@test.local', '{"full_name":"מתנדב שניים","callsign":"T-R2"}'),
  ('29292929-2929-4292-8292-292929292929', 'x@test.local',  '{"full_name":"זר","callsign":"T-X"}'),
  ('33333333-3333-4333-8333-333333333333', 'l@test.local',  '{"full_name":"אחמ״ש","callsign":"T-L"}'),
  ('44444444-4444-4444-8444-444444444444', 'a@test.local',  '{"full_name":"מנהל","callsign":"T-A"}');
insert into public.user_roles (user_id, role) values
  ('11111111-1111-4111-8111-111111111111', 'responder'),
  ('22222222-2222-4222-8222-222222222222', 'responder'),
  ('29292929-2929-4292-8292-292929292929', 'responder'),
  ('33333333-3333-4333-8333-333333333333', 'shift_lead'),
  ('44444444-4444-4444-8444-444444444444', 'admin');

insert into public.event_types (id, name) values
  ('7e7e7e7e-7e7e-47e7-87e7-7e7e7e7e7e7e', 'בדיקה - סוג אירוע');
insert into public.roads (id, name) values
  ('70707070-7070-4707-8707-707070707070', 'בדיקה - כביש');

-- R1 has a car, so the lead owes their ק״מ. R2 cannot see that car.
insert into public.vehicles (user_id, plate_number, model) values
  ('11111111-1111-4111-8111-111111111111', '1234567', 'רכב בדיקה');

-- A partner bot linked to R1, to watch assignment_created.
insert into public.oauth_clients (id, name, client_id, client_secret_hash, telegram_bot_username, webhook_url) values
  ('0c000000-0000-4000-8000-000000000001', 'בוט בדיקה', 'client-1', 'h', 'test_bot', 'https://example.invalid/hook');
insert into public.oauth_access_tokens (client_id, user_id, token_hash, expires_at) values
  ('0c000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'h', now() + interval '1 day');

insert into public.events (id, shift_lead_id, police_event_id, road_id, patrol_callsign_number, status) values
  ('ed000000-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333', '9001',
   '70707070-7070-4707-8707-707070707070', '411', 'in_progress');
insert into public.events (id, shift_lead_id, police_event_id, event_type_id, road_id, patrol_callsign_number, status) values
  ('e7000000-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333', '9002',
   '7e7e7e7e-7e7e-47e7-87e7-7e7e7e7e7e7e', '70707070-7070-4707-8707-707070707070', '412', 'in_progress');

insert into public.event_responders (id, event_id, responder_id) values
  ('a1000000-0000-4000-8000-000000000001', 'ed000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111'),
  ('a1000000-0000-4000-8000-000000000002', 'ed000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222'),
  ('a1000000-0000-4000-8000-000000000003', 'e7000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111'),
  ('a1000000-0000-4000-8000-000000000004', 'e7000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222');

-- ---------------------------------------------------------------------------
-- 2. Partner webhooks wait for release.
-- ---------------------------------------------------------------------------

create function pg_temp.hooks(p_event uuid) returns int language sql as $$
  select count(*)::int from public.partner_webhook_events
  where event_type = 'assignment_created' and payload->>'event_id' = p_event::text
$$;

select pg_temp.ok(pg_temp.hooks('ed000000-0000-4000-8000-000000000001') = 0,
  'webhook: assigning a volunteer to a טיוטה tells their bot nothing');
select pg_temp.ok(pg_temp.hooks('e7000000-0000-4000-8000-000000000001') = 1,
  'webhook: assigning a volunteer to a released event tells their bot once');

update public.events set location = 'מחלף' where id = 'ed000000-0000-4000-8000-000000000001';
select pg_temp.ok(pg_temp.hooks('ed000000-0000-4000-8000-000000000001') = 0,
  'webhook: an edit that leaves it a טיוטה still says nothing');

update public.events set event_type_id = '7e7e7e7e-7e7e-47e7-87e7-7e7e7e7e7e7e'
where id = 'ed000000-0000-4000-8000-000000000001';
select pg_temp.ok(pg_temp.hooks('ed000000-0000-4000-8000-000000000001') = 1,
  'webhook: filling the last release field (סוג אירוע, not מספר אירוע) sends it');

update public.events set police_event_id = null where id = 'ed000000-0000-4000-8000-000000000001';
update public.events set police_event_id = '9001' where id = 'ed000000-0000-4000-8000-000000000001';
select pg_temp.ok(pg_temp.hooks('ed000000-0000-4000-8000-000000000001') = 1,
  'webhook: held and released again, it is not sent twice');

-- Back to a טיוטה for the visibility checks.
update public.events set event_type_id = null where id = 'ed000000-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------------------
-- 3. Who reads which event.
-- ---------------------------------------------------------------------------

create temp table seen (who text, event_id uuid) on commit drop;
grant all on seen to authenticated;

set local role authenticated;

select pg_temp.act_as('11111111-1111-4111-8111-111111111111');
insert into seen select 'r1', id from public.events;
select pg_temp.ok(
  (select count(*) from public.event_responders
   where responder_id = '11111111-1111-4111-8111-111111111111') = 2,
  'responder: still reads both of their own assignment rows');
select pg_temp.ok(not public.event_is_open_for_responder_edit('ed000000-0000-4000-8000-000000000001'),
  'responder: a טיוטה is not open for their edit');
select pg_temp.ok(public.event_is_open_for_responder_edit('e7000000-0000-4000-8000-000000000001'),
  'responder: a released event is open for their edit');
with written as (
  update public.event_responders set route = 'נסיעה'
  where id = 'a1000000-0000-4000-8000-000000000001' returning 1
) select pg_temp.ok((select count(*) from written) = 0,
  'responder: cannot write their own row on a טיוטה');
with written as (
  update public.event_responders set route = 'נסיעה'
  where id = 'a1000000-0000-4000-8000-000000000003' returning 1
) select pg_temp.ok((select count(*) from written) = 1,
  'responder: can write their own row on a released event');

select pg_temp.act_as('22222222-2222-4222-8222-222222222222');
select pg_temp.ok(
  (select public.lead_km_owed(e) from public.events e where e.id = 'e7000000-0000-4000-8000-000000000001'),
  'lead_km_owed: a teammate sees the lead still owes ק״מ for a car they cannot see');

select pg_temp.act_as('29292929-2929-4292-8292-292929292929');
insert into seen select 'x', id from public.events;

select pg_temp.act_as('33333333-3333-4333-8333-333333333333');
insert into seen select 'lead', id from public.events;

select pg_temp.act_as('44444444-4444-4444-8444-444444444444');
insert into seen select 'admin', id from public.events;

reset role;
select set_config('request.jwt.claims', '', true);

select pg_temp.ok(
  exists (select 1 from seen where who = 'r1' and event_id = 'e7000000-0000-4000-8000-000000000001'),
  'responder: reads the released event they are on');
select pg_temp.ok(
  not exists (select 1 from seen where who = 'r1' and event_id = 'ed000000-0000-4000-8000-000000000001'),
  'responder: does not read the טיוטה they are on');
select pg_temp.ok(not exists (select 1 from seen where who = 'x'),
  'responder: reads nothing they are not on');
select pg_temp.ok((select count(*) from seen where who = 'lead') = 2,
  'shift lead: reads the טיוטה and the released event');
select pg_temp.ok((select count(*) from seen where who = 'admin') = 2,
  'admin: reads the טיוטה and the released event');

update public.event_responders set total_km = 5 where id = 'a1000000-0000-4000-8000-000000000003';
select pg_temp.ok(
  not (select public.lead_km_owed(e) from public.events e where e.id = 'e7000000-0000-4000-8000-000000000001'),
  'lead_km_owed: clears once the lead enters the ק״מ');

do $$
begin
  if coalesce(nullif(current_setting('test.failed', true), ''), '0')::int > 0 then
    raise exception '% of % checks failed', current_setting('test.failed'), current_setting('test.n');
  end if;
  raise notice 'all % checks passed', current_setting('test.n');
end
$$;

rollback;
