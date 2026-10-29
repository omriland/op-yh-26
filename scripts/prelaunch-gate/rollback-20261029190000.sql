-- Rollback for supabase/migrations/20261029190000_prelaunch_native_block.sql.
--
-- Gives gated members on iOS and Android their own profile and roles back
-- (they can sign in and see empty screens, as after 20261029180000 alone).
-- The web gate is unaffected. Policies restored exactly as in 20261029180000.
-- Before running it, take 20261029190000 out of the Deploy Edge Functions
-- workflow, or the next run applies it again.
-- To remove the whole pre-launch gate instead, run
-- rollback-20261029180000.sql (it also drops what this file restores).

begin;

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

drop function if exists public.is_native_app_request();

commit;
