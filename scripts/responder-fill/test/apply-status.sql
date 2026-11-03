-- apply_event_status_from_participations called by the responder-fill edge
-- function with the service role (20261103110000_apply_event_status_service_role.sql).
-- LOCAL database only:
--   scripts/app-review-demo/test/run-local-db.sh scripts/responder-fill/test/apply-status.sql

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

create function pg_temp.throws(p_sql text, p_msg text, p_label text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    perform pg_temp.ok(p_msg is null or sqlerrm = p_msg,
      case when p_msg is null or sqlerrm = p_msg then p_label
        else format('%s (got: %s)', p_label, sqlerrm) end);
    return;
  end;
  perform pg_temp.ok(false, p_label || ' (no error raised)');
end
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-4111-8111-111111111111', 'r1@test.local', '{"full_name":"כונן","callsign":"T-R1"}'),
  ('29292929-2929-4292-8292-292929292929', 'x@test.local',  '{"full_name":"זר","callsign":"T-X"}'),
  ('33333333-3333-4333-8333-333333333333', 'l@test.local',  '{"full_name":"אחמש","callsign":"T-L"}');
insert into public.user_roles (user_id, role) values
  ('11111111-1111-4111-8111-111111111111', 'responder'),
  ('29292929-2929-4292-8292-292929292929', 'responder'),
  ('33333333-3333-4333-8333-333333333333', 'shift_lead');

-- A regular event with an end time; its one responder (no car) has finished.
insert into public.events (id, shift_lead_id, police_event_id, ended_at, status) values
  ('e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', '33333333-3333-4333-8333-333333333333', '9001',
   now() - interval '1 hour', 'in_progress');
insert into public.event_responders (event_id, responder_id, status) values
  ('e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', '11111111-1111-4111-8111-111111111111', 'done');

-- The edge function: service role key, no user.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select pg_temp.ok(public.apply_event_status_from_participations('e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1') = 'done',
  'service role (email-link save) recomputes the event status');
select pg_temp.ok((select status from public.events where id = 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1') = 'done',
  'the event is stored as done');

-- Signed-in callers keep the old rule.
update public.events set status = 'in_progress' where id = 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1';
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '29292929-2929-4292-8292-292929292929', 'role', 'authenticated')::text, true);
select pg_temp.throws($$select public.apply_event_status_from_participations('e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1')$$,
  'not allowed', 'a signed-in stranger is still refused');
select set_config('request.jwt.claims',
  json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
select pg_temp.ok(public.apply_event_status_from_participations('e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1') = 'done',
  'the assigned responder may still recompute');
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.throws($$select public.apply_event_status_from_participations('e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1')$$,
  'not allowed', 'an anonymous caller is refused');
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
