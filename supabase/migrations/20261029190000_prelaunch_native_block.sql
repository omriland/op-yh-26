-- Pre-launch gate, native apps: a gated member cannot sign in on iOS or Android.
--
-- 20261029180000 leaves a gated member their own profiles and user_roles rows,
-- so the web can show the "launches on 1.11" screen. The iOS and Android apps
-- have no such screen and get no release before launch, so for them those two
-- exceptions are withdrawn: the apps read the own profile right after sign-in
-- (iOS `.single()`, Android `decodeSingle()`), that read fails, and the login
-- screen shows a plain error. Nothing else changes, and nobody else is affected.
--
-- Native = PostgREST request header X-Client-Info set by the SDKs the apps pin:
--   iOS     supabase-swift 2.55.1  "supabase-swift/2.55.1; platform=…; runtime=swift…"
--   Android supabase-kt 3.1.4      "supabase-kt/3.1.4"
-- The web (supabase-js 2.112.2) sends "supabase-js/2.112.2; runtime=web". A
-- missing, unknown or unreadable header counts as not native, so the web gate
-- screen can never lose the rows it needs.
--
-- Lifts at launch by itself: both policies still end in
-- `or not is_prelaunch_blocked_caller()`, which keys off prelaunch_launch_at()
-- and database now(). No new constant.
--
-- Re-runnable. The Deploy Edge Functions workflow applies it right after
-- 20261029180000 (which recreates these two policies in their web-only form).
-- Rollback: scripts/prelaunch-gate/rollback-20261029190000.sql.

create or replace function public.is_native_app_request()
returns boolean
language plpgsql
stable
set search_path = public
as $$
begin
  return coalesce(
    nullif(current_setting('request.headers', true), '')::json ->> 'x-client-info',
    ''
  ) ~ '^(supabase|postgrest)-(swift|kt)/';
exception when others then
  return false;
end;
$$;

revoke all on function public.is_native_app_request() from public, anon;
grant execute on function public.is_native_app_request() to authenticated, service_role;

drop policy if exists profiles_prelaunch_gate on public.profiles;
create policy profiles_prelaunch_gate on public.profiles
  as restrictive for all to authenticated
  using (
    (id = (select auth.uid()) and not (select public.is_native_app_request()))
    or not (select public.is_prelaunch_blocked_caller())
  )
  with check (
    (id = (select auth.uid()) and not (select public.is_native_app_request()))
    or not (select public.is_prelaunch_blocked_caller())
  );

drop policy if exists user_roles_prelaunch_gate on public.user_roles;
create policy user_roles_prelaunch_gate on public.user_roles
  as restrictive for all to authenticated
  using (
    (user_id = (select auth.uid()) and not (select public.is_native_app_request()))
    or not (select public.is_prelaunch_blocked_caller())
  )
  with check (not (select public.is_prelaunch_blocked_caller()));
