-- Pre-launch gate (supabase/migrations/20261029180000_prelaunch_gate.sql).
-- Plain SQL, no pgTAP. Runs on a LOCAL database only:
--   scripts/app-review-demo/test/run-local-db.sh scripts/prelaunch-gate/test/gate.sql
-- One transaction, rolled back at the end. Prints "ok N - ..." per check and
-- fails with a non-zero exit if any check fails. Time-independent: it pins
-- public.prelaunch_launch_at() to the future, then to the past, inside the
-- transaction.

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

create function pg_temp.lives(p_sql text, p_label text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    perform pg_temp.ok(false, format('%s (got %s: %s)', p_label, sqlstate, sqlerrm));
    return;
  end;
  perform pg_temp.ok(true, p_label);
end
$$;

create function pg_temp.act_as(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

-- X-Client-Info as PostgREST exposes it in request.headers. Values are exactly
-- what the pinned SDKs send (see 20261029190000_prelaunch_native_block.sql).
create function pg_temp.as_client(p_client text) returns void language sql as $$
  select set_config('request.headers', case p_client
    when 'swift' then json_build_object('x-client-info',
      'supabase-swift/2.55.1; platform=iOS; platform-version=26.0; runtime=swift; runtime-version=6.1')::text
    when 'kt' then json_build_object('x-client-info', 'supabase-kt/3.1.4')::text
    when 'web' then json_build_object('x-client-info', 'supabase-js/2.112.2; runtime=web')::text
    when 'no_header' then '{"accept":"application/json"}'
    when 'garbage' then 'not json'
    else ''
  end, true);
$$;

create function pg_temp.gate_blocked(p_user uuid) returns boolean language plpgsql as $$
begin
  perform pg_temp.act_as(p_user);
  return (public.prelaunch_gate() ->> 'blocked')::boolean;
end
$$;

-- ---------------------------------------------------------------------------
-- The shipped launch instant, before the test moves it.
-- ---------------------------------------------------------------------------

select pg_temp.ok(public.prelaunch_launch_at() = timestamptz '2026-10-31 22:01:00+00',
  'launch is 2026-10-31T22:01:00Z');
select pg_temp.ok((public.prelaunch_launch_at() at time zone 'Asia/Jerusalem') = timestamp '2026-11-01 00:01:00',
  'launch is 2026-11-01 00:01 Asia/Jerusalem');

-- ---------------------------------------------------------------------------
-- Fixtures, written as postgres (no JWT, RLS bypassed).
--   R responder · L shift lead · RL responder + shift lead · A admin
--   S super admin only · RA responder + admin · N no role yet
--   I invited responder (invite pending, must change password)
--   D demo account · DL demo lead · E1 real event · E2 demo event · S1 real shift
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('b0000000-0000-4000-8000-000000000001', 'r@gate.local',  '{"full_name":"מתנדב","callsign":"G-R","phone":"0501000001"}'),
  ('b0000000-0000-4000-8000-000000000002', 'l@gate.local',  '{"full_name":"אחמש","callsign":"G-L"}'),
  ('b0000000-0000-4000-8000-000000000003', 'a@gate.local',  '{"full_name":"מנהל","callsign":"G-A"}'),
  ('b0000000-0000-4000-8000-000000000004', 's@gate.local',  '{"full_name":"מנהל על","callsign":"G-S"}'),
  ('b0000000-0000-4000-8000-000000000005', 'i@gate.local',  '{"full_name":"מוזמן","callsign":"G-I"}'),
  ('b0000000-0000-4000-8000-000000000006', 'n@gate.local',  '{"full_name":"בלי תפקיד","callsign":"G-N"}'),
  ('b0000000-0000-4000-8000-000000000007', 'rl@gate.local', '{"full_name":"מתנדב ואחמש","callsign":"G-RL"}'),
  ('b0000000-0000-4000-8000-000000000008', 'ra@gate.local', '{"full_name":"מתנדב ומנהל","callsign":"G-RA"}'),
  ('b0000000-0000-4000-8000-00000000000d', 'd@gate.local',  '{"full_name":"App Review דמו","callsign":"G-D"}'),
  ('b0000000-0000-4000-8000-00000000000e', 'dl@gate.local', '{"full_name":"אחמ״ש דמו","callsign":"G-DL"}');

update public.profiles set is_app_review_demo = true
where id in ('b0000000-0000-4000-8000-00000000000d', 'b0000000-0000-4000-8000-00000000000e');
update public.profiles
set invite_pending = true, invite_token = 'f0000000-0000-4000-8000-000000000005', must_change_password = true
where id = 'b0000000-0000-4000-8000-000000000005';

insert into public.user_roles (user_id, role) values
  ('b0000000-0000-4000-8000-000000000001', 'responder'),
  ('b0000000-0000-4000-8000-000000000002', 'shift_lead'),
  ('b0000000-0000-4000-8000-000000000003', 'admin'),
  ('b0000000-0000-4000-8000-000000000004', 'super_admin'),
  ('b0000000-0000-4000-8000-000000000005', 'responder'),
  ('b0000000-0000-4000-8000-000000000007', 'responder'),
  ('b0000000-0000-4000-8000-000000000007', 'shift_lead'),
  ('b0000000-0000-4000-8000-000000000008', 'responder'),
  ('b0000000-0000-4000-8000-000000000008', 'admin'),
  ('b0000000-0000-4000-8000-00000000000d', 'responder'),
  ('b0000000-0000-4000-8000-00000000000e', 'responder');

insert into public.events (id, shift_lead_id, police_event_id, notes, is_demo) values
  ('e0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002', '7001', 'אירוע אמיתי', false),
  ('e0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-00000000000e', '7002', 'דמו - App Review', true);
insert into public.event_responders (event_id, responder_id) values
  ('e0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-00000000000d');
insert into public.shifts (id, shift_lead_id, vehicle_type, is_demo) values
  ('5b000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002', 'patrol_north', false);
insert into public.shift_responders (shift_id, responder_id) values
  ('5b000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001');
insert into public.vehicles (user_id, plate_number, model) values
  ('b0000000-0000-4000-8000-000000000001', '1000001', 'רכב מתנדב'),
  ('b0000000-0000-4000-8000-00000000000d', '1000002', 'רכב דמו');
insert into public.user_addresses (user_id, kind, formatted_address, place_id, lat, lng) values
  ('b0000000-0000-4000-8000-000000000001', 'home', 'כתובת', 'gate-place-r', 32.08, 34.78),
  ('b0000000-0000-4000-8000-00000000000e', 'home', 'דמו - App Review', 'gate-place-dl', 32.1, 34.8);
insert into public.user_feedback (user_id, kind, body) values
  ('b0000000-0000-4000-8000-000000000001', 'bug', 'משוב');
insert into public.device_tokens (user_id, token, platform, environment) values
  ('b0000000-0000-4000-8000-000000000001', 'gate-device-token-000000000001', 'ios', 'production');
insert into public.districts (name) values ('שלוחת בדיקה');
insert into storage.objects (bucket_id, name) values
  ('event-media', 'e0000000-0000-4000-8000-000000000001/0f000000-0000-4000-8000-000000000001.jpg');

-- ---------------------------------------------------------------------------
-- Coverage and privileges.
-- ---------------------------------------------------------------------------

select pg_temp.ok(not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and c.relrowsecurity
      and c.relname not in ('profiles', 'user_roles', 'device_tokens', 'ios_devices')
      and not exists (
        select 1 from pg_policies p
        where p.schemaname = 'public'
          and p.tablename = c.relname
          and p.policyname = c.relname || '_prelaunch_gate'
          and p.permissive = 'RESTRICTIVE'
      )
  ), 'every other RLS table in public has a restrictive <table>_prelaunch_gate policy');
select pg_temp.ok((select count(*) from pg_policies
    where schemaname = 'public' and policyname in ('profiles_prelaunch_gate', 'user_roles_prelaunch_gate')
      and permissive = 'RESTRICTIVE') = 2,
  'profiles and user_roles have their own-row gate');
select pg_temp.ok(exists (select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'storage_prelaunch_gate'
      and permissive = 'RESTRICTIVE'),
  'storage.objects has the gate');
select pg_temp.ok((select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid
    where t.tgname = c.relname || '_prelaunch_guard') = 12,
  'the 12 event and shift tables have the write guard trigger');

select pg_temp.ok(not has_function_privilege('authenticated', 'public.is_prelaunch_blocked(uuid)', 'execute'),
  'members cannot probe another user with is_prelaunch_blocked');
select pg_temp.ok(not has_function_privilege('anon', 'public.prelaunch_gate()', 'execute'),
  'anon cannot call prelaunch_gate');
select pg_temp.ok(has_function_privilege('authenticated', 'public.prelaunch_gate()', 'execute'),
  'members can call prelaunch_gate');
select pg_temp.ok(has_function_privilege('service_role', 'public.is_prelaunch_blocked(uuid)', 'execute'),
  'edge functions (service role) can call is_prelaunch_blocked');

-- ---------------------------------------------------------------------------
-- Before launch.
-- ---------------------------------------------------------------------------

create or replace function public.prelaunch_launch_at()
returns timestamptz language sql stable as $$ select timestamptz '2999-01-01 00:00:00+00' $$;

set local role authenticated;

-- Role matrix.
select pg_temp.ok(pg_temp.gate_blocked('b0000000-0000-4000-8000-000000000001'), 'before: responder is blocked');
select pg_temp.ok(pg_temp.gate_blocked('b0000000-0000-4000-8000-000000000002'), 'before: shift lead is blocked');
select pg_temp.ok(pg_temp.gate_blocked('b0000000-0000-4000-8000-000000000007'), 'before: responder + shift lead is blocked');
select pg_temp.ok(pg_temp.gate_blocked('b0000000-0000-4000-8000-000000000005'), 'before: invited responder is blocked');
select pg_temp.ok(pg_temp.gate_blocked('b0000000-0000-4000-8000-000000000006'), 'before: user without a role is blocked');
select pg_temp.ok(not pg_temp.gate_blocked('b0000000-0000-4000-8000-000000000003'), 'before: admin is exempt');
select pg_temp.ok(not pg_temp.gate_blocked('b0000000-0000-4000-8000-000000000004'), 'before: super admin is exempt');
select pg_temp.ok(not pg_temp.gate_blocked('b0000000-0000-4000-8000-000000000008'), 'before: responder + admin is exempt');
select pg_temp.ok(not pg_temp.gate_blocked('b0000000-0000-4000-8000-00000000000d'), 'before: App Review demo account is exempt');
select pg_temp.act_as('b0000000-0000-4000-8000-00000000000d');
select pg_temp.ok((public.prelaunch_gate() ->> 'exempt')::boolean
    and (public.prelaunch_gate() ->> 'launch_at_ms')::bigint
      = floor(extract(epoch from timestamptz '2999-01-01 00:00:00+00') * 1000)::bigint
    and abs((public.prelaunch_gate() ->> 'server_now_ms')::bigint - floor(extract(epoch from now()) * 1000)::bigint) < 1000,
  'before: prelaunch_gate returns exempt, launch_at_ms and server_now_ms');

-- Blocked responder: own account rows only.
select pg_temp.act_as('b0000000-0000-4000-8000-000000000001');
select pg_temp.ok((select array_agg(id) from public.profiles) = array['b0000000-0000-4000-8000-000000000001']::uuid[],
  'before/responder: profiles = own row only');
select pg_temp.ok((select array_agg(role::text) from public.user_roles) = array['responder'],
  'before/responder: user_roles = own role only');
select pg_temp.ok((select count(*) from public.device_tokens) = 1, 'before/responder: own push token still readable');
select pg_temp.ok((select count(*) from public.events) = 0, 'before/responder: no events');
select pg_temp.ok((select count(*) from public.event_responders) = 0, 'before/responder: no assignments');
select pg_temp.ok((select count(*) from public.shifts) = 0, 'before/responder: no shifts');
select pg_temp.ok((select count(*) from public.shift_responders) = 0, 'before/responder: no shift assignments');
select pg_temp.ok((select count(*) from public.vehicles) = 0, 'before/responder: no vehicles');
select pg_temp.ok((select count(*) from public.user_addresses) = 0, 'before/responder: no addresses');
select pg_temp.ok((select count(*) from public.user_feedback) = 0, 'before/responder: no feedback');
select pg_temp.ok((select count(*) from public.districts) = 0, 'before/responder: no lookups');
select pg_temp.ok((select count(*) from storage.objects) = 0, 'before/responder: no stored files');
select pg_temp.ok((select count(*) from public.list_unit_contacts()) = 0, 'before/responder: list_unit_contacts is empty');
select pg_temp.ok((select count(*) from public.list_unit_map_pins()) = 0, 'before/responder: list_unit_map_pins is empty');
select pg_temp.lives(
  $$update public.profiles set availability = 'available' where id = 'b0000000-0000-4000-8000-000000000001'$$,
  'before/responder: can still edit own profile');
with u as (
  update public.profiles set callsign = 'X' where id = 'b0000000-0000-4000-8000-000000000003' returning 1
)
select pg_temp.ok(count(*) = 0, 'before/responder: cannot edit another profile') from u;
select pg_temp.throws(
  $$insert into public.user_feedback (user_id, kind, body) values ('b0000000-0000-4000-8000-000000000001', 'bug', 'x')$$,
  '42501', 'before/responder: cannot write feedback');
select pg_temp.throws(
  $$insert into public.my_active_event_prefs (user_id, event_id, kind)
    values ('b0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'pin')$$,
  '42501', 'before/responder: cannot write active-event prefs');

-- Invited user finishing the web set-password step (auth.tsx updatePassword).
select pg_temp.act_as('b0000000-0000-4000-8000-000000000005');
select pg_temp.lives($$select public.clear_must_change_password()$$,
  'before/invited: clear_must_change_password works');
with u as (
  update public.profiles
  set invite_pending = false, invite_token = null, invite_token_expires_at = null, updated_at = now()
  where id = 'b0000000-0000-4000-8000-000000000005'
  returning 1
)
select pg_temp.ok(count(*) = 1, 'before/invited: can clear own invite fields') from u;
select pg_temp.ok((select not invite_pending and not must_change_password from public.profiles
    where id = 'b0000000-0000-4000-8000-000000000005'),
  'before/invited: profile shows the invite completed');

-- Blocked shift lead: not even own events.
select pg_temp.act_as('b0000000-0000-4000-8000-000000000002');
select pg_temp.ok((select count(*) from public.events) = 0, 'before/shift lead: no events, own included');
select pg_temp.ok((select count(*) from public.shifts) = 0, 'before/shift lead: no shifts, own included');
select pg_temp.ok((select count(*) from public.list_shift_lead_profiles()) = 0,
  'before/shift lead: list_shift_lead_profiles is empty');
with u as (
  update public.events set notes = 'x' where id = 'e0000000-0000-4000-8000-000000000001' returning 1
)
select pg_temp.ok(count(*) = 0, 'before/shift lead: cannot edit own event') from u;

-- Exempt users see what they saw before.
select pg_temp.act_as('b0000000-0000-4000-8000-000000000003');
select pg_temp.ok((select count(*) from public.events where id = 'e0000000-0000-4000-8000-000000000001') = 1,
  'before/admin: sees the real event');
select pg_temp.ok((select count(*) from public.profiles) >= 8, 'before/admin: sees member profiles');
select pg_temp.ok((select count(*) from public.list_unit_contacts()) > 0, 'before/admin: contacts listed');
select pg_temp.ok((select count(*) from public.districts) > 0, 'before/admin: lookups readable');
-- A super_admin-only account sees no events even without the gate (events
-- policies check admin / shift_lead / responder), so check an RPC instead.
select pg_temp.act_as('b0000000-0000-4000-8000-000000000004');
select pg_temp.ok((select count(*) from public.list_shift_lead_profiles()) > 0,
  'before/super admin: list_shift_lead_profiles works');
select pg_temp.act_as('b0000000-0000-4000-8000-000000000008');
select pg_temp.ok((select count(*) from public.events where id = 'e0000000-0000-4000-8000-000000000001') = 1,
  'before/responder + admin: sees the real event');

-- App Review demo account keeps its demo world.
select pg_temp.act_as('b0000000-0000-4000-8000-00000000000d');
select pg_temp.ok((select array_agg(id) from public.events) = array['e0000000-0000-4000-8000-000000000002']::uuid[],
  'before/demo: sees the demo event');
select pg_temp.ok((select count(*) from public.event_responders) = 1, 'before/demo: sees its assignment');
select pg_temp.ok((select array_agg(user_id) from public.vehicles) = array['b0000000-0000-4000-8000-00000000000d']::uuid[],
  'before/demo: sees its vehicle');
select pg_temp.ok((select array_agg(id) from public.list_unit_contacts()) = array['b0000000-0000-4000-8000-00000000000e']::uuid[],
  'before/demo: contacts = the demo lead');
select pg_temp.ok((select array_agg(user_id) from public.list_unit_map_pins()) = array['b0000000-0000-4000-8000-00000000000e']::uuid[],
  'before/demo: map pins = the demo lead');
select pg_temp.ok((select count(*) from public.districts) > 0, 'before/demo: lookups readable');
select pg_temp.lives(
  $$insert into public.my_active_event_prefs (user_id, event_id, kind)
    values ('b0000000-0000-4000-8000-00000000000d', 'e0000000-0000-4000-8000-000000000002', 'pin')$$,
  'before/demo: can still write its own rows');
select pg_temp.lives(
  $$update public.profiles set availability = 'available' where id = 'b0000000-0000-4000-8000-00000000000d'$$,
  'before/demo: can still edit its own profile');

-- Native apps (20261029190000): a gated member's own profile and roles are
-- hidden from supabase-swift / supabase-kt, so the apps' sign-in fails.
select pg_temp.act_as('b0000000-0000-4000-8000-000000000001');
select pg_temp.as_client('swift');
select pg_temp.ok((select count(*) from public.profiles) = 0
    and (select count(*) from public.user_roles) = 0,
  'before/responder on iOS (supabase-swift): own profile and roles hidden, so sign-in fails');
select pg_temp.as_client('kt');
select pg_temp.ok((select count(*) from public.profiles) = 0
    and (select count(*) from public.user_roles) = 0,
  'before/responder on Android (supabase-kt): own profile and roles hidden, so sign-in fails');
with u as (
  update public.profiles set availability = 'available' where id = 'b0000000-0000-4000-8000-000000000001' returning 1
)
select pg_temp.ok(count(*) = 0, 'before/responder on Android: cannot write own profile either') from u;
select pg_temp.act_as('b0000000-0000-4000-8000-000000000002');
select pg_temp.as_client('swift');
select pg_temp.ok((select count(*) from public.profiles) = 0, 'before/shift lead on iOS: own profile hidden');
select pg_temp.act_as('b0000000-0000-4000-8000-000000000001');
select pg_temp.as_client('web');
select pg_temp.ok((select count(*) from public.profiles) = 1 and (select count(*) from public.user_roles) = 1,
  'before/responder on the web (supabase-js): own profile and roles for the gate screen');
select pg_temp.as_client('no_header');
select pg_temp.ok((select count(*) from public.profiles) = 1, 'before/responder, no X-Client-Info: treated as web');
select pg_temp.as_client('none');
select pg_temp.ok((select count(*) from public.profiles) = 1, 'before/responder, no request.headers at all: treated as web');
select pg_temp.as_client('garbage');
select pg_temp.ok((select count(*) from public.profiles) = 1, 'before/responder, unreadable request.headers: treated as web, no error');
select pg_temp.act_as('b0000000-0000-4000-8000-000000000003');
select pg_temp.as_client('swift');
select pg_temp.ok((select count(*) from public.profiles) >= 8
    and (select count(*) from public.user_roles where user_id = 'b0000000-0000-4000-8000-000000000003') = 1
    and (select count(*) from public.events where id = 'e0000000-0000-4000-8000-000000000001') = 1,
  'before/admin on iOS: unaffected');
select pg_temp.as_client('kt');
select pg_temp.ok((select count(*) from public.profiles) >= 8, 'before/admin on Android: unaffected');
select pg_temp.act_as('b0000000-0000-4000-8000-00000000000d');
select pg_temp.as_client('swift');
select pg_temp.ok((select count(*) from public.profiles where id = 'b0000000-0000-4000-8000-00000000000d') = 1
    and (select array_agg(role::text) from public.user_roles) = array['responder']
    and (select array_agg(id) from public.events) = array['e0000000-0000-4000-8000-000000000002']::uuid[]
    and (select array_agg(id) from public.list_unit_contacts()) = array['b0000000-0000-4000-8000-00000000000e']::uuid[],
  'before/App Review demo on iOS: profile, roles, demo event and contacts as before');
select pg_temp.as_client('kt');
select pg_temp.ok((select count(*) from public.profiles where id = 'b0000000-0000-4000-8000-00000000000d') = 1,
  'before/App Review demo on Android: profile readable');
select pg_temp.as_client('none');

-- SECURITY DEFINER RPCs bypass RLS; the write guard trigger refuses them.
select pg_temp.act_as('b0000000-0000-4000-8000-000000000002');
select pg_temp.throws($$select public.delete_event('e0000000-0000-4000-8000-000000000001')$$,
  '42501', 'before/shift lead: delete_event of own event is refused');
select pg_temp.act_as('b0000000-0000-4000-8000-000000000001');
select pg_temp.throws(
  $$select public.upsert_locked_secondary_lead('e0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000007')$$,
  '42501', 'before/responder: upsert_locked_secondary_lead is refused');
reset role;
select pg_temp.ok((select count(*) from public.events where id = 'e0000000-0000-4000-8000-000000000001') = 1
    and (select count(*) from public.event_secondary_leads where event_id = 'e0000000-0000-4000-8000-000000000001') = 0,
  'before: the event and its leads are untouched');

-- The same trigger, for definer code acting for each kind of caller.
select pg_temp.act_as('b0000000-0000-4000-8000-000000000001');
select pg_temp.throws($$update public.events set notes = 'x' where id = 'e0000000-0000-4000-8000-000000000001'$$,
  '42501', 'before/definer code for a responder: event write refused');
select pg_temp.act_as('b0000000-0000-4000-8000-000000000003');
with u as (
  update public.events set notes = 'מנהל' where id = 'e0000000-0000-4000-8000-000000000001' returning 1
)
select pg_temp.ok(count(*) = 1, 'before/definer code for an admin: event write allowed') from u;
select pg_temp.act_as('b0000000-0000-4000-8000-00000000000d');
with u as (
  update public.events set notes = 'דמו - App Review' where id = 'e0000000-0000-4000-8000-000000000002' returning 1
)
select pg_temp.ok(count(*) = 1, 'before/definer code for the demo account: demo event write allowed') from u;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
with u as (
  update public.events set notes = 'שרת' where id = 'e0000000-0000-4000-8000-000000000001' returning 1
)
select pg_temp.ok(count(*) = 1, 'before/service role and cron (no auth.uid): writes allowed') from u;

-- Edge functions ask with the service role.
set local role service_role;
select pg_temp.ok(public.is_prelaunch_blocked('b0000000-0000-4000-8000-000000000001'),
  'before/server: is_prelaunch_blocked(responder) = true');
select pg_temp.ok(not public.is_prelaunch_blocked('b0000000-0000-4000-8000-00000000000d'),
  'before/server: is_prelaunch_blocked(demo) = false');
select pg_temp.ok(not public.is_prelaunch_blocked(null), 'before/server: is_prelaunch_blocked(null) = false');
reset role;

-- ---------------------------------------------------------------------------
-- After launch: same policies, all inert.
-- ---------------------------------------------------------------------------

create or replace function public.prelaunch_launch_at()
returns timestamptz language sql stable as $$ select timestamptz '2000-01-01 00:00:00+00' $$;

set local role authenticated;

select pg_temp.ok(not pg_temp.gate_blocked('b0000000-0000-4000-8000-000000000001'), 'after: responder is not blocked');
select pg_temp.ok(not pg_temp.gate_blocked('b0000000-0000-4000-8000-000000000002'), 'after: shift lead is not blocked');
select pg_temp.ok(not pg_temp.gate_blocked('b0000000-0000-4000-8000-000000000006'), 'after: user without a role is not blocked');
select pg_temp.ok(not pg_temp.gate_blocked('b0000000-0000-4000-8000-000000000003'), 'after: admin is not blocked');
select pg_temp.ok(not pg_temp.gate_blocked('b0000000-0000-4000-8000-00000000000d'), 'after: demo is not blocked');

select pg_temp.act_as('b0000000-0000-4000-8000-000000000001');
select pg_temp.ok((select count(*) from public.events where id = 'e0000000-0000-4000-8000-000000000001') = 1,
  'after/responder: sees the event they are on');
select pg_temp.ok((select count(*) from public.event_responders) >= 1, 'after/responder: sees their assignment');
select pg_temp.ok((select count(*) from public.vehicles) = 1, 'after/responder: sees their vehicle');
select pg_temp.ok((select count(*) from public.list_unit_contacts()) > 0, 'after/responder: contacts listed');
select pg_temp.ok((select count(*) from public.list_unit_map_pins()) >= 0, 'after/responder: map pins callable');
select pg_temp.ok((select count(*) from public.districts) > 0, 'after/responder: lookups readable');
select pg_temp.lives(
  $$insert into public.user_feedback (user_id, kind, body) values ('b0000000-0000-4000-8000-000000000001', 'bug', 'x')$$,
  'after/responder: can write feedback');
select pg_temp.lives(
  $$select public.upsert_locked_secondary_lead('e0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000007')$$,
  'after/responder: upsert_locked_secondary_lead works again');

select pg_temp.act_as('b0000000-0000-4000-8000-000000000002');
select pg_temp.ok((select count(*) from public.events where id = 'e0000000-0000-4000-8000-000000000001') = 1,
  'after/shift lead: sees own event');
select pg_temp.ok((select count(*) from public.list_shift_lead_profiles()) > 0,
  'after/shift lead: list_shift_lead_profiles works');

select pg_temp.act_as('b0000000-0000-4000-8000-00000000000d');
select pg_temp.ok((select array_agg(id) from public.events) = array['e0000000-0000-4000-8000-000000000002']::uuid[],
  'after/demo: still only the demo event');

-- Automatic unlock on the native apps: same clock, nothing to switch.
select pg_temp.act_as('b0000000-0000-4000-8000-000000000001');
select pg_temp.as_client('swift');
select pg_temp.ok((select count(*) from public.profiles where id = 'b0000000-0000-4000-8000-000000000001') = 1
    and (select count(*) from public.user_roles) = 1
    and (select count(*) from public.events where id = 'e0000000-0000-4000-8000-000000000001') = 1
    and (select count(*) from public.vehicles) = 1,
  'after/responder on iOS: own profile, roles, events and vehicle');
select pg_temp.ok((select count(*) from public.list_unit_contacts()) > 0
    and (select count(*) from public.list_unit_map_pins()) > 0,
  'after/responder on iOS: contacts and map pins return rows');
select pg_temp.as_client('kt');
select pg_temp.ok((select count(*) from public.profiles where id = 'b0000000-0000-4000-8000-000000000001') = 1
    and (select count(*) from public.list_unit_contacts()) > 0,
  'after/responder on Android: own profile and contacts');
select pg_temp.lives(
  $$insert into public.user_feedback (user_id, kind, body) values ('b0000000-0000-4000-8000-000000000001', 'bug', 'מאנדרואיד')$$,
  'after/responder on Android: can write');
select pg_temp.act_as('b0000000-0000-4000-8000-000000000002');
select pg_temp.as_client('swift');
select pg_temp.ok((select count(*) from public.profiles where id = 'b0000000-0000-4000-8000-000000000002') = 1
    and (select count(*) from public.list_shift_lead_profiles()) > 0,
  'after/shift lead on iOS: own profile and lead list');
with u as (
  update public.events set notes = 'אחרי ההשקה' where id = 'e0000000-0000-4000-8000-000000000001' returning 1
)
select pg_temp.ok(count(*) = 1, 'after/shift lead on iOS: can edit own event (write guard passes)') from u;
select pg_temp.as_client('kt');
select pg_temp.lives(
  $$insert into public.event_responders (event_id, responder_id)
    values ('e0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000007')$$,
  'after/shift lead on Android: can assign a responder to own event (write guard passes)');
select pg_temp.as_client('none');

reset role;
set local role service_role;
select pg_temp.ok(not public.is_prelaunch_blocked('b0000000-0000-4000-8000-000000000001'),
  'after/server: is_prelaunch_blocked(responder) = false');
reset role;

-- Back to the shipped launch instant: the gate is in force again exactly while
-- the database clock is before 2026-10-31T22:01:00Z.
create or replace function public.prelaunch_launch_at()
returns timestamptz language sql stable as $$ select timestamptz '2026-10-31 22:01:00+00' $$;
set local role authenticated;
select pg_temp.ok(pg_temp.gate_blocked('b0000000-0000-4000-8000-000000000001') = (now() < timestamptz '2026-10-31 22:01:00+00'),
  'restored launch value: responder gated now iff the DB clock is before launch');
select pg_temp.act_as('b0000000-0000-4000-8000-000000000001');
select pg_temp.as_client('swift');
select pg_temp.ok(((select count(*) from public.profiles where id = 'b0000000-0000-4000-8000-000000000001') = 0)
    = (now() < timestamptz '2026-10-31 22:01:00+00'),
  'restored launch value: iOS sign-in refused again iff before launch');
select pg_temp.as_client('none');
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
