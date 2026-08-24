-- Frozen events: persist 60km / suspicious-duplicate freeze + admin approval.
-- Frozen events are excluded from fuel refund (and lifetime km) until approved.

alter table public.events
  add column if not exists approved_over_60km boolean not null default false,
  add column if not exists approved_suspicious_duplicate boolean not null default false,
  add column if not exists frozen_over_60km boolean not null default false,
  add column if not exists frozen_suspicious_duplicate boolean not null default false;

comment on column public.events.approved_over_60km is
  'Admin approved this event for fuel refund despite matching the 60km exceptions report.';
comment on column public.events.approved_suspicious_duplicate is
  'Admin approved this event for fuel refund despite matching the suspicious-duplicates report.';
comment on column public.events.frozen_over_60km is
  'Computed: on the 60km report and not approved_over_60km. Clients must not write this.';
comment on column public.events.frozen_suspicious_duplicate is
  'Computed: on the suspicious-duplicates report and not approved_suspicious_duplicate. Clients must not write this.';

create or replace function public.event_matches_over_60km(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.event_responders er
    where er.event_id = p_event_id
      and er.total_km is not null
      and er.total_km >= 60
  );
$$;

-- Same volunteer, same calendar date, same trimmed location, started_at within 30 minutes,
-- different event — matches src/lib/duplicateEventsReport.ts pairMatches.
create or replace function public.event_matches_suspicious_duplicate(p_event_id uuid)
returns boolean
language sql
stable
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
    frozen_over_60km = public.event_matches_over_60km(id) and not approved_over_60km,
    frozen_suspicious_duplicate =
      public.event_matches_suspicious_duplicate(id) and not approved_suspicious_duplicate
  where id = p_event_id;
end;
$$;

create or replace function public.refresh_event_freeze_for_responder_day(
  p_responder_id uuid,
  p_event_date date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_responder_id is null or p_event_date is null then
    return;
  end if;

  perform public.refresh_event_freeze(e.id)
  from public.events e
  join public.event_responders er on er.event_id = e.id
  where er.responder_id = p_responder_id
    and e.event_date = p_event_date;
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
  end if;

  return new;
end;
$$;

drop trigger if exists events_guard_freeze_columns on public.events;
create trigger events_guard_freeze_columns
  before update on public.events
  for each row
  execute function public.guard_event_freeze_columns();

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

drop trigger if exists event_responders_refresh_freeze on public.event_responders;
create trigger event_responders_refresh_freeze
  after insert or update of total_km, started_at, responder_id, event_id or delete
  on public.event_responders
  for each row
  execute function public.event_responders_refresh_freeze();

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
  after update of location, event_date, approved_over_60km, approved_suspicious_duplicate
  on public.events
  for each row
  execute function public.events_refresh_freeze();

create or replace function public.events_before_delete_refresh_freeze()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Do not UPDATE this row here: Postgres then aborts DELETE
  -- ("tuple to be deleted was already modified...").
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

drop trigger if exists events_before_delete_refresh_freeze on public.events;
create trigger events_before_delete_refresh_freeze
  before delete on public.events
  for each row
  execute function public.events_before_delete_refresh_freeze();

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
    update public.events
    set approved_over_60km = true
    where id = p_event_id;
  else
    update public.events
    set approved_suspicious_duplicate = true
    where id = p_event_id;
  end if;

  perform public.refresh_event_freeze(p_event_id);
end;
$$;

revoke all on function public.event_matches_over_60km(uuid) from public, anon, authenticated;
revoke all on function public.event_matches_suspicious_duplicate(uuid) from public, anon, authenticated;
revoke all on function public.refresh_event_freeze(uuid) from public, anon, authenticated;
revoke all on function public.refresh_event_freeze_for_responder_day(uuid, date) from public, anon, authenticated;
revoke all on function public.approve_event_freeze(uuid, text) from public, anon;

grant execute on function public.event_matches_over_60km(uuid) to postgres, service_role;
grant execute on function public.event_matches_suspicious_duplicate(uuid) to postgres, service_role;
grant execute on function public.refresh_event_freeze(uuid) to postgres, service_role;
grant execute on function public.refresh_event_freeze_for_responder_day(uuid, date) to postgres, service_role;
grant execute on function public.approve_event_freeze(uuid, text) to authenticated, postgres, service_role;

-- Same inclusion as החזר דלק: lead-entered km, excluding frozen events.
create or replace function public.refresh_profile_lifetime_stats()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('yahpaz.refreshing_lifetime_stats', '1', true);

  update public.profiles as p
  set
    lifetime_event_count = s.event_count,
    lifetime_km = s.total_km,
    lifetime_stats_updated_at = now()
  from (
    select
      pr.id as profile_id,
      count(er.id)::integer as event_count,
      coalesce(sum(er.total_km), 0) as total_km
    from public.profiles as pr
    left join public.event_responders as er
      on er.responder_id = pr.id
     and er.total_km is not null
     and not exists (
       select 1
       from public.events e
       where e.id = er.event_id
         and (e.frozen_over_60km or e.frozen_suspicious_duplicate)
     )
    group by pr.id
  ) as s
  where p.id = s.profile_id;
end;
$$;

do $$
begin
  perform set_config('yahpaz.refreshing_event_freeze', '1', true);
  update public.events
  set
    frozen_over_60km = public.event_matches_over_60km(id) and not approved_over_60km,
    frozen_suspicious_duplicate =
      public.event_matches_suspicious_duplicate(id) and not approved_suspicious_duplicate;
end;
$$;
