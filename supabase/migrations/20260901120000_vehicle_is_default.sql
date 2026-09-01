-- Default / favorite vehicle per responder (רכב ראשי).
-- Used when assigning a responder to an event and when fill / personal-shift
-- have no plate chosen yet.

alter table public.vehicles
  add column if not exists is_default boolean not null default false;

comment on column public.vehicles.is_default is
  'When true, this is the responder''s default vehicle for new event assignments, fill, and personal-vehicle shifts.';

create unique index if not exists vehicles_one_default_per_user
  on public.vehicles (user_id)
  where is_default;

create or replace function public.default_vehicle_plate_for_user(p_user_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_plate text;
  v_count int;
begin
  select plate_number
  into v_plate
  from public.vehicles
  where user_id = p_user_id
    and not archived
    and is_default
  limit 1;

  if v_plate is not null then
    return v_plate;
  end if;

  select count(*)
  into v_count
  from public.vehicles
  where user_id = p_user_id
    and not archived;

  if v_count = 1 then
    select plate_number
    into v_plate
    from public.vehicles
    where user_id = p_user_id
      and not archived;
    return v_plate;
  end if;

  return null;
end;
$$;

revoke all on function public.default_vehicle_plate_for_user(uuid) from public;
grant execute on function public.default_vehicle_plate_for_user(uuid) to service_role;

create or replace function public.vehicles_before_write_default()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.archived then
    new.is_default := false;
  end if;

  if new.is_default then
    update public.vehicles
    set is_default = false
    where user_id = new.user_id
      and is_default
      and id is distinct from new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists vehicles_before_write_default on public.vehicles;
create trigger vehicles_before_write_default
before insert or update of is_default, archived
on public.vehicles
for each row
execute function public.vehicles_before_write_default();

create or replace function public.vehicles_ensure_default()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_user uuid;
  v_id uuid;
begin
  v_user := coalesce(new.user_id, old.user_id);

  if exists (
    select 1
    from public.vehicles
    where user_id = v_user
      and is_default
      and not archived
  ) then
    return coalesce(new, old);
  end if;

  select id
  into v_id
  from public.vehicles
  where user_id = v_user
    and not archived
  order by created_at asc
  limit 1;

  if v_id is not null then
    update public.vehicles
    set is_default = true
    where id = v_id;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists vehicles_after_insert_ensure_default on public.vehicles;
create trigger vehicles_after_insert_ensure_default
after insert on public.vehicles
for each row
execute function public.vehicles_ensure_default();

drop trigger if exists vehicles_after_archive_ensure_default on public.vehicles;
create trigger vehicles_after_archive_ensure_default
after update of archived on public.vehicles
for each row
when (new.archived and not old.archived)
execute function public.vehicles_ensure_default();

drop trigger if exists vehicles_after_delete_ensure_default on public.vehicles;
create trigger vehicles_after_delete_ensure_default
after delete on public.vehicles
for each row
execute function public.vehicles_ensure_default();

revoke all on function public.vehicles_before_write_default() from public;
revoke all on function public.vehicles_ensure_default() from public;

create or replace function public.set_default_vehicle(p_vehicle_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid;
  v_archived boolean;
  v_updated int;
begin
  select user_id, archived
  into v_user, v_archived
  from public.vehicles
  where id = p_vehicle_id;

  if v_user is null then
    raise exception 'הרכב לא נמצא';
  end if;

  if v_archived then
    raise exception 'לא ניתן לבחור רכב בארכיון כרכב ראשי';
  end if;

  update public.vehicles
  set is_default = false
  where user_id = v_user
    and is_default
    and id is distinct from p_vehicle_id;

  update public.vehicles
  set is_default = true
  where id = p_vehicle_id
    and not archived;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'אין הרשאה לעדכן רכב זה';
  end if;
end;
$$;

revoke all on function public.set_default_vehicle(uuid) from public;
grant execute on function public.set_default_vehicle(uuid) to authenticated;
grant execute on function public.set_default_vehicle(uuid) to service_role;

create or replace function public.event_responders_default_vehicle_plate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.vehicle_plate is null then
    new.vehicle_plate := public.default_vehicle_plate_for_user(new.responder_id);
  end if;
  return new;
end;
$$;

drop trigger if exists event_responders_default_vehicle_plate on public.event_responders;
create trigger event_responders_default_vehicle_plate
before insert on public.event_responders
for each row
execute function public.event_responders_default_vehicle_plate();

revoke all on function public.event_responders_default_vehicle_plate() from public;

-- Existing users: oldest active vehicle becomes default when none is set.
update public.vehicles as v
set is_default = true
from (
  select distinct on (user_id) id
  from public.vehicles
  where not archived
  order by user_id, created_at asc
) as first_active
where v.id = first_active.id
  and not exists (
    select 1
    from public.vehicles as other
    where other.user_id = v.user_id
      and other.is_default
  );
