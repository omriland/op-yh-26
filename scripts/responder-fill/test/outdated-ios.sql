-- Outdated iPhone builds cannot save a responder report
-- (20261103120000_block_outdated_ios_fill.sql). LOCAL database only:
--   scripts/app-review-demo/test/run-local-db.sh scripts/responder-fill/test/outdated-ios.sql

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

-- Runs the responder's own save under a given User-Agent; returns 'ok' or the error.
create function pg_temp.save_as(p_ua text) returns text language plpgsql as $$
begin
  perform set_config('request.headers',
    case when p_ua is null then '' else json_build_object('user-agent', p_ua)::text end, true);
  update public.event_responders set route = 'כביש 2 ' || coalesce(p_ua, 'none')
  where id = 'a1a1a1a1-0000-4000-8000-000000000001';
  return 'ok';
exception when others then
  return sqlerrm;
end
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-4111-8111-111111111111', 'r1@test.local', '{"full_name":"כונן","callsign":"T-R1"}'),
  ('33333333-3333-4333-8333-333333333333', 'l@test.local',  '{"full_name":"אחמש","callsign":"T-L"}');
insert into public.user_roles (user_id, role) values
  ('11111111-1111-4111-8111-111111111111', 'responder'),
  ('33333333-3333-4333-8333-333333333333', 'shift_lead');
-- Past טיוטה, so the volunteer may write their row (20261108120000_event_lifecycle_release.sql).
insert into public.event_types (id, name) values
  ('7e7e7e7e-7e7e-47e7-87e7-7e7e7e7e7e7e', 'בדיקה - סוג אירוע');
insert into public.roads (id, name) values
  ('70707070-7070-4707-8707-707070707070', 'בדיקה - כביש');
insert into public.events (id, shift_lead_id, police_event_id, event_type_id, road_id, patrol_callsign_number) values
  ('e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', '33333333-3333-4333-8333-333333333333', '9001',
   '7e7e7e7e-7e7e-47e7-87e7-7e7e7e7e7e7e', '70707070-7070-4707-8707-707070707070', '411');
insert into public.event_responders (id, event_id, responder_id) values
  ('a1a1a1a1-0000-4000-8000-000000000001', 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', '11111111-1111-4111-8111-111111111111');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select pg_temp.ok(pg_temp.save_as('Yahpaz/2 CFNetwork/3896.200.61 Darwin/27.2.0') like 'גרסת האפליקציה באייפון ישנה%',
  'the AltStore build (Yahpaz/2) cannot save a report');
select pg_temp.ok(pg_temp.save_as('Yahpaz/8 CFNetwork/1 Darwin/25.0.0') like 'גרסת האפליקציה באייפון ישנה%',
  'Ad Hoc build 8 (no photos, no update check) cannot save');
select pg_temp.ok(pg_temp.save_as('Yahpaz/9 CFNetwork/1 Darwin/25.0.0') = 'ok', 'build 9 still saves');
select pg_temp.ok(pg_temp.save_as('Yahpaz/16 CFNetwork/3896.100.1.2.1 Darwin/27.0.0') = 'ok', 'Ad Hoc build 16 still saves');
select pg_temp.ok(pg_temp.save_as('Yahpaz/17 CFNetwork/3896 Darwin/27.0.0') = 'ok', 'the App Store build 17 still saves');
select pg_temp.ok(pg_temp.save_as('Yahpaz/123 CFNetwork/3896 Darwin/27.0.0') = 'ok', 'a three-digit build is not mistaken for build 1');
select pg_temp.ok(pg_temp.save_as('Ktor client') = 'ok', 'the Android app still saves');
select pg_temp.ok(pg_temp.save_as('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)') = 'ok', 'the website on an iPhone still saves');
select pg_temp.ok(pg_temp.save_as(null) = 'ok', 'no header (edge functions, scripts) still saves');
select set_config('request.headers', 'not json', true);
select pg_temp.ok(not public.is_outdated_ios_app_request(), 'an unreadable header never blocks');
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
