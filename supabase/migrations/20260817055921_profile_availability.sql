-- Duty availability (זמינות): volunteer self-serve + admin override.
-- Distinct from last-action presence and volunteer_status.

create type public.availability_status as enum ('available', 'unavailable');

alter table public.profiles
  add column if not exists availability public.availability_status not null default 'available',
  add column if not exists available_from date;

comment on column public.profiles.availability is
  'Duty availability: זמין / לא זמין.';
comment on column public.profiles.available_from is
  'Israel calendar date the volunteer becomes זמין at 00:00. Null = no return date. Always null when available.';

alter table public.profiles
  drop constraint if exists profiles_availability_date_ck;

alter table public.profiles
  add constraint profiles_availability_date_ck
  check (
    (availability = 'available' and available_from is null)
    or (availability = 'unavailable')
  );

create or replace function public.guard_profile_availability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := (timezone('Asia/Jerusalem', now()))::date;
begin
  if new.availability is not distinct from old.availability
     and new.available_from is not distinct from old.available_from then
    return new;
  end if;

  if new.availability = 'available' then
    new.available_from := null;
  elsif new.available_from is not null and new.available_from <= today then
    raise exception 'בחרו תאריך מהמחר או השאירו ריק.';
  end if;

  if auth.uid() is null then
    return new;
  end if;

  if public.has_role(auth.uid(), 'admin') then
    return new;
  end if;

  if auth.uid() = new.id then
    return new;
  end if;

  raise exception 'אין הרשאה לעדכון זמינות.';
end;
$$;

drop trigger if exists profiles_guard_availability on public.profiles;
create trigger profiles_guard_availability
  before update on public.profiles
  for each row
  execute function public.guard_profile_availability();

create or replace function public.apply_due_availability()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set availability = 'available',
      available_from = null
  where availability = 'unavailable'
    and available_from is not null
    and available_from <= (timezone('Asia/Jerusalem', now()))::date;
end;
$$;

revoke all on function public.apply_due_availability() from public;
grant execute on function public.apply_due_availability() to postgres;

do $$
begin
  perform cron.unschedule('apply-due-availability');
exception
  when others then null;
end;
$$;

select cron.schedule(
  'apply-due-availability',
  '5 * * * *',
  $cmd$select public.apply_due_availability()$cmd$
);
