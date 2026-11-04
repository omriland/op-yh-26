-- Shift-born events and the unit map (20261103100000_shift_born_events_hardening.sql,
-- 20261103101000_map_pins_require_vehicle.sql).
-- Plain SQL, LOCAL database only:
--   scripts/app-review-demo/test/run-local-db.sh scripts/shift-born/test/shift-born.sql
-- One transaction, rolled back. Prints "ok N - ..." per check; non-zero exit on any failure.

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

create function pg_temp.rows(p_sql text) returns int language plpgsql as $$
declare n int;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end
$$;

create function pg_temp.act_as(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

-- Today and tomorrow in the unit's time zone.
create function pg_temp.today() returns date language sql stable as $$
  select (timezone('Asia/Jerusalem', now()))::date $$;

-- Save the shared report as the current JWT user, with the event's current token.
create function pg_temp.save(p_event uuid, p_complete boolean, p_location text default 'צומת הדר',
  p_detail text default 'גרירת רכב תקוע מהנתיב השמאלי אל השוליים, פינוי שברים וסימון אזור.')
returns timestamptz language plpgsql as $$
declare v_at timestamptz;
begin
  select updated_at into v_at from public.events where id = p_event;
  return public.save_shift_born_event_fill(
    p_event, v_at, (10000 + abs(hashtext(p_event::text)) % 90000)::text, p_detail, false, null, '[]'::jsonb, p_complete,
    'f0f0f0f0-0000-4000-8000-000000000001', p_location, '[]'::jsonb);
end
$$;

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres, RLS bypassed).
--   R1 crew with a car · R2 crew without a car · R3 joins later · X outsider
--   L shift lead · S today's shift (R1, R2) · F tomorrow's shift (R1)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-4111-8111-111111111111', 'r1@test.local', '{"full_name":"כונן רכב","callsign":"T-R1"}'),
  ('22222222-2222-4222-8222-222222222222', 'r2@test.local', '{"full_name":"כונן בלי רכב","callsign":"T-R2"}'),
  ('23232323-2323-4232-8232-232323232323', 'r3@test.local', '{"full_name":"כונן מאוחר","callsign":"T-R3"}'),
  ('29292929-2929-4292-8292-292929292929', 'x@test.local',  '{"full_name":"זר","callsign":"T-X"}'),
  ('33333333-3333-4333-8333-333333333333', 'l@test.local',  '{"full_name":"אחמש","callsign":"T-L"}'),
  ('61616161-6161-4616-8616-616161616161', 'p@test.local',  '{"full_name":"חניך טלפוני","callsign":"T-P"}'),
  ('62626262-6262-4626-8626-626262626262', 'o@test.local',  '{"full_name":"משמרות בלבד","callsign":"T-O"}');

insert into public.user_roles (user_id, role) values
  ('11111111-1111-4111-8111-111111111111', 'responder'),
  ('22222222-2222-4222-8222-222222222222', 'responder'),
  ('23232323-2323-4232-8232-232323232323', 'responder'),
  ('29292929-2929-4292-8292-292929292929', 'responder'),
  ('33333333-3333-4333-8333-333333333333', 'shift_lead'),
  ('61616161-6161-4616-8616-616161616161', 'responder'),
  ('62626262-6262-4626-8626-626262626262', 'responder');

update public.profiles set volunteer_status = 'phone_training' where id = '61616161-6161-4616-8616-616161616161';
update public.profiles set volunteer_status = 'shifts_only' where id = '62626262-6262-4626-8626-626262626262';

insert into public.vehicles (user_id, plate_number, model, is_default) values
  ('11111111-1111-4111-8111-111111111111', '1234567', 'רכב', true),
  ('61616161-6161-4616-8616-616161616161', '2345678', 'רכב', true),
  ('62626262-6262-4626-8626-626262626262', '3456789', 'רכב', true);

insert into public.user_addresses (user_id, kind, formatted_address, place_id, lat, lng) values
  ('11111111-1111-4111-8111-111111111111', 'home', 'בית R1', 'p1', 32.08, 34.78),
  ('22222222-2222-4222-8222-222222222222', 'home', 'בית R2', 'p2', 32.09, 34.79),
  ('61616161-6161-4616-8616-616161616161', 'home', 'בית P', 'p3', 32.10, 34.80),
  ('62626262-6262-4626-8626-626262626262', 'home', 'בית O', 'p4', 32.11, 34.81);

insert into public.event_types (id, name) values ('e7e7e7e7-0000-4000-8000-000000000001', 'תאונה בדיקה');
insert into public.roads (id, name) values ('f0f0f0f0-0000-4000-8000-000000000001', '4');

insert into public.shifts (id, shift_date, shift_lead_id, vehicle_type) values
  ('5a5a5a5a-0000-4000-8000-000000000001', pg_temp.today(), '33333333-3333-4333-8333-333333333333', 'patrol_center'),
  ('5a5a5a5a-0000-4000-8000-000000000002', pg_temp.today() + 1, '33333333-3333-4333-8333-333333333333', 'patrol_north');

insert into public.shift_responders (shift_id, responder_id) values
  ('5a5a5a5a-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111'),
  ('5a5a5a5a-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222'),
  ('5a5a5a5a-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111');

insert into public.shift_event_type_counts (shift_id, event_type_id, count) values
  ('5a5a5a5a-0000-4000-8000-000000000001', 'e7e7e7e7-0000-4000-8000-000000000001', 3),
  ('5a5a5a5a-0000-4000-8000-000000000002', 'e7e7e7e7-0000-4000-8000-000000000001', 1);

-- A regular event for the regression checks.
insert into public.events (id, shift_lead_id, police_event_id) values
  ('e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', '33333333-3333-4333-8333-333333333333', '9001');
insert into public.event_responders (event_id, responder_id) values
  ('e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', '11111111-1111-4111-8111-111111111111');

set local role authenticated;

-- ------------------------------------------------------------------ creation
select pg_temp.act_as('33333333-3333-4333-8333-333333333333');
select pg_temp.lives($$select public.sync_shift_born_events('5a5a5a5a-0000-4000-8000-000000000001')$$,
  'lead syncs today''s shift');
select pg_temp.lives($$select public.sync_shift_born_events('5a5a5a5a-0000-4000-8000-000000000002')$$,
  'lead syncs tomorrow''s shift');
reset role;

create temp table ev as
  select id, row_number() over (order by created_at, id) n
  from public.events where shift_id = '5a5a5a5a-0000-4000-8000-000000000001';
create temp table fev as
  select id from public.events where shift_id = '5a5a5a5a-0000-4000-8000-000000000002';
grant select on ev, fev to authenticated;

select pg_temp.ok((select count(*) from ev) = 3, 'three shift-born events created');
select pg_temp.ok((select count(*) from public.event_responders where event_id in (select id from ev)) = 6,
  'each event has a row per crew member');
select pg_temp.ok(not exists (select 1 from public.event_responders where event_id in (select id from ev) and vehicle_plate is not null),
  'no default plate is stamped on a shift-born crew row');

set local role authenticated;

-- ------------------------------------------- crew cannot write per-responder fields
select pg_temp.act_as('11111111-1111-4111-8111-111111111111');
select pg_temp.ok(pg_temp.rows($$update public.event_responders set odometer_start = 100, vehicle_plate = '1234567'
  where event_id = (select id from ev where n = 1) and responder_id = auth.uid()$$) = 0,
  'crew cannot PATCH odometer or plate on a shift-born row');
select pg_temp.ok(pg_temp.rows($$update public.event_responders set odometer_start = 100
  where event_id = 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1' and responder_id = auth.uid()$$) = 1,
  'regression: crew still edits their own row on a regular event');

-- ------------------------------------------------------- completing the report
select pg_temp.lives($$select pg_temp.save((select id from ev where n = 1), true)$$,
  'crew member (no lead role) completes a shift-born event with no end time or KM');
reset role;
select pg_temp.ok((select status from public.events where id = (select id from ev where n = 1)) = 'done',
  'the event is done');
select pg_temp.ok(not exists (select 1 from public.event_responders
  where event_id = (select id from ev where n = 1) and status <> 'done'), 'every crew row is done');
set local role authenticated;

select pg_temp.act_as('22222222-2222-4222-8222-222222222222');
select pg_temp.throws($$select pg_temp.save((select id from ev where n = 1), false)$$,
  'התיעוד כבר הושלם. רק אחמ״ש יכול לערוך.', 'crew editing a done event gets the specific message');

select pg_temp.act_as('33333333-3333-4333-8333-333333333333');
select pg_temp.lives($$select pg_temp.save((select id from ev where n = 1), false)$$,
  'the lead can still edit a done event');
reset role;
select pg_temp.ok((select status from public.events where id = (select id from ev where n = 1)) = 'done',
  'a lead draft save keeps it done');
set local role authenticated;

select pg_temp.act_as('22222222-2222-4222-8222-222222222222');
select pg_temp.throws($$select public.save_shift_born_event_fill(
    (select id from ev where n = 2), '2001-01-01', null, 'x', false, null, '[]'::jsonb, false)$$,
  'מישהו שמר לפניך — רעננו', 'a stale token still says someone saved first');

select pg_temp.act_as('29292929-2929-4292-8292-292929292929');
select pg_temp.throws($$select pg_temp.save((select id from ev where n = 2), false)$$,
  'אין הרשאה', 'an outsider cannot save');

select pg_temp.act_as('11111111-1111-4111-8111-111111111111');
select pg_temp.throws($$select pg_temp.save((select id from fev), false)$$,
  'ניתן לתעד החל מתאריך המשמרת.', 'crew on tomorrow''s shift get the date message');

-- ------------------------------------------------------------- geocoded pin
reset role;
update public.events set location = 'צומת הדר', road_id = 'f0f0f0f0-0000-4000-8000-000000000001',
  location_lat = 32.1, location_lng = 34.9 where id = (select id from ev where n = 2);
set local role authenticated;
select pg_temp.act_as('22222222-2222-4222-8222-222222222222');
select pg_temp.lives($$select pg_temp.save((select id from ev where n = 2), false)$$, 'draft save, same place');
reset role;
select pg_temp.ok((select location_lat from public.events where id = (select id from ev where n = 2)) = 32.1,
  'the geocoded pin survives a save that kept road and location');
set local role authenticated;
select pg_temp.act_as('22222222-2222-4222-8222-222222222222');
select pg_temp.lives($$select pg_temp.save((select id from ev where n = 2), false, 'מחלף אחר')$$, 'draft save, new place');
reset role;
select pg_temp.ok((select location_lat from public.events where id = (select id from ev where n = 2)) is null,
  'a new location clears the old pin');
set local role authenticated;

-- ------------------------------------------- participation-derived status
select pg_temp.act_as('22222222-2222-4222-8222-222222222222');
select pg_temp.ok(public.apply_event_status_from_participations((select id from ev where n = 2)) = 'in_progress',
  'participation recompute leaves a shift-born event as it is');

-- -------------------------------------------------------------- KM nag / lock
reset role;
update public.events set created_at = now() - interval '8 days' where id in (select id from ev);
set local role authenticated;
select pg_temp.act_as('33333333-3333-4333-8333-333333333333');
select pg_temp.ok(public.count_events_missing_lead_km() = 0, 'the missing-KM nag ignores shift-born events');
select pg_temp.throws($$select public.set_locked_event_lead_km(
    (select er.id from public.event_responders er
     where er.event_id = (select id from ev where n = 2) and er.responder_id = '11111111-1111-4111-8111-111111111111'), 12)$$,
  'not allowed', 'locked lead KM refuses a shift-born row');

-- ---------------------------------------------------------- overdue clock
reset role;
update public.event_responders set total_km = 7
  where event_id = (select id from ev where n = 2) and responder_id = '11111111-1111-4111-8111-111111111111';
select pg_temp.ok((select fill_completable_at from public.event_responders
  where event_id = (select id from ev where n = 2) and responder_id = '11111111-1111-4111-8111-111111111111') is null,
  'KM on a shift-born row never starts the overdue clock');
set local role authenticated;
select pg_temp.act_as('33333333-3333-4333-8333-333333333333');

-- ------------------------------------------------------- crew joins late
reset role;
insert into public.shift_responders (shift_id, responder_id)
  values ('5a5a5a5a-0000-4000-8000-000000000001', '23232323-2323-4232-8232-232323232323');
set local role authenticated;
select pg_temp.act_as('33333333-3333-4333-8333-333333333333');
select pg_temp.lives($$select public.sync_shift_born_events('5a5a5a5a-0000-4000-8000-000000000001')$$, 'sync after adding crew');
reset role;
select pg_temp.ok((select status from public.event_responders
  where event_id = (select id from ev where n = 1) and responder_id = '23232323-2323-4232-8232-232323232323') = 'done',
  'crew added after completion join the done event as done');
select pg_temp.ok((select status from public.event_responders
  where event_id = (select id from ev where n = 3) and responder_id = '23232323-2323-4232-8232-232323232323') = 'pending',
  'and join an open event as pending');

-- -------------------------------------------- lowering a count keeps photos
insert into public.event_media (event_id, uploaded_by, taken_when, storage_path, mime_type, byte_size)
values ((select id from ev where n = 3), '11111111-1111-4111-8111-111111111111', 'before_treatment',
  (select id from ev where n = 3)::text || '/0e0e0e0e-0000-4000-8000-000000000001.jpg', 'image/jpeg', 10);
select pg_temp.ok(not public.shift_born_event_is_empty((select id from ev where n = 3)),
  'an event with only a photo is not empty');

-- ---------------------------------------------- deleting does not resurrect
update public.events set status = 'in_progress' where id = (select id from ev where n = 3);
set local role authenticated;
select pg_temp.act_as('33333333-3333-4333-8333-333333333333');
select pg_temp.lives($$select public.delete_event((select id from ev where n = 3))$$, 'the lead deletes a shift-born event');
select pg_temp.lives($$select public.sync_shift_born_events('5a5a5a5a-0000-4000-8000-000000000001')$$, 'sync after delete');
reset role;
select pg_temp.ok((select count from public.shift_event_type_counts
  where shift_id = '5a5a5a5a-0000-4000-8000-000000000001') = 2, 'deleting lowered the type count');
select pg_temp.ok((select count(*) from public.events where shift_id = '5a5a5a5a-0000-4000-8000-000000000001') = 2,
  'the next sync does not recreate it');

-- --------------------------------------------------------- the shift closes
set local role authenticated;
select pg_temp.act_as('22222222-2222-4222-8222-222222222222');
select pg_temp.lives($$select pg_temp.save((select id from ev where n = 2), true)$$, 'crew completes the last event');
select pg_temp.act_as('33333333-3333-4333-8333-333333333333');
select pg_temp.lives($$update public.shifts set odometer_start = 1000, odometer_end = 1080
  where id = '5a5a5a5a-0000-4000-8000-000000000001'$$, 'lead enters the shift odometer');
reset role;
select pg_temp.ok((select status from public.shifts where id = '5a5a5a5a-0000-4000-8000-000000000001') = 'closed',
  'odometer + every event done closes the shift');

-- ------------------------------------- the deploy workflow's migration replay
-- deploy-edge-functions.yml replays older files (e.g. 20260913090000, which
-- recomputes every event's status) before this one. Completed shift-born
-- events must come out of that still done.
\o /dev/null
\ir ../../../supabase/migrations/20260913090000_lead_km_not_required_without_vehicle.sql
select pg_temp.ok((select status from public.events where id = (select id from ev where n = 1)) = 'done',
  'the replayed 20260913090000 status backfill skips shift-born events');
\ir ../../../supabase/migrations/20261101053833_cancelled_event_without_responders_is_done.sql
\ir ../../../supabase/migrations/20261103100000_shift_born_events_hardening.sql
select pg_temp.ok((select status from public.events where id = (select id from ev where n = 1)) = 'done',
  'a completed shift-born event survives the deploy workflow''s replay');
select pg_temp.ok((select status from public.shifts where id = '5a5a5a5a-0000-4000-8000-000000000001') = 'closed',
  'and its shift stays closed');
-- An older replay already knocked one back: the repair restores it.
update public.events set status = 'partial' where id = (select id from ev where n = 1);
\ir ../../../supabase/migrations/20261103100000_shift_born_events_hardening.sql
\ir ../../../supabase/migrations/20261104193000_cancelled_zero_responders_done_after_lead_end.sql
select pg_temp.ok((select status from public.events where id = (select id from ev where n = 1)) = 'done',
  'the repair puts a fully-done shift-born event back to done');
select pg_temp.ok((select status from public.events where shift_id = '5a5a5a5a-0000-4000-8000-000000000002') <> 'done',
  'the repair leaves an open shift-born event open');

-- ------------------------------------------------- regression: regular events
select pg_temp.throws($$update public.events set status = 'done' where id = 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1'$$,
  'לא ניתן להשלים אירוע ללא שעת סיום.', 'regression: a regular event still needs an end time');

insert into public.events (id, shift_lead_id, police_event_id, is_cancelled) values
  ('c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0', '33333333-3333-4333-8333-333333333333', '9101', true),
  ('c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1', '33333333-3333-4333-8333-333333333333', '9102', true),
  ('c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2', '33333333-3333-4333-8333-333333333333', '9103', false);
insert into public.event_responders (event_id, responder_id, status) values
  ('c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1', '22222222-2222-4222-8222-222222222222', 'pending');
select pg_temp.ok(
  public.derived_event_status('c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0', null) = 'draft',
  'cancelled with nobody assigned stays draft until the lead sets an end time');
select pg_temp.throws(
  $$update public.events set status = 'done' where id = 'c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0'$$,
  'לא ניתן להשלים אירוע ללא שעת סיום.',
  'cancelled with nobody assigned cannot be done without an end time');
update public.events set ended_at = timestamp '2026-11-04 10:00:00'
  where id = 'c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0';
select pg_temp.ok(
  public.derived_event_status('c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0', timestamp '2026-11-04 10:00:00') = 'done',
  'cancelled with nobody assigned is done once the lead set an end time');
select pg_temp.lives(
  $$update public.events set status = 'done' where id = 'c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0'$$,
  'the done guard allows a cancelled event with nobody assigned after the end time');
update public.events set ended_at = timestamp '2026-11-04 10:00:00'
  where id = 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1';
select pg_temp.ok(
  public.derived_event_status('c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1', timestamp '2026-11-04 10:00:00') = 'in_progress',
  'cancelled with an open responder is not done');
update public.events set ended_at = timestamp '2026-11-04 10:00:00'
  where id = 'c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2';
select pg_temp.ok(
  public.derived_event_status('c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2', timestamp '2026-11-04 10:00:00') = 'draft',
  'a normal event with nobody assigned does not become done');

-- ------------------------------------------------------------------ the map
set local role authenticated;
select pg_temp.act_as('33333333-3333-4333-8333-333333333333');
select pg_temp.ok(exists (select 1 from public.list_unit_map_pins() where user_id = '11111111-1111-4111-8111-111111111111'),
  'map: מתנדב פעיל with a car is shown');
select pg_temp.ok(not exists (select 1 from public.list_unit_map_pins() where user_id = '22222222-2222-4222-8222-222222222222'),
  'map: מתנדב פעיל without a car is hidden');
select pg_temp.ok(exists (select 1 from public.list_unit_map_pins() where user_id = '61616161-6161-4616-8616-616161616161'),
  'map: חניכה טלפונית with a car is shown');
select pg_temp.ok(not exists (select 1 from public.list_unit_map_pins() where user_id = '62626262-6262-4626-8626-626262626262'),
  'map: משמרות בלבד stays hidden even with a car');
reset role;
update public.vehicles set archived = true where user_id = '61616161-6161-4616-8616-616161616161';
set local role authenticated;
select pg_temp.act_as('33333333-3333-4333-8333-333333333333');
select pg_temp.ok(not exists (select 1 from public.list_unit_map_pins() where user_id = '61616161-6161-4616-8616-616161616161'),
  'map: an archived car does not count');
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
