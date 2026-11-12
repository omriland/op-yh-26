-- Self-service account deletion (supabase/migrations/20261103180000_account_deletion.sql).
-- Plain SQL, no pgTAP. Runs on a LOCAL database only:
--   scripts/app-review-demo/test/run-local-db.sh scripts/delete-account/test/delete-account.sql
-- One transaction, rolled back at the end. Prints "ok N - ..." per check and
-- fails with a non-zero exit if any check fails.

\set QUIET on
\o /dev/null
set client_min_messages = notice;
begin;

-- The deploy workflow re-applies the migration on every push: it must replay
-- cleanly on top of itself.
\ir ../../../supabase/migrations/20261103180000_account_deletion.sql
-- That replay restores the older body; this file puts back "tasks survive".
\ir ../../../supabase/migrations/20261105121000_keep_tasks_on_account_deletion.sql
-- And this one switches the task/feedback split from title to kind.
\ir ../../../supabase/migrations/20261109120000_feedback_card_title.sql

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

-- Passes when p_sql raises; p_message, when given, must be the error text.
create function pg_temp.throws(p_sql text, p_message text, p_label text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    perform pg_temp.ok(p_message is null or sqlerrm = p_message,
      case when p_message is null or sqlerrm = p_message
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
-- Fixtures, written as postgres (no JWT, RLS bypassed).
--   R responder to delete · X responder who must stay untouched · L shift lead
--   A1 only admin · SA super admin · D App Review demo
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('c0000000-0000-4000-8000-000000000001', 'r@del.local',  '{"full_name":"מתנדב למחיקה","callsign":"D-R","phone":"0501000001"}'),
  ('c0000000-0000-4000-8000-000000000002', 'l@del.local',  '{"full_name":"אחמש","callsign":"D-L"}'),
  ('c0000000-0000-4000-8000-000000000003', 'a1@del.local', '{"full_name":"מנהל יחיד","callsign":"D-A1"}'),
  ('c0000000-0000-4000-8000-000000000004', 'sa@del.local', '{"full_name":"מנהל על","callsign":"D-SA"}'),
  ('c0000000-0000-4000-8000-000000000005', 'd@del.local',  '{"full_name":"App Review דמו","callsign":"D-D"}'),
  ('c0000000-0000-4000-8000-000000000007', 'x@del.local',  '{"full_name":"מתנדב שנשאר","callsign":"D-X","phone":"0501000007"}');
insert into auth.sessions (user_id) values
  ('c0000000-0000-4000-8000-000000000001'),
  ('c0000000-0000-4000-8000-000000000001'),
  ('c0000000-0000-4000-8000-000000000007');

update public.profiles set is_app_review_demo = true, phone = null
where id = 'c0000000-0000-4000-8000-000000000005';
update public.profiles set availability = 'unavailable', available_from = current_date + 30
where id = 'c0000000-0000-4000-8000-000000000001';
set local yahpaz.reporting_android_session = '1';
update public.profiles set last_android_seen_at = now(), last_android_version_code = 66, last_android_version_name = '0.3.52'
where id = 'c0000000-0000-4000-8000-000000000001';
reset yahpaz.reporting_android_session;

insert into public.user_roles (user_id, role) values
  ('c0000000-0000-4000-8000-000000000001', 'responder'),
  ('c0000000-0000-4000-8000-000000000002', 'shift_lead'),
  ('c0000000-0000-4000-8000-000000000003', 'admin'),
  ('c0000000-0000-4000-8000-000000000004', 'super_admin'),
  ('c0000000-0000-4000-8000-000000000005', 'responder'),
  ('c0000000-0000-4000-8000-000000000007', 'responder');

insert into public.vehicles (id, user_id, plate_number, model) values
  ('7e000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', '1234567', 'רכב פרטי'),
  ('7e000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001', '7654321', 'רכב שני'),
  ('7e000000-0000-4000-8000-000000000007', 'c0000000-0000-4000-8000-000000000007', '1112223', 'רכב של X');

insert into public.events (id, shift_lead_id, police_event_id, is_cancelled) values
  ('e1000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000002', '8001', false),
  ('e1000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000002', '8002', true);
insert into public.event_responders (id, event_id, responder_id) values
  ('e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001'),
  ('e2000000-0000-4000-8000-000000000007', 'e1000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000007');
insert into public.event_responder_live_locations (event_responder_id, lat, lng, recorded_at) values
  ('e2000000-0000-4000-8000-000000000001', 32.1, 34.9, now()),
  ('e2000000-0000-4000-8000-000000000007', 32.2, 34.8, now());

insert into public.shifts (id, shift_lead_id, vehicle_type, personal_vehicle_id) values
  ('5c000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000002', 'patrol_north', '7e000000-0000-4000-8000-000000000001');
insert into public.shift_responders (shift_id, responder_id) values
  ('5c000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001'),
  ('5c000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000007');

insert into public.user_addresses (user_id, kind, formatted_address, place_id, lat, lng) values
  ('c0000000-0000-4000-8000-000000000001', 'home', 'רחוב הבדיקה 1', 'place-r', 32.1, 34.9),
  ('c0000000-0000-4000-8000-000000000007', 'home', 'רחוב הבדיקה 7', 'place-x', 32.2, 34.8);
insert into public.device_tokens (user_id, token, platform, environment) values
  ('c0000000-0000-4000-8000-000000000001', 'tok-r', 'ios', 'production'),
  ('c0000000-0000-4000-8000-000000000007', 'tok-x', 'ios', 'production');
insert into public.ios_devices (user_id, udid, membership_year) values
  ('c0000000-0000-4000-8000-000000000001', '00008110-000A1B2C3D4E5F60', 2026);
insert into public.ios_enroll_tokens (token, user_id, expires_at) values
  ('enroll-r', 'c0000000-0000-4000-8000-000000000001', now() + interval '1 day');
insert into public.otp_device_trust (user_id, device_key_hash, trusted_until) values
  ('c0000000-0000-4000-8000-000000000001', 'h', now() + interval '1 day');
insert into public.otp_step_up (user_id, purpose, valid_until) values
  ('c0000000-0000-4000-8000-000000000001', 'users_page', now() + interval '1 day');
insert into public.otp_challenges (user_id, purpose, code_hash, expires_at) values
  ('c0000000-0000-4000-8000-000000000001', 'login_device', 'h', now() + interval '1 day');
insert into public.user_presence (user_id, last_active_at) values
  ('c0000000-0000-4000-8000-000000000001', now());
insert into public.my_active_event_prefs (user_id, event_id, kind) values
  ('c0000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'pin');
insert into public.oauth_clients (id, name, client_id, client_secret_hash, telegram_bot_username) values
  ('0c000000-0000-4000-8000-000000000001', 'בוט בדיקה', 'client-1', 'h', 'test_bot');
insert into public.oauth_authorization_codes (client_id, user_id, code_hash, redirect_uri, expires_at) values
  ('0c000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'h', 'https://example.invalid/cb', now() + interval '1 hour');
insert into public.oauth_access_tokens (client_id, user_id, token_hash, expires_at) values
  ('0c000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'h', now() + interval '1 hour');

insert into public.user_feedback (user_id, kind, body, audio_storage_path, audio_mime_type, audio_byte_size, attachments) values
  ('c0000000-0000-4000-8000-000000000001', 'bug', 'משוב', 'c0000000-0000-4000-8000-000000000001/voice.webm', 'audio/webm', 100,
   '[{"path":"c0000000-0000-4000-8000-000000000001/shot.jpg","mime":"image/jpeg","name":"shot.jpg","size":10}]'),
  ('c0000000-0000-4000-8000-000000000007', 'suggestion', 'משוב של X', null, null, null, '[]');
-- A task R opened on the משוב board (20261105120000) while still a super admin.
insert into public.user_feedback (id, user_id, kind, title, body) values
  ('f7000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', null, 'משימה של R', 'פירוט');
insert into public.event_media (event_id, uploaded_by, taken_when, storage_path, mime_type, byte_size) values
  ('e1000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'before_treatment', 'e1000000-0000-4000-8000-000000000001/r1.jpg', 'image/jpeg', 100),
  ('e1000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000007', 'before_treatment', 'e1000000-0000-4000-8000-000000000001/x1.jpg', 'image/jpeg', 100);
-- Media on an event that was cancelled afterwards (the cancelled-event guard
-- normally refuses any write to it).
update public.events set is_cancelled = false where id = 'e1000000-0000-4000-8000-000000000002';
insert into public.event_media (event_id, uploaded_by, taken_when, storage_path, mime_type, byte_size) values
  ('e1000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001', 'before_treatment', 'e1000000-0000-4000-8000-000000000002/r2.jpg', 'image/jpeg', 100),
  ('e1000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000007', 'before_treatment', 'e1000000-0000-4000-8000-000000000002/x2.jpg', 'image/jpeg', 100);
update public.events set is_cancelled = true where id = 'e1000000-0000-4000-8000-000000000002';

insert into public.impersonation_audit (actor_user_id, target_user_id, action) values
  ('c0000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000001', 'started');

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

select pg_temp.ok(not exists (
  select 1 from pg_constraint where conname = 'profiles_id_fkey' and conrelid = 'public.profiles'::regclass),
  'profiles no longer cascades from auth.users (the anonymized profile survives)');
select pg_temp.ok(exists (
  select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'deleted_at'),
  'profiles.deleted_at exists');
select pg_temp.ok(exists (
  select 1 from information_schema.columns where table_schema = 'public' and table_name = 'impersonation_audit' and column_name = 'session_id'),
  'impersonation_audit.session_id exists');

-- ---------------------------------------------------------------------------
-- Who may call it
-- ---------------------------------------------------------------------------

select pg_temp.ok(not has_function_privilege('authenticated', 'public.delete_user_account(uuid)', 'execute'),
  'authenticated cannot execute delete_user_account');
select pg_temp.ok(not has_function_privilege('anon', 'public.delete_user_account(uuid)', 'execute'),
  'anon cannot execute delete_user_account');
select pg_temp.ok(has_function_privilege('service_role', 'public.delete_user_account(uuid)', 'execute'),
  'service_role can execute delete_user_account');

select pg_temp.act_as('c0000000-0000-4000-8000-000000000001');
select pg_temp.throws($$select public.delete_user_account('c0000000-0000-4000-8000-000000000007')$$,
  'server_only', 'a caller with an end-user JWT is refused even through a definer path');
select set_config('request.jwt.claims', '', true);

-- ---------------------------------------------------------------------------
-- Refusals
-- ---------------------------------------------------------------------------

select pg_temp.throws($$select public.delete_user_account('c0000000-0000-4000-8000-0000000000ff')$$,
  'account_not_found', 'unknown user is refused');
select pg_temp.throws($$select public.delete_user_account('c0000000-0000-4000-8000-000000000004')$$,
  'account_is_super_admin', 'super admin is refused');
select pg_temp.throws($$select public.delete_user_account('c0000000-0000-4000-8000-000000000003')$$,
  'account_is_last_admin', 'the only admin is refused');
select pg_temp.ok((select count(*) from auth.users where id = 'c0000000-0000-4000-8000-000000000003') = 1
  and (select active from public.profiles where id = 'c0000000-0000-4000-8000-000000000003'),
  'refused admin is untouched');

-- ---------------------------------------------------------------------------
-- App Review demo: simulated, nothing changes
-- ---------------------------------------------------------------------------

select pg_temp.ok(public.delete_user_account('c0000000-0000-4000-8000-000000000005') ->> 'status' = 'simulated',
  'demo account deletion is simulated');
select pg_temp.ok(
  (select count(*) from auth.users where id = 'c0000000-0000-4000-8000-000000000005') = 1
  and (select full_name = 'App Review דמו' and active and deleted_at is null and is_app_review_demo
       from public.profiles where id = 'c0000000-0000-4000-8000-000000000005')
  and (select count(*) from public.user_roles where user_id = 'c0000000-0000-4000-8000-000000000005') = 1,
  'demo account, profile and role are unchanged');

-- ---------------------------------------------------------------------------
-- Real deletion of R
-- ---------------------------------------------------------------------------

create temp table r_result as
select public.delete_user_account('c0000000-0000-4000-8000-000000000001') as r;

select pg_temp.ok((select r ->> 'status' from r_result) = 'deleted', 'R deletion returns status deleted');
select pg_temp.ok(
  (select jsonb_agg(f order by f ->> 'bucket', f ->> 'path') from r_result, jsonb_array_elements(r -> 'storage') f)
  = '[{"bucket":"event-media","path":"e1000000-0000-4000-8000-000000000001/r1.jpg"},
      {"bucket":"event-media","path":"e1000000-0000-4000-8000-000000000002/r2.jpg"},
      {"bucket":"user-feedback","path":"c0000000-0000-4000-8000-000000000001/shot.jpg"},
      {"bucket":"user-feedback","path":"c0000000-0000-4000-8000-000000000001/voice.webm"}]'::jsonb,
  'returns exactly R''s media and feedback files for storage removal');

select pg_temp.ok((select count(*) from auth.users where id = 'c0000000-0000-4000-8000-000000000001') = 0,
  'R auth user is deleted');
select pg_temp.ok((select count(*) from auth.sessions where user_id = 'c0000000-0000-4000-8000-000000000001') = 0,
  'R sessions are gone');

select pg_temp.ok((
  select full_name = 'משתמש שנמחק'
     and email = 'deleted+c0000000-0000-4000-8000-000000000001@deleted.invalid'
     and callsign = 'נמחק-000000000001'
     and phone is null and not active and deleted_at is not null
     and not invite_pending and invite_token is null and invite_token_expires_at is null
     and not must_change_password and not otp_login_enabled and not otp_users_page_enabled
     and availability = 'unavailable' and available_from is null
     and last_android_seen_at is null and last_android_version_code is null and last_android_version_name is null
  from public.profiles where id = 'c0000000-0000-4000-8000-000000000001'),
  'R profile is kept but anonymized and inactive');

select pg_temp.ok((select count(*) from public.user_roles where user_id = 'c0000000-0000-4000-8000-000000000001') = 0, 'R roles removed');
select pg_temp.ok((select count(*) from public.vehicles where user_id = 'c0000000-0000-4000-8000-000000000001') = 0, 'R vehicles removed');
select pg_temp.ok((select personal_vehicle_id is null from public.shifts where id = '5c000000-0000-4000-8000-000000000001'),
  'shift no longer points at R''s deleted vehicle');
select pg_temp.ok((select count(*) from public.user_addresses where user_id = 'c0000000-0000-4000-8000-000000000001') = 0, 'R addresses removed');
select pg_temp.ok((select count(*) from public.device_tokens where user_id = 'c0000000-0000-4000-8000-000000000001') = 0, 'R push tokens removed');
select pg_temp.ok((select count(*) from public.ios_devices where user_id = 'c0000000-0000-4000-8000-000000000001') = 0
  and (select count(*) from public.ios_enroll_tokens where user_id = 'c0000000-0000-4000-8000-000000000001') = 0,
  'R iOS devices and enroll tokens removed');
select pg_temp.ok((select count(*) from public.otp_device_trust where user_id = 'c0000000-0000-4000-8000-000000000001') = 0
  and (select count(*) from public.otp_step_up where user_id = 'c0000000-0000-4000-8000-000000000001') = 0
  and (select count(*) from public.otp_challenges where user_id = 'c0000000-0000-4000-8000-000000000001') = 0,
  'R OTP rows removed');
select pg_temp.ok((select count(*) from public.user_presence where user_id = 'c0000000-0000-4000-8000-000000000001') = 0, 'R presence removed');
select pg_temp.ok((select count(*) from public.oauth_authorization_codes where user_id = 'c0000000-0000-4000-8000-000000000001') = 0
  and (select count(*) from public.oauth_access_tokens where user_id = 'c0000000-0000-4000-8000-000000000001') = 0,
  'R OAuth codes and tokens removed');
select pg_temp.ok((select count(*) from public.my_active_event_prefs where user_id = 'c0000000-0000-4000-8000-000000000001') = 0, 'R event prefs removed');
select pg_temp.ok((select count(*) from public.user_feedback where user_id = 'c0000000-0000-4000-8000-000000000001' and kind is not null) = 0, 'R feedback removed');
select pg_temp.ok((
  select f.title = 'משימה של R' and f.body = 'פירוט' and p.full_name = 'משתמש שנמחק'
  from public.user_feedback f
  join public.profiles p on p.id = f.user_id
  where f.id = 'f7000000-0000-4000-8000-000000000001'),
  'a task R opened stays, credited to the anonymized profile');
select pg_temp.ok((select count(*) from public.event_media where uploaded_by = 'c0000000-0000-4000-8000-000000000001') = 0,
  'R media removed, including media on a cancelled event');
select pg_temp.ok((select count(*) from public.event_responder_live_locations where event_responder_id = 'e2000000-0000-4000-8000-000000000001') = 0,
  'R live locations removed');

-- Operational records stay valid and point at the anonymized profile.
select pg_temp.ok((select count(*) from public.event_responders where responder_id = 'c0000000-0000-4000-8000-000000000001') = 1,
  'R event participation is kept');
select pg_temp.ok((select count(*) from public.shift_responders where responder_id = 'c0000000-0000-4000-8000-000000000001') = 1,
  'R shift participation is kept');
select pg_temp.ok((select count(*) from public.impersonation_audit where target_user_id = 'c0000000-0000-4000-8000-000000000001') = 1,
  'audit rows about R are kept');

-- Nobody else is touched.
select pg_temp.ok(
  (select count(*) from auth.users where id = 'c0000000-0000-4000-8000-000000000007') = 1
  and (select count(*) from auth.sessions where user_id = 'c0000000-0000-4000-8000-000000000007') = 1
  and (select full_name = 'מתנדב שנשאר' and phone = '0501000007' and active from public.profiles where id = 'c0000000-0000-4000-8000-000000000007')
  and (select count(*) from public.vehicles where user_id = 'c0000000-0000-4000-8000-000000000007') = 1
  and (select count(*) from public.user_addresses where user_id = 'c0000000-0000-4000-8000-000000000007') = 1
  and (select count(*) from public.device_tokens where user_id = 'c0000000-0000-4000-8000-000000000007') = 1
  and (select count(*) from public.user_feedback where user_id = 'c0000000-0000-4000-8000-000000000007') = 1
  and (select count(*) from public.event_media where uploaded_by = 'c0000000-0000-4000-8000-000000000007') = 2
  and (select count(*) from public.event_responder_live_locations where event_responder_id = 'e2000000-0000-4000-8000-000000000007') = 1,
  'X (another member) is untouched');

select pg_temp.ok((select is_cancelled from public.events where id = 'e1000000-0000-4000-8000-000000000002'),
  'the cancelled event is still cancelled');
select pg_temp.throws($$delete from public.event_media where event_id = 'e1000000-0000-4000-8000-000000000002'$$,
  null, 'the cancelled-event media guard still holds outside account deletion');

select pg_temp.throws($$select public.delete_user_account('c0000000-0000-4000-8000-000000000001')$$,
  'account_already_deleted', 'deleting R again is refused');

-- ---------------------------------------------------------------------------
-- A shift lead can delete their account; their events and shifts stay valid
-- ---------------------------------------------------------------------------

select pg_temp.ok(public.delete_user_account('c0000000-0000-4000-8000-000000000002') ->> 'status' = 'deleted',
  'shift lead L can be deleted');
select pg_temp.ok(
  (select count(*) from public.events where shift_lead_id = 'c0000000-0000-4000-8000-000000000002') = 2
  and (select count(*) from public.shifts where shift_lead_id = 'c0000000-0000-4000-8000-000000000002') = 1
  and (select full_name from public.profiles where id = 'c0000000-0000-4000-8000-000000000002') = 'משתמש שנמחק',
  'L''s events and shift keep pointing at the anonymized profile');

-- ---------------------------------------------------------------------------
-- Admin: refused while last, allowed once another admin exists
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('c0000000-0000-4000-8000-000000000006', 'a2@del.local', '{"full_name":"מנהל שני","callsign":"D-A2"}');
insert into public.user_roles (user_id, role) values ('c0000000-0000-4000-8000-000000000006', 'admin');
select pg_temp.ok(public.delete_user_account('c0000000-0000-4000-8000-000000000003') ->> 'status' = 'deleted',
  'an admin can be deleted when another active admin remains');
select pg_temp.throws($$select public.delete_user_account('c0000000-0000-4000-8000-000000000006')$$,
  'account_is_last_admin', 'the remaining admin is now the last one and is refused');

-- ---------------------------------------------------------------------------

do $$
begin
  if coalesce(nullif(current_setting('test.failed', true), ''), '0')::int > 0 then
    raise exception '% of % checks failed', current_setting('test.failed'), current_setting('test.n');
  end if;
  raise notice 'all % checks passed', current_setting('test.n');
end
$$;

rollback;
