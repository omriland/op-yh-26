-- Root cause: WITH CHECK subquery SELECT on profiles re-enters RLS → infinite recursion (500).
-- Fix: read prior active flag via SECURITY DEFINER helper that bypasses RLS.

create or replace function public.profile_is_active(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p.active from public.profiles p where p.id = uid;
$$;

revoke all on function public.profile_is_active(uuid) from public;
grant execute on function public.profile_is_active(uuid) to authenticated;

drop policy if exists profiles_update_own_or_admin on public.profiles;

create policy profiles_update_own_or_admin on public.profiles
for update to authenticated
using (id = auth.uid() or has_role(auth.uid(), 'admin'::app_role))
with check (
  (
    id = auth.uid()
    and active is not distinct from public.profile_is_active(auth.uid())
  )
  or has_role(auth.uid(), 'admin'::app_role)
);
