-- Lock Super Admin rows from regular-admin writes (RLS + RPC for Edge).

create or replace function public.super_admin_row_locked(
  target_id uuid,
  actor_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    actor_id is not null
    and public.has_role(target_id, 'super_admin')
    and not public.has_role(actor_id, 'super_admin');
$$;

revoke all on function public.super_admin_row_locked(uuid, uuid) from public;
grant execute on function public.super_admin_row_locked(uuid, uuid) to authenticated;
grant execute on function public.super_admin_row_locked(uuid, uuid) to service_role;

drop policy if exists profiles_update_own_or_admin on public.profiles;

create policy profiles_update_own_or_admin on public.profiles
for update to authenticated
using (
  id = auth.uid()
  or (
    public.has_role(auth.uid(), 'admin')
    and not public.super_admin_row_locked(id)
  )
)
with check (
  (
    id = auth.uid()
    and active is not distinct from public.profile_is_active(auth.uid())
  )
  or (
    public.has_role(auth.uid(), 'admin')
    and not public.super_admin_row_locked(id)
  )
);

drop policy if exists user_roles_admin_all on public.user_roles;

create policy user_roles_admin_all on public.user_roles
for all to authenticated
using (
  public.has_role(auth.uid(), 'admin')
  and not public.super_admin_row_locked(user_id)
)
with check (
  public.has_role(auth.uid(), 'admin')
  and not public.super_admin_row_locked(user_id)
);

drop policy if exists vehicles_write_own_or_admin on public.vehicles;

create policy vehicles_write_own_or_admin on public.vehicles
for all to authenticated
using (
  user_id = auth.uid()
  or (
    public.has_role(auth.uid(), 'admin')
    and not public.super_admin_row_locked(user_id)
  )
)
with check (
  user_id = auth.uid()
  or (
    public.has_role(auth.uid(), 'admin')
    and not public.super_admin_row_locked(user_id)
  )
);
