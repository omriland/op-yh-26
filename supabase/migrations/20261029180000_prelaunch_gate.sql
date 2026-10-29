-- Pre-launch gate until 2026-11-01 00:01 Asia/Jerusalem (2026-10-31T22:01:00Z).
--
-- Invited members can accept the invite, set a password and sign in, but until
-- launch everyone except admins, super admins and the App Review demo account
-- is "blocked": the web shows only "המערכת תעלה לאוויר ב-1.11", and the
-- database gives them nothing but their own account rows. The iOS and Android
-- apps are native clients, so this database gate is what holds them.
--
--   * Launch instant: public.prelaunch_launch_at(). Keep it equal to
--     PRELAUNCH_LAUNCH_AT in src/lib/prelaunch.ts (a test compares them).
--   * Uses database now(), so the gate lifts by itself at launch whatever the
--     client clock says. Nothing has to be deployed or removed at launch.
--   * Blocked: one RESTRICTIVE policy per RLS table (and storage.objects).
--     Allowed while blocked: own profiles row (read/write, the set-password
--     step writes it), own user_roles rows (read), own device_tokens and
--     ios_devices (their policies are already own-row only).
--   * SECURITY DEFINER RPCs that list other members bypass RLS, so they check
--     the gate themselves (bodies otherwise as in 20261029120000 / 20260903140000).
--   * Edge functions that act for a member with the service role call
--     public.is_prelaunch_blocked(uid) (supabase/functions/_shared/prelaunch.ts).
--
-- Re-runnable. The Deploy Edge Functions workflow applies it last, after
-- 20261029120000, which rewrites list_unit_contacts and list_unit_map_pins.
-- Rollback: scripts/prelaunch-gate/rollback-20261029180000.sql.

create or replace function public.prelaunch_launch_at()
returns timestamptz
language sql
stable
as $$
  select timestamptz '2026-10-31 22:01:00+00';
$$;

-- Admins, super admins and the App Review demo account (flag set only by the
-- server) are never gated. Shift leads (אחמ״ש) are gated.
create or replace function public.is_prelaunch_exempt(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles p where p.id = p_uid and p.is_app_review_demo)
      or exists (
        select 1 from public.user_roles ur
        where ur.user_id = p_uid
          and ur.role in ('admin'::public.app_role, 'super_admin'::public.app_role)
      );
$$;

create or replace function public.is_prelaunch_blocked(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_uid is null then false
    when now() >= public.prelaunch_launch_at() then false
    else not public.is_prelaunch_exempt(p_uid)
  end;
$$;

-- For policies. Wrapped in (select ...) there, so it runs once per statement.
create or replace function public.is_prelaunch_blocked_caller()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_prelaunch_blocked(auth.uid());
$$;

-- What the web gate reads: server clock and the caller's status.
create or replace function public.prelaunch_gate()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'exempt', public.is_prelaunch_exempt(auth.uid()),
    'blocked', public.is_prelaunch_blocked(auth.uid()),
    'server_now_ms', floor(extract(epoch from now()) * 1000)::bigint,
    'launch_at_ms', floor(extract(epoch from public.prelaunch_launch_at()) * 1000)::bigint
  );
$$;

revoke all on function public.prelaunch_launch_at() from public, anon, authenticated;
revoke all on function public.is_prelaunch_exempt(uuid) from public, anon, authenticated;
revoke all on function public.is_prelaunch_blocked(uuid) from public, anon, authenticated;
revoke all on function public.is_prelaunch_blocked_caller() from public, anon;
revoke all on function public.prelaunch_gate() from public, anon;
grant execute on function public.prelaunch_launch_at() to service_role;
grant execute on function public.is_prelaunch_exempt(uuid) to service_role;
grant execute on function public.is_prelaunch_blocked(uuid) to service_role;
grant execute on function public.is_prelaunch_blocked_caller() to authenticated, service_role;
grant execute on function public.prelaunch_gate() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Restrictive policies. service_role and SECURITY DEFINER code bypass RLS.
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and c.relrowsecurity
      and c.relname not in ('profiles', 'user_roles', 'device_tokens', 'ios_devices')
  loop
    execute format('drop policy if exists %I on public.%I', t || '_prelaunch_gate', t);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated '
      || 'using (not (select public.is_prelaunch_blocked_caller())) '
      || 'with check (not (select public.is_prelaunch_blocked_caller()))',
      t || '_prelaunch_gate', t
    );
  end loop;
end
$$;

drop policy if exists profiles_prelaunch_gate on public.profiles;
create policy profiles_prelaunch_gate on public.profiles
  as restrictive for all to authenticated
  using (id = (select auth.uid()) or not (select public.is_prelaunch_blocked_caller()))
  with check (id = (select auth.uid()) or not (select public.is_prelaunch_blocked_caller()));

drop policy if exists user_roles_prelaunch_gate on public.user_roles;
create policy user_roles_prelaunch_gate on public.user_roles
  as restrictive for all to authenticated
  using (user_id = (select auth.uid()) or not (select public.is_prelaunch_blocked_caller()))
  with check (not (select public.is_prelaunch_blocked_caller()));

drop policy if exists storage_prelaunch_gate on storage.objects;
create policy storage_prelaunch_gate on storage.objects
  as restrictive for all to authenticated
  using (not (select public.is_prelaunch_blocked_caller()))
  with check (not (select public.is_prelaunch_blocked_caller()));

-- ---------------------------------------------------------------------------
-- SECURITY DEFINER RPCs that list other members.
-- ---------------------------------------------------------------------------

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
    and not public.is_prelaunch_blocked_caller()
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
    and not public.is_prelaunch_blocked_caller()
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

create or replace function public.list_shift_lead_profiles()
returns table (id uuid, full_name text, callsign text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.is_prelaunch_blocked_caller() then
    return;
  end if;

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
