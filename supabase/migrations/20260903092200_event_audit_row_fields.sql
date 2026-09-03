-- event_audit_write is shared by events and event_responders.
-- PL/pgSQL CASE still resolves both record fields, so `old.event_id` aborts
-- DELETE/INSERT/UPDATE on `events` (no such column) with HTTP 400:
--   record "old" has no field "event_id"
-- Read ids from to_jsonb() instead.
--
-- Same DELETE path: shift-status trigger must not touch NEW (unassigned).

create or replace function public.event_audit_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_changed text[];
  v_row_id uuid;
  v_event_id uuid;
begin
  if tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    if (v_old - 'updated_at') = (v_new - 'updated_at') then
      return null;
    end if;
    select coalesce(array_agg(k order by k), '{}')
    into v_changed
    from (
      select key as k
      from jsonb_each(v_old - 'updated_at') o
      full join jsonb_each(v_new - 'updated_at') n using (key)
      where o.value is distinct from n.value
    ) d;
    v_row_id := (v_new->>'id')::uuid;
    v_event_id := case
      when tg_table_name = 'events' then (v_new->>'id')::uuid
      else (v_new->>'event_id')::uuid
    end;
  elsif tg_op = 'INSERT' then
    v_new := to_jsonb(new);
    v_row_id := (v_new->>'id')::uuid;
    v_event_id := case
      when tg_table_name = 'events' then (v_new->>'id')::uuid
      else (v_new->>'event_id')::uuid
    end;
  elsif tg_op = 'DELETE' then
    v_old := to_jsonb(old);
    v_row_id := (v_old->>'id')::uuid;
    v_event_id := case
      when tg_table_name = 'events' then (v_old->>'id')::uuid
      else (v_old->>'event_id')::uuid
    end;
  end if;

  insert into public.event_audit (
    table_name,
    row_id,
    event_id,
    op,
    actor_id,
    old_row,
    new_row,
    changed_fields
  ) values (
    tg_table_name,
    v_row_id,
    v_event_id,
    tg_op,
    auth.uid(),
    v_old,
    v_new,
    v_changed
  );

  return null;
end;
$$;

create or replace function public.trg_refresh_shift_log_status_from_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift_id uuid;
begin
  if tg_op = 'DELETE' then
    v_shift_id := old.shift_id;
  else
    v_shift_id := coalesce(new.shift_id, old.shift_id);
  end if;
  if v_shift_id is not null then
    perform public.refresh_shift_log_status(v_shift_id);
  end if;
  return null;
end;
$$;
