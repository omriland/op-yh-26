-- Members (anyone without admin or super_admin) may only read their own
-- vehicles. Adding, editing, archiving and deleting is for admins.
--
-- 20260909210000_vehicles_admin_only_write already limits writes to admins,
-- but RLS skips a blocked UPDATE or DELETE silently: the request "succeeds"
-- with 0 rows, so the Android profile screen shows the edit as saved. This
-- migration makes every member write fail with a real error (42501):
--
--   * A BEFORE INSERT/UPDATE/DELETE trigger raises for a member calling the
--     API directly (current_user = authenticated or anon).
--   * Two owner policies let the member's own rows reach that trigger on
--     UPDATE and DELETE. They grant nothing by themselves: the trigger
--     rejects the row before it changes. Never drop the trigger without
--     dropping these two policies (the rollback drops all three together).
--
-- Not affected: admins (vehicles_write_admin), the service role (admin-users
-- edge function, bulk invite), SECURITY DEFINER code (set_default_vehicle,
-- which still lets an owner pick רכב ראשי, and the default-vehicle triggers),
-- and auth cascades. Rollback: scripts/vehicles-lock/rollback-20261029200000.sql

create or replace function public.vehicles_block_member_write()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon')
     and not (
       public.has_role(auth.uid(), 'admin')
       or public.has_role(auth.uid(), 'super_admin')
     ) then
    raise exception 'רק מנהל יכול להוסיף, לערוך או למחוק רכבים.'
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

revoke all on function public.vehicles_block_member_write() from public;

drop trigger if exists vehicles_block_member_write on public.vehicles;
create trigger vehicles_block_member_write
before insert or update or delete on public.vehicles
for each row
execute function public.vehicles_block_member_write();

drop policy if exists vehicles_member_update_reaches_guard on public.vehicles;
create policy vehicles_member_update_reaches_guard on public.vehicles
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists vehicles_member_delete_reaches_guard on public.vehicles;
create policy vehicles_member_delete_reaches_guard on public.vehicles
for delete to authenticated
using (user_id = auth.uid());
