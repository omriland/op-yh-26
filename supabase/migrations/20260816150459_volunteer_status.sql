-- Per-user unit status (admin-managed). Distinct from profiles.active
-- (login) and from event/participation status.

create type public.volunteer_status as enum (
  'administration',
  'basic_training',
  'phone_training',
  'personal_vehicle_training',
  'shifts_only',
  'active_volunteer'
);

alter table public.profiles
  add column volunteer_status public.volunteer_status not null default 'active_volunteer';

comment on column public.profiles.volunteer_status is
  'Unit classification: מנהלה / חניכה בסיסית / חניכה טלפונית / חניכה ברכב פרטי / משמרות בלבד / מתנדב פעיל.';

create or replace function public.guard_volunteer_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.volunteer_status is not distinct from old.volunteer_status then
    return new;
  end if;

  -- Service role / no JWT (invite, migrations).
  if auth.uid() is null then
    return new;
  end if;

  if public.has_role(auth.uid(), 'admin') then
    return new;
  end if;

  raise exception 'סטטוס משתמש ניתן לשינוי רק על ידי מנהל';
end;
$$;

drop trigger if exists profiles_guard_volunteer_status on public.profiles;
create trigger profiles_guard_volunteer_status
  before update on public.profiles
  for each row
  execute function public.guard_volunteer_status();
