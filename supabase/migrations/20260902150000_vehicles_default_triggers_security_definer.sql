-- Auth admin delete cascades profiles → vehicles. The default-vehicle
-- triggers were SECURITY INVOKER, so they ran as supabase_auth_admin
-- and failed: permission denied for table vehicles (SQLSTATE 42501).

create or replace function public.vehicles_before_write_default()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.archived then
    new.is_default := false;
  end if;

  if new.is_default then
    update public.vehicles
    set is_default = false
    where user_id = new.user_id
      and is_default
      and id is distinct from new.id;
  end if;

  return new;
end;
$$;

create or replace function public.vehicles_ensure_default()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_id uuid;
begin
  v_user := coalesce(new.user_id, old.user_id);

  if exists (
    select 1
    from public.vehicles
    where user_id = v_user
      and is_default
      and not archived
  ) then
    return coalesce(new, old);
  end if;

  select id
  into v_id
  from public.vehicles
  where user_id = v_user
    and not archived
  order by created_at asc
  limit 1;

  if v_id is not null then
    update public.vehicles
    set is_default = true
    where id = v_id;
  end if;

  return coalesce(new, old);
end;
$$;

revoke all on function public.vehicles_before_write_default() from public;
revoke all on function public.vehicles_ensure_default() from public;
