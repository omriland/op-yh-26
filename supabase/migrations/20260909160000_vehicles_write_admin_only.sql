-- Vehicles are admin-managed again. Responders may still view their own
-- rows and mark רכב ראשי via set_default_vehicle.

drop policy if exists vehicles_write_own_or_admin on public.vehicles;

create policy vehicles_write_admin on public.vehicles
for all to authenticated
using (
  public.has_role(auth.uid(), 'admin')
  and not public.super_admin_row_locked(user_id)
)
with check (
  public.has_role(auth.uid(), 'admin')
  and not public.super_admin_row_locked(user_id)
);

create or replace function public.set_default_vehicle(p_vehicle_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_archived boolean;
  v_updated int;
begin
  select user_id, archived
  into v_user, v_archived
  from public.vehicles
  where id = p_vehicle_id;

  if v_user is null then
    raise exception 'הרכב לא נמצא';
  end if;

  if v_archived then
    raise exception 'לא ניתן לבחור רכב בארכיון כרכב ראשי';
  end if;

  if auth.uid() is distinct from v_user
    and not (
      public.has_role(auth.uid(), 'admin')
      and not public.super_admin_row_locked(v_user)
    )
  then
    raise exception 'אין הרשאה לעדכן רכב זה';
  end if;

  update public.vehicles
  set is_default = false
  where user_id = v_user
    and is_default
    and id is distinct from p_vehicle_id;

  update public.vehicles
  set is_default = true
  where id = p_vehicle_id
    and not archived;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'אין הרשאה לעדכן רכב זה';
  end if;
end;
$$;

revoke all on function public.set_default_vehicle(uuid) from public;
grant execute on function public.set_default_vehicle(uuid) to authenticated;
grant execute on function public.set_default_vehicle(uuid) to service_role;
