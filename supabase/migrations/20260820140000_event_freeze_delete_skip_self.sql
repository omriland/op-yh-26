-- Deleting an event with responders was failing:
-- BEFORE DELETE refreshed freeze flags (UPDATE of the same row), then Postgres
-- aborted with "tuple to be deleted was already modified by an operation
-- triggered by the current command". Duplicate-report delete always hits this
-- because those rows have responders. Skip self-update; refresh siblings after.

create or replace function public.refresh_event_freeze(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_event_id is null then
    return;
  end if;
  if current_setting('yahpaz.deleting_event_id', true) is not distinct from p_event_id::text then
    return;
  end if;
  if not exists (select 1 from public.events where id = p_event_id) then
    return;
  end if;

  perform set_config('yahpaz.refreshing_event_freeze', '1', true);

  update public.events
  set
    frozen_over_60km = public.event_has_pending_over_60km(id),
    frozen_suspicious_duplicate =
      public.event_matches_suspicious_duplicate(id) and not approved_suspicious_duplicate
  where id = p_event_id;
end;
$$;

create or replace function public.events_before_delete_refresh_freeze()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('yahpaz.deleting_event_id', old.id::text, true);
  perform set_config(
    'yahpaz.deleted_event_responder_ids',
    coalesce((
      select string_agg(er.responder_id::text, ',')
      from public.event_responders er
      where er.event_id = old.id
    ), ''),
    true
  );
  return old;
end;
$$;

create or replace function public.events_after_delete_refresh_freeze()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(current_setting('yahpaz.deleted_event_responder_ids', true), '') is not null then
    perform public.refresh_event_freeze_for_responder_day(x::uuid, old.event_date)
    from unnest(string_to_array(current_setting('yahpaz.deleted_event_responder_ids', true), ',')) as x;
  end if;
  return old;
end;
$$;

drop trigger if exists events_after_delete_refresh_freeze on public.events;
create trigger events_after_delete_refresh_freeze
  after delete on public.events
  for each row
  execute function public.events_after_delete_refresh_freeze();
