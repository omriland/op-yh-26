-- Rollback for supabase/migrations/20261103180000_account_deletion.sql.
-- Re-runnable. Apply AFTER the revert is pushed (otherwise the next deploy
-- workflow run re-applies the migration):
--   supabase db query --linked --project-ref rtvizpsfvtjowbimugns \
--     -f scripts/delete-account/rollback-20261103180000.sql
--
-- Keeps profiles.deleted_at and impersonation_audit.session_id (additive,
-- harmless) and keeps already-anonymized profiles as they are. The restored
-- foreign key is NOT VALID, so those placeholder rows (which no longer have an
-- auth user) do not block it; new rows are checked as before.

drop function if exists public.delete_user_account(uuid);

create or replace function public.event_media_not_cancelled()
returns trigger
language plpgsql
as $$
declare
  cancelled boolean;
  target_event uuid;
begin
  target_event := coalesce(new.event_id, old.event_id);
  select e.is_cancelled into cancelled from public.events e where e.id = target_event;
  if cancelled then
    raise exception 'event_cancelled' using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.enforce_shift_identity_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.has_role(auth.uid(), 'admin')
     or public.has_role(auth.uid(), 'shift_lead') then
    return new;
  end if;

  if new.shift_date is distinct from old.shift_date
     or new.shift_kind is distinct from old.shift_kind
     or new.vehicle_type is distinct from old.vehicle_type
     or new.personal_vehicle_id is distinct from old.personal_vehicle_id then
    raise exception 'אין הרשאה לשנות פרטי משמרת';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_shift_identity_edit() from public;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_id_fkey' and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_id_fkey foreign key (id)
      references auth.users (id) on delete cascade not valid;
  end if;
end
$$;
