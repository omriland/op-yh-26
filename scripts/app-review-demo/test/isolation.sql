-- App Review demo isolation (supabase/migrations/20261029120000_app_review_demo_isolation.sql).
-- Plain SQL, no pgTAP. Runs on a LOCAL database only (run-local-db.sh).
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

-- Passes when p_sql raises; p_state / p_msg, when given, must match.
create function pg_temp.throws(p_sql text, p_state text, p_msg text, p_label text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    perform pg_temp.ok(
      (p_state is null or sqlstate = p_state) and (p_msg is null or sqlerrm = p_msg),
      case when (p_state is null or sqlstate = p_state) and (p_msg is null or sqlerrm = p_msg)
        then p_label else format('%s (got %s: %s)', p_label, sqlstate, sqlerrm) end
    );
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

-- ---------------------------------------------------------------------------
-- Fixtures, written as postgres (no JWT, RLS bypassed).
--   R1, R2 real responders · L, L2 real shift leads · A real admin + super admin
--   D demo account (signs in) · DL demo lead placeholder
--   E1 real event · E2 demo event · S1 real shift · S2 demo shift
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-4111-8111-111111111111', 'r1@test.local', '{"full_name":"מתנדב אחד","callsign":"T-R1","phone":"0501111111"}'),
  ('22222222-2222-4222-8222-222222222222', 'r2@test.local', '{"full_name":"מתנדב שניים","callsign":"T-R2","phone":"0502222222"}'),
  ('33333333-3333-4333-8333-333333333333', 'l@test.local',  '{"full_name":"אחמש אמיתי","callsign":"T-L","phone":"0503333333"}'),
  ('35353535-3535-4353-8353-353535353535', 'l2@test.local', '{"full_name":"אחמש נוסף","callsign":"T-L2"}'),
  ('44444444-4444-4444-8444-444444444444', 'a@test.local',  '{"full_name":"מנהל","callsign":"T-A"}'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'demo@test.local', '{"full_name":"App Review דמו","callsign":"DEMO-1"}'),
  ('d1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1', 'demo-lead@test.local', '{"full_name":"אחמ״ש דמו","callsign":"DEMO-LEAD"}');

update public.profiles set is_app_review_demo = true
where id in ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'd1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1');

insert into public.user_roles (user_id, role) values
  ('11111111-1111-4111-8111-111111111111', 'responder'),
  ('22222222-2222-4222-8222-222222222222', 'responder'),
  ('33333333-3333-4333-8333-333333333333', 'shift_lead'),
  ('35353535-3535-4353-8353-353535353535', 'shift_lead'),
  ('44444444-4444-4444-8444-444444444444', 'admin'),
  ('44444444-4444-4444-8444-444444444444', 'super_admin'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'responder'),
  ('d1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1', 'responder');

insert into public.events (id, shift_lead_id, police_event_id, notes, is_demo) values
  ('e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', '33333333-3333-4333-8333-333333333333', '9001', 'אירוע אמיתי', false),
  ('e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2', 'd1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1', '4127', 'דמו - App Review', true);

insert into public.event_responders (id, event_id, responder_id) values
  ('a1a1a1a1-0000-4000-8000-000000000001', 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', '11111111-1111-4111-8111-111111111111'),
  ('a1a1a1a1-0000-4000-8000-000000000002', 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', '22222222-2222-4222-8222-222222222222'),
  ('a2a2a2a2-0000-4000-8000-000000000001', 'e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd');

insert into public.shifts (id, shift_lead_id, vehicle_type, is_demo) values
  ('5a5a5a5a-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333', 'patrol_north', false),
  ('5a5a5a5a-0000-4000-8000-000000000002', 'd1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1', 'patrol_north', true);

insert into public.shift_responders (shift_id, responder_id) values
  ('5a5a5a5a-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111'),
  ('5a5a5a5a-0000-4000-8000-000000000002', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd');

insert into public.user_addresses (user_id, kind, formatted_address, place_id, lat, lng) values
  ('11111111-1111-4111-8111-111111111111', 'home', 'כתובת אמיתית', 'real-place', 32.08, 34.78),
  ('d1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1', 'home', 'דמו - App Review', 'demo-place', 32.1, 34.8);

insert into public.vehicles (user_id, plate_number, model) values
  ('11111111-1111-4111-8111-111111111111', '1234567', 'רכב אמיתי'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '7654321', 'רכב דמו');

insert into public.user_feedback (user_id, kind, body) values
  ('11111111-1111-4111-8111-111111111111', 'bug', 'משוב אמיתי'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'suggestion', 'משוב דמו');

insert into public.event_treated_plates (event_responder_id, plate_number) values
  ('a1a1a1a1-0000-4000-8000-000000000001', '1111111'),
  ('a2a2a2a2-0000-4000-8000-000000000001', '2222222');

insert into public.event_media (event_id, uploaded_by, taken_when, storage_path, mime_type, byte_size) values
  ('e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', '11111111-1111-4111-8111-111111111111', 'before_treatment',
   'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1/0e0e0e0e-0000-4000-8000-000000000001.jpg', 'image/jpeg', 10),
  ('e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'before_treatment',
   'e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2/0e0e0e0e-0000-4000-8000-000000000002.jpg', 'image/jpeg', 10);

-- Photo-to-plate links: each event's photo with that event's treated plate.
insert into public.event_media_plates (media_id, treated_plate_id)
select m.id, tp.id
from public.event_media m
join public.event_responders er on er.event_id = m.event_id
join public.event_treated_plates tp on tp.event_responder_id = er.id;

insert into storage.objects (bucket_id, name) values
  ('event-media', 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1/0e0e0e0e-0000-4000-8000-000000000001.jpg'),
  ('event-media', 'e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2/0e0e0e0e-0000-4000-8000-000000000002.jpg');

-- ---------------------------------------------------------------------------
-- Demo account D: demo rows only, cannot reach real people.
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('dddddddd-dddd-4ddd-8ddd-dddddddddddd');

select pg_temp.ok((select array_agg(id) from public.events) = array['e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2']::uuid[],
  'demo: events = the demo event only');
select pg_temp.ok((select array_agg(distinct event_id) from public.event_responders) = array['e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2']::uuid[],
  'demo: assignments = the demo event only');
select pg_temp.ok((select array_agg(id) from public.shifts) = array['5a5a5a5a-0000-4000-8000-000000000002']::uuid[],
  'demo: shifts = the demo shift only');
select pg_temp.ok((select array_agg(shift_id) from public.shift_responders) = array['5a5a5a5a-0000-4000-8000-000000000002']::uuid[],
  'demo: shift assignments = the demo shift only');
select pg_temp.ok((select array_agg(id order by id) from public.profiles)
  = array['d1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd']::uuid[],
  'demo: profiles = demo profiles only');
select pg_temp.ok((select count(*) from public.profiles where id = '11111111-1111-4111-8111-111111111111') = 0,
  'demo: cannot read a real profile by id');
select pg_temp.ok((select array_agg(id) from public.list_unit_contacts()) = array['d1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1']::uuid[],
  'demo: list_unit_contacts = demo members only');
select pg_temp.ok((select array_agg(user_id) from public.list_unit_map_pins()) = array['d1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1']::uuid[],
  'demo: list_unit_map_pins = demo pins only');
select pg_temp.ok((select array_agg(user_id) from public.vehicles) = array['dddddddd-dddd-4ddd-8ddd-dddddddddddd']::uuid[],
  'demo: vehicles = own demo vehicle only');
select pg_temp.ok((select count(*) from public.user_addresses) = 0, 'demo: no real addresses');
select pg_temp.ok((select array_agg(role::text) from public.user_roles) = array['responder'],
  'demo: user_roles = own role only');
select pg_temp.ok((select array_agg(body) from public.user_feedback) = array['משוב דמו'],
  'demo: feedback = own only');
select pg_temp.ok((select array_agg(event_responder_id) from public.event_treated_plates) = array['a2a2a2a2-0000-4000-8000-000000000001']::uuid[],
  'demo: treated plates = demo event only');
select pg_temp.ok((select array_agg(event_id) from public.event_media) = array['e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2']::uuid[],
  'demo: event media = demo event only');
select pg_temp.ok((select array_agg(name) from storage.objects where bucket_id = 'event-media')
  = array['e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2/0e0e0e0e-0000-4000-8000-000000000002.jpg'],
  'demo: event-media storage = demo event only');
select pg_temp.ok((select count(*) from public.event_secondary_leads) = 0, 'demo: no secondary-lead rows');
select pg_temp.ok((select array_agg(m.event_id) from public.event_media_plates mp join public.event_media m on m.id = mp.media_id)
  = array['e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2']::uuid[],
  'demo: photo-plate links = demo event only (via event_media)');

select pg_temp.throws(
  $$update public.profiles set is_app_review_demo = false where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'$$,
  'P0001', 'סימון חשבון דמו ניתן לשינוי רק דרך השרת', 'demo: cannot clear its own flag');
select pg_temp.throws(
  $$update public.profiles set phone = '0509999999' where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'$$,
  'P0001', 'לחשבון דמו אין מספר טלפון', 'demo: cannot add a phone (no SMS path)');
select pg_temp.lives(
  $$update public.profiles set availability = 'available' where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'$$,
  'demo: can still edit its own profile');
select pg_temp.lives($$select public.upsert_device_token('demo-device-token-0000000001', 'ios', 'production')$$,
  'demo: push registration RPC returns without error');
select pg_temp.throws(
  $$insert into public.device_tokens (user_id, token, platform, environment)
    values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'demo-device-token-0000000002', 'ios', 'production')$$,
  '42501', null, 'demo: cannot write a push token directly');
select pg_temp.throws($$select public.mint_ios_enroll_token()$$, 'P0001', 'forbidden',
  'demo: cannot mint an iOS enrollment token');
select pg_temp.lives(
  $$select public.upsert_locked_secondary_lead('e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', '35353535-3535-4353-8353-353535353535')$$,
  'demo: secondary-lead RPC returns without error');
select pg_temp.throws($$select public.default_vehicle_plate_for_user('11111111-1111-4111-8111-111111111111')$$,
  '42501', null, 'demo: cannot read a member''s plate by id');
select pg_temp.throws(
  $$insert into public.event_responders (event_id, responder_id)
    values ('e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd')$$,
  '42501', null, 'demo: cannot assign anyone');
select pg_temp.throws(
  $$insert into public.user_roles (user_id, role) values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'shift_lead')$$,
  'P0001', 'חשבון דמו חייב להיות מתנדב בלבד', 'demo: cannot grant itself a lead role');

-- ---------------------------------------------------------------------------
-- Real responder R1: real rows as before, no demo rows.
-- ---------------------------------------------------------------------------

select pg_temp.act_as('11111111-1111-4111-8111-111111111111');

select pg_temp.ok((select array_agg(id) from public.events) = array['e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1']::uuid[],
  'real responder: sees the real event');
select pg_temp.ok((select array_agg(id order by id) from public.list_unit_contacts())
  = array['22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333',
          '35353535-3535-4353-8353-353535353535', '44444444-4444-4444-8444-444444444444']::uuid[],
  'real responder: contacts = real members, no demo');
select pg_temp.ok((select array_agg(user_id) from public.list_unit_map_pins()) = array['11111111-1111-4111-8111-111111111111']::uuid[],
  'real responder: map pins = real pins, no demo');
select pg_temp.ok((select count(*) from public.profiles where is_app_review_demo) = 0,
  'real responder: no demo profiles');

-- ---------------------------------------------------------------------------
-- Real shift lead L: every real row, no demo row, cannot mix the two.
-- ---------------------------------------------------------------------------

select pg_temp.act_as('33333333-3333-4333-8333-333333333333');

select pg_temp.ok((select array_agg(id) from public.events) = array['e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1']::uuid[],
  'lead: sees real events, not the demo event');
select pg_temp.ok((select count(*) from public.event_responders) = 2, 'lead: sees every real assignment, no demo one');
select pg_temp.ok((select array_agg(id) from public.shifts) = array['5a5a5a5a-0000-4000-8000-000000000001']::uuid[],
  'lead: sees real shifts, not the demo shift');
select pg_temp.ok((select array_agg(event_responder_id) from public.event_treated_plates) = array['a1a1a1a1-0000-4000-8000-000000000001']::uuid[],
  'lead: treated plates = real only');
select pg_temp.ok((select array_agg(name) from storage.objects where bucket_id = 'event-media')
  = array['e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1/0e0e0e0e-0000-4000-8000-000000000001.jpg'],
  'lead: event-media storage = real only');
select pg_temp.ok((select count(*) from public.search_unit_event_ids('4127', null)) = 0,
  'lead: event search does not surface the demo event');
select pg_temp.ok((select count(*) from public.event_media_plates) = 1,
  'lead: photo-plate links = real only (via event_media)');
select pg_temp.ok((select count(*) from public.search_unit_event_ids('9001', null)) = 1,
  'lead: event search still finds real events');
select pg_temp.throws(
  $$insert into public.event_responders (event_id, responder_id)
    values ('e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd')$$,
  'P0001', 'חשבון דמו (App Review) ונתוני דמו מקושרים רק זה לזה.',
  'lead: cannot assign the demo account to a real event');
select pg_temp.throws(
  $$insert into public.events (shift_lead_id, is_demo) values ('33333333-3333-4333-8333-333333333333', true)$$,
  'P0001', null, 'lead: cannot create a demo-labelled event');
select pg_temp.lives(
  $$insert into public.event_responders (event_id, responder_id)
    values ('e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', '35353535-3535-4353-8353-353535353535')$$,
  'lead: can still assign a real member to a real event');
select pg_temp.lives(
  $$insert into public.events (shift_lead_id, police_event_id) values ('33333333-3333-4333-8333-333333333333', '4127')$$,
  'lead: a real event can reuse the demo event''s number on the same day');
select pg_temp.throws(
  $$insert into public.events (shift_lead_id, police_event_id) values ('33333333-3333-4333-8333-333333333333', '9001')$$,
  '23505', null, 'lead: a real same-day duplicate number is still rejected');

-- ---------------------------------------------------------------------------
-- Real admin + super admin A.
-- ---------------------------------------------------------------------------

select pg_temp.act_as('44444444-4444-4444-8444-444444444444');

select pg_temp.ok((select count(*) from public.profiles) = 5 and (select count(*) from public.profiles where is_app_review_demo) = 0,
  'admin: every real profile, no demo profile');
select pg_temp.ok((select count(*) from public.user_roles where user_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd') = 0,
  'admin: demo roles hidden');
select pg_temp.ok((select array_agg(body) from public.user_feedback) = array['משוב אמיתי'],
  'super admin: feedback inbox has no demo feedback');
select pg_temp.ok((select count(*) from public.event_audit where event_id = 'e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2') = 0
  and (select count(*) from public.event_audit where event_id = 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1') > 0,
  'admin: audit shows the real event, not the demo event');
select pg_temp.throws(
  $$update public.profiles set is_app_review_demo = true where id = '22222222-2222-4222-8222-222222222222'$$,
  'P0001', 'סימון חשבון דמו ניתן לשינוי רק דרך השרת', 'admin: cannot flag a member as demo');
select pg_temp.throws(
  $$insert into public.user_roles (user_id, role) values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'admin')$$,
  'P0001', 'חשבון דמו חייב להיות מתנדב בלבד', 'admin: cannot make the demo account an admin');

-- ---------------------------------------------------------------------------
-- Server side (service role / no JWT): guards still hold.
-- ---------------------------------------------------------------------------

reset role;
select set_config('request.jwt.claims', '', true);

select pg_temp.throws(
  $$update public.profiles set is_app_review_demo = true where id = '22222222-2222-4222-8222-222222222222'$$,
  'P0001', 'לחשבון דמו אין מספר טלפון', 'server: a flagged account cannot keep a phone');
select pg_temp.throws(
  $$update public.profiles set is_app_review_demo = true where id = '35353535-3535-4353-8353-353535353535'$$,
  'P0001', 'חשבון דמו חייב להיות מתנדב בלבד', 'server: a lead cannot be flagged');
select pg_temp.throws(
  $$insert into public.user_roles (user_id, role) values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'shift_lead')$$,
  'P0001', 'חשבון דמו חייב להיות מתנדב בלבד', 'server: demo account stays responder-only');
select pg_temp.throws(
  $$insert into public.events (shift_lead_id, is_demo) values ('33333333-3333-4333-8333-333333333333', true)$$,
  'P0001', 'חשבון דמו (App Review) ונתוני דמו מקושרים רק זה לזה.', 'server: a demo event needs a demo lead');
select pg_temp.throws(
  $$insert into public.event_responders (event_id, responder_id)
    values ('e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2', '11111111-1111-4111-8111-111111111111')$$,
  'P0001', 'חשבון דמו (App Review) ונתוני דמו מקושרים רק זה לזה.', 'server: a real member cannot join a demo event');
with ins as (
  insert into public.events (shift_lead_id, origin, shift_id)
  values ('d1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1', 'shift', '5a5a5a5a-0000-4000-8000-000000000002')
  returning is_demo
)
select pg_temp.ok((select is_demo from ins), 'server: shift-born events inherit the demo label');
select pg_temp.throws(
  $$insert into public.oauth_authorization_codes (client_id, user_id, code_hash, redirect_uri, expires_at)
    values (gen_random_uuid(), 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'x', 'x', now())$$,
  'P0001', 'חשבון דמו אינו יכול לחבר אפליקציה חיצונית', 'server: demo account cannot link a partner app');
select pg_temp.ok((select count(*) from public.device_tokens where user_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd') = 0,
  'server: no push token was stored for the demo account');
select pg_temp.ok((select count(*) from public.event_secondary_leads
  where event_id = 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1' and user_id = '35353535-3535-4353-8353-353535353535') = 0,
  'server: the demo call added no secondary lead to the real event');

do $$
begin
  if coalesce(nullif(current_setting('test.failed', true), ''), '0')::int > 0 then
    raise exception '% of % checks failed', current_setting('test.failed'), current_setting('test.n');
  end if;
  raise notice 'all % checks passed', current_setting('test.n');
end
$$;

rollback;
