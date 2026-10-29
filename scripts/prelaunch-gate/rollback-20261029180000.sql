-- Rollback for supabase/migrations/20261029180000_prelaunch_gate.sql.
--
-- Removes the pre-launch gate everywhere at once:
--   * database: drops every *_prelaunch_gate policy, every *_prelaunch_guard
--     trigger and the helper functions, and restores the three RPC bodies the
--     migration changed;
--   * edge functions: _shared/prelaunch.ts treats a missing is_prelaunch_blocked
--     as "not blocked", so no redeploy is needed;
--   * web: src/lib/prelaunch.ts treats a missing prelaunch_gate RPC as "no gate",
--     so no Netlify rollback is needed either.
-- Before running it, take 20261029180000_prelaunch_gate.sql out of the Deploy
-- Edge Functions workflow, or the next run puts the gate back.
-- Not needed after launch: the gate is inert from 2026-10-31T22:01:00Z.

begin;

-- As in 20261029120000_app_review_demo_isolation.sql.
create or replace function public.list_unit_contacts()
returns table (
  id uuid,
  full_name text,
  callsign text,
  phone text,
  email text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.full_name, p.callsign, p.phone, p.email
  from public.profiles p
  where auth.uid() is not null
    and exists (
      select 1
      from public.profiles me
      where me.id = auth.uid()
        and me.active
        and me.is_app_review_demo = p.is_app_review_demo
    )
    and p.active
    and not p.invite_pending
    and p.id <> auth.uid()
  order by p.full_name;
$$;

-- As in 20261029120000_app_review_demo_isolation.sql.
create or replace function public.list_unit_map_pins()
returns table (
  user_id uuid,
  full_name text,
  callsign text,
  kind public.address_kind,
  label text,
  formatted_address text,
  lat double precision,
  lng double precision,
  volunteer_status public.volunteer_status,
  availability public.availability_status,
  available_from date
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.full_name,
    p.callsign,
    a.kind,
    a.label,
    a.formatted_address,
    a.lat,
    a.lng,
    p.volunteer_status,
    p.availability,
    p.available_from
  from public.user_addresses a
  join public.profiles p on p.id = a.user_id
  where auth.uid() is not null
    and exists (
      select 1
      from public.profiles me
      where me.id = auth.uid()
        and me.active
        and me.is_app_review_demo = p.is_app_review_demo
    )
    and p.active
    and not p.invite_pending
    and p.volunteer_status not in (
      'administration'::public.volunteer_status,
      'basic_training'::public.volunteer_status,
      'shifts_only'::public.volunteer_status
    )
  order by p.callsign, a.kind;
$$;

-- As in 20260903140000_event_secondary_leads.sql.
create or replace function public.list_shift_lead_profiles()
returns table (id uuid, full_name text, callsign text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (
    public.has_role(auth.uid(), 'shift_lead')
    or public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'super_admin')
  ) then
    return;
  end if;

  return query
  select p.id, p.full_name, p.callsign
  from public.profiles p
  where p.active
    and exists (
      select 1
      from public.user_roles ur
      where ur.user_id = p.id
        and ur.role = 'shift_lead'::public.app_role
    )
  order by p.full_name;
end;
$$;

do $$
declare
  t text;
begin
  for t in
    select tablename from pg_policies
    where schemaname = 'public' and policyname = tablename || '_prelaunch_gate'
  loop
    execute format('drop policy if exists %I on public.%I', t || '_prelaunch_gate', t);
  end loop;
end
$$;
drop policy if exists storage_prelaunch_gate on storage.objects;

do $$
declare
  r record;
begin
  for r in
    select c.relname as tbl, t.tgname
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and t.tgname = c.relname || '_prelaunch_guard'
  loop
    execute format('drop trigger if exists %I on public.%I', r.tgname, r.tbl);
  end loop;
end
$$;
drop function if exists public.guard_prelaunch_write();

drop function if exists public.prelaunch_gate();
drop function if exists public.is_prelaunch_blocked_caller();
drop function if exists public.is_prelaunch_blocked(uuid);
drop function if exists public.is_prelaunch_exempt(uuid);
drop function if exists public.prelaunch_launch_at();

commit;
