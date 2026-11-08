-- A photo's link to a treated vehicle survives the report save, which deletes and
-- re-inserts every plate row (20261103190000_media_plate_links_survive_save.sql).
-- LOCAL database only:
--   scripts/app-review-demo/test/run-local-db.sh scripts/media-plates/test/links-survive-save.sql

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

-- What every client does when it saves a responder's plates.
create function pg_temp.save_responder_plates(p_assignment uuid, p_plates text[]) returns void
language plpgsql as $$
begin
  delete from public.event_treated_plates where event_responder_id = p_assignment;
  insert into public.event_treated_plates (event_responder_id, plate_number, sort_order)
  select p_assignment, plate, ord::int - 1 from unnest(p_plates) with ordinality as u(plate, ord);
end
$$;

-- Plates the photo is linked to, as digits.
create function pg_temp.linked(p_media uuid) returns text language sql as $$
  select coalesce(string_agg(p.plate_digits, ',' order by p.plate_digits), '')
  from public.event_media_plates mp
  join public.event_treated_plates p on p.id = mp.treated_plate_id
  where mp.media_id = p_media
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-4111-8111-111111111111', 'r1@test.local', '{"full_name":"כונן א","callsign":"T-R1"}'),
  ('22222222-2222-4222-8222-222222222222', 'r2@test.local', '{"full_name":"כונן ב","callsign":"T-R2"}'),
  ('33333333-3333-4333-8333-333333333333', 'l@test.local',  '{"full_name":"אחמש","callsign":"T-L"}');
insert into public.user_roles (user_id, role) values
  ('11111111-1111-4111-8111-111111111111', 'responder'),
  ('22222222-2222-4222-8222-222222222222', 'responder'),
  ('33333333-3333-4333-8333-333333333333', 'shift_lead');
-- Past טיוטה, so its volunteers may write their plates (20261108120000_event_lifecycle_release.sql).
insert into public.event_types (id, name) values
  ('7e7e7e7e-7e7e-47e7-87e7-7e7e7e7e7e7e', 'בדיקה - סוג אירוע');
insert into public.roads (id, name) values
  ('70707070-7070-4707-8707-707070707070', 'בדיקה - כביש');
insert into public.events (id, shift_lead_id, police_event_id, event_type_id, road_id, patrol_callsign_number) values
  ('e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', '33333333-3333-4333-8333-333333333333', '9101',
   '7e7e7e7e-7e7e-47e7-87e7-7e7e7e7e7e7e', '70707070-7070-4707-8707-707070707070', '411');
insert into public.event_responders (id, event_id, responder_id) values
  ('a1a1a1a1-0000-4000-8000-000000000001', 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', '11111111-1111-4111-8111-111111111111'),
  ('a1a1a1a1-0000-4000-8000-000000000002', 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', '22222222-2222-4222-8222-222222222222');

select pg_temp.save_responder_plates('a1a1a1a1-0000-4000-8000-000000000001', array['12-345-67', '98-765-43']);
select pg_temp.save_responder_plates('a1a1a1a1-0000-4000-8000-000000000002', array['12-345-67']);

-- Responder 1's photo shows their first car and responder 2's car.
insert into public.event_media (id, event_id, uploaded_by, taken_when, storage_path, byte_size) values
  ('f1f1f1f1-0000-4000-8000-000000000001', 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1',
   '11111111-1111-4111-8111-111111111111', 'before_treatment', 'test/one.jpg', 100);
insert into public.event_media_plates (media_id, treated_plate_id)
select 'f1f1f1f1-0000-4000-8000-000000000001', p.id from public.event_treated_plates p
where (p.event_responder_id = 'a1a1a1a1-0000-4000-8000-000000000001' and p.plate_digits = '1234567')
   or (p.event_responder_id = 'a1a1a1a1-0000-4000-8000-000000000002');

select pg_temp.ok(
  (select count(*) from public.event_media_plates where media_id = 'f1f1f1f1-0000-4000-8000-000000000001') = 2,
  'the photo starts linked to two cars');

-- Responder 1 saves the report again, as a signed-in responder (not service role).
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
select pg_temp.save_responder_plates('a1a1a1a1-0000-4000-8000-000000000001', array['12-345-67', '98-765-43']);
reset role;

select pg_temp.ok(
  (select count(*) from public.event_media_plates where media_id = 'f1f1f1f1-0000-4000-8000-000000000001') = 2,
  'saving the report again keeps both links');
select pg_temp.ok(
  exists (
    select 1 from public.event_media_plates mp
    join public.event_treated_plates p on p.id = mp.treated_plate_id
    where mp.media_id = 'f1f1f1f1-0000-4000-8000-000000000001'
      and p.event_responder_id = 'a1a1a1a1-0000-4000-8000-000000000001' and p.plate_digits = '1234567'),
  'the link points at responder 1''s re-inserted row for 12-345-67');
select pg_temp.ok(
  not exists (
    select 1 from public.event_media_plates mp
    join public.event_treated_plates p on p.id = mp.treated_plate_id
    where mp.media_id = 'f1f1f1f1-0000-4000-8000-000000000001'
      and p.event_responder_id = 'a1a1a1a1-0000-4000-8000-000000000001' and p.plate_digits = '9876543'),
  'a car the photo was not linked to stays unlinked');

-- Responder 2 (who did not upload the photo) saves: their link comes back too.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '22222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);
select pg_temp.save_responder_plates('a1a1a1a1-0000-4000-8000-000000000002', array['12-345-67']);
reset role;
select pg_temp.ok(
  (select count(*) from public.event_media_plates where media_id = 'f1f1f1f1-0000-4000-8000-000000000001') = 2,
  'another responder saving their own plates keeps the link to their car');

-- Plate typed differently (spaces, no dashes) is still the same car.
select pg_temp.save_responder_plates('a1a1a1a1-0000-4000-8000-000000000001', array['1234567', '98-765-43']);
select pg_temp.ok(
  (select count(*) from public.event_media_plates where media_id = 'f1f1f1f1-0000-4000-8000-000000000001') = 2,
  'the link follows the plate digits, not the formatting');

-- Removing the car from the list for real drops the link.
select pg_temp.save_responder_plates('a1a1a1a1-0000-4000-8000-000000000001', array['98-765-43']);
select pg_temp.ok(
  pg_temp.linked('f1f1f1f1-0000-4000-8000-000000000001') = '1234567'
  and (select count(*) from public.event_media_plates mp
       join public.event_treated_plates p on p.id = mp.treated_plate_id
       where mp.media_id = 'f1f1f1f1-0000-4000-8000-000000000001'
         and p.event_responder_id = 'a1a1a1a1-0000-4000-8000-000000000002') = 1,
  'removing a car from the list drops only that car''s link');

-- An old hold never resurrects a link: the car comes back a day later, unlinked.
update public.event_media_plate_holds set held_at = now() - interval '1 day';
select pg_temp.save_responder_plates('a1a1a1a1-0000-4000-8000-000000000001', array['98-765-43', '12-345-67']);
select pg_temp.ok(
  (select count(*) from public.event_media_plates mp
   join public.event_treated_plates p on p.id = mp.treated_plate_id
   where mp.media_id = 'f1f1f1f1-0000-4000-8000-000000000001'
     and p.event_responder_id = 'a1a1a1a1-0000-4000-8000-000000000001') = 0,
  'a car re-added long after it was removed comes back unlinked');
select pg_temp.ok(
  not exists (select 1 from public.event_media_plate_holds where held_at < now() - interval '1 hour'),
  'old holds are cleared');

-- Shared (event-keyed) plates, as the shift-born report saves them.
insert into public.event_treated_plates (event_id, plate_number, sort_order) values
  ('e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', '55-555-55', 0);
insert into public.event_media (id, event_id, uploaded_by, taken_when, storage_path, byte_size) values
  ('f1f1f1f1-0000-4000-8000-000000000002', 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1',
   '11111111-1111-4111-8111-111111111111', 'before_treatment', 'test/two.jpg', 100);
insert into public.event_media_plates (media_id, treated_plate_id)
select 'f1f1f1f1-0000-4000-8000-000000000002', id from public.event_treated_plates
where event_id = 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1';
delete from public.event_treated_plates where event_id = 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1';
insert into public.event_treated_plates (event_id, plate_number, sort_order) values
  ('e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', '55-555-55', 0);
select pg_temp.ok(pg_temp.linked('f1f1f1f1-0000-4000-8000-000000000002') = '5555555',
  'a shared shift-report plate keeps its photo link across a save');

-- A responder can't read or write the holds.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
create function pg_temp.reads_holds() returns text language plpgsql as $$
begin
  perform 1 from public.event_media_plate_holds;
  return 'read';
exception when insufficient_privilege then
  return 'denied';
end
$$;
select pg_temp.ok(pg_temp.reads_holds() = 'denied', 'signed-in users cannot read the holds');
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
