-- 60km list: remember which responders were approved so the event leaves the
-- report until a *different* responder exceeds 60km (then it re-freezes).
-- Duplicate list: clustering is unchanged; the web report hides a cluster only
-- after every member is approved (or deletes leave a single event).

alter table public.events
  add column if not exists approved_over_60km_responder_ids uuid[] not null default '{}';

comment on column public.events.approved_over_60km_responder_ids is
  'Responder ids whose over-60km situation was already admin-approved. A new id over 60km re-freezes.';

-- Raw 60km rule is unchanged (any lead-entered total_km >= 60).
-- Pending = that rule, minus responders already in the approval snapshot.
create or replace function public.event_has_pending_over_60km(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.event_responders er
    join public.events e on e.id = er.event_id
    where er.event_id = p_event_id
      and er.total_km is not null
      and er.total_km >= 60
      and not (er.responder_id = any (e.approved_over_60km_responder_ids))
  );
$$;

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

create or replace function public.guard_event_freeze_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('yahpaz.refreshing_event_freeze', true) = '1' then
    return new;
  end if;

  new.frozen_over_60km := old.frozen_over_60km;
  new.frozen_suspicious_duplicate := old.frozen_suspicious_duplicate;

  if current_setting('yahpaz.approving_event_freeze', true) is distinct from '1' then
    new.approved_over_60km := old.approved_over_60km;
    new.approved_suspicious_duplicate := old.approved_suspicious_duplicate;
    new.approved_over_60km_responder_ids := old.approved_over_60km_responder_ids;
  end if;

  return new;
end;
$$;

create or replace function public.events_refresh_freeze()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('yahpaz.refreshing_event_freeze', true) = '1' then
    return new;
  end if;

  if new.location is distinct from old.location
     or new.event_date is distinct from old.event_date
     or new.approved_over_60km is distinct from old.approved_over_60km
     or new.approved_suspicious_duplicate is distinct from old.approved_suspicious_duplicate
     or new.approved_over_60km_responder_ids is distinct from old.approved_over_60km_responder_ids
  then
    perform public.refresh_event_freeze(new.id);
    perform public.refresh_event_freeze_for_responder_day(er.responder_id, new.event_date)
    from public.event_responders er
    where er.event_id = new.id;
    if old.event_date is distinct from new.event_date then
      perform public.refresh_event_freeze_for_responder_day(er.responder_id, old.event_date)
      from public.event_responders er
      where er.event_id = new.id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists events_refresh_freeze on public.events;
create trigger events_refresh_freeze
  after update of location, event_date, approved_over_60km, approved_suspicious_duplicate,
    approved_over_60km_responder_ids
  on public.events
  for each row
  execute function public.events_refresh_freeze();

create or replace function public.approve_event_freeze(p_event_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin'::app_role) then
    raise exception 'אין לך הרשאה לפעולה זו.';
  end if;

  if p_reason not in ('over_60km', 'suspicious_duplicate') then
    raise exception 'סיבת הקפאה לא תקינה.';
  end if;

  if not exists (select 1 from public.events where id = p_event_id) then
    raise exception 'האירוע אינו קיים.';
  end if;

  perform set_config('yahpaz.approving_event_freeze', '1', true);

  if p_reason = 'over_60km' then
    update public.events e
    set
      approved_over_60km = true,
      approved_over_60km_responder_ids = (
        select coalesce(array_agg(distinct rid), '{}'::uuid[])
        from (
          select unnest(e.approved_over_60km_responder_ids) as rid
          union
          select er.responder_id
          from public.event_responders er
          where er.event_id = e.id
            and er.total_km is not null
            and er.total_km >= 60
        ) s
      )
    where e.id = p_event_id;
  else
    update public.events
    set approved_suspicious_duplicate = true
    where id = p_event_id;
  end if;

  perform public.refresh_event_freeze(p_event_id);
end;
$$;

revoke all on function public.event_has_pending_over_60km(uuid) from public, anon, authenticated;
grant execute on function public.event_has_pending_over_60km(uuid) to postgres, service_role;

-- Already-approved 60km events: snapshot current over-60km responders so they
-- stay off the list unless a different responder later exceeds 60km.
do $$
begin
  perform set_config('yahpaz.approving_event_freeze', '1', true);
  update public.events e
  set approved_over_60km_responder_ids = coalesce((
    select array_agg(er.responder_id)
    from public.event_responders er
    where er.event_id = e.id
      and er.total_km is not null
      and er.total_km >= 60
  ), '{}'::uuid[])
  where e.approved_over_60km
    and e.approved_over_60km_responder_ids = '{}'::uuid[];
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
