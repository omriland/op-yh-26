-- Rollback for supabase/migrations/20261029200000_vehicles_member_write_error.sql.
-- Restores the 20260909210000 state: members still cannot write vehicles
-- (vehicles_write_admin stays), but a blocked edit or delete is silent again.
-- Drops the policies first so members never get owner write without the trigger.
begin;
drop policy if exists vehicles_member_update_reaches_guard on public.vehicles;
drop policy if exists vehicles_member_delete_reaches_guard on public.vehicles;
drop trigger if exists vehicles_block_member_write on public.vehicles;
drop function if exists public.vehicles_block_member_write();
commit;
