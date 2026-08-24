-- Deleting 1 event of a 3-event duplicate cluster was unfreezing the other two
-- (they then dropped off the report). CASCADE DELETE of event_responders ran
-- refresh_event_freeze while the cluster was half-gone; STABLE match could not
-- see remaining siblings as duplicates. Skip that mid-delete refresh; AFTER
-- DELETE on events already refreshes siblings once the row is gone. Match must
-- be VOLATILE so that pass sees the in-transaction remaining rows.

create or replace function public.event_matches_suspicious_duplicate(p_event_id uuid)
returns boolean
language sql
volatile
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.event_responders a
    join public.events ea on ea.id = a.event_id
    join public.event_responders b
      on b.responder_id = a.responder_id
     and b.event_id <> a.event_id
    join public.events eb on eb.id = b.event_id
    where a.event_id = p_event_id
      and ea.event_date = eb.event_date
      and nullif(btrim(coalesce(ea.location, '')), '') is not null
      and btrim(ea.location) = btrim(eb.location)
      and a.started_at is not null
      and b.started_at is not null
      and abs(extract(epoch from (a.started_at - b.started_at))) <= 1800
  );
$$;

create or replace function public.event_responders_refresh_freeze()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_event uuid;
  target_responder uuid;
  target_date date;
  old_date date;
begin
  if tg_op = 'DELETE' then
    -- Parent events DELETE already captured responder ids and will refresh
    -- siblings in AFTER DELETE. Do not recompute while CASCADE is mid-flight.
    if current_setting('yahpaz.deleting_event_id', true) is not distinct from old.event_id::text then
      return old;
    end if;
    target_event := old.event_id;
    target_responder := old.responder_id;
  else
    target_event := new.event_id;
    target_responder := new.responder_id;
  end if;

  select event_date into target_date from public.events where id = target_event;
  perform public.refresh_event_freeze(target_event);
  if target_date is null then
    perform public.refresh_event_freeze(er.event_id)
    from public.event_responders er
    where er.responder_id = target_responder;
  else
    perform public.refresh_event_freeze_for_responder_day(target_responder, target_date);
  end if;

  if tg_op = 'UPDATE' and (
    old.event_id is distinct from new.event_id
    or old.responder_id is distinct from new.responder_id
  ) then
    select event_date into old_date from public.events where id = old.event_id;
    perform public.refresh_event_freeze(old.event_id);
    perform public.refresh_event_freeze_for_responder_day(old.responder_id, old_date);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

do $$
begin
  perform set_config('yahpaz.refreshing_event_freeze', '1', true);
  update public.events
  set
    frozen_over_60km = public.event_has_pending_over_60km(id),
    frozen_suspicious_duplicate =
      public.event_matches_suspicious_duplicate(id) and not approved_suspicious_duplicate;
end;
$$;
