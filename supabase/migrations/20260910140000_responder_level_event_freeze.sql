-- Freeze the participation, not the whole event.
--
-- Before: one responder at/above the km threshold froze `events.frozen_over_60km`,
-- and every fuel-refund query filtered on that event flag. A second responder on
-- the same event with justified km (say 20) lost their refund until an admin
-- approved someone else's exception.
--
-- After: `event_responders.frozen_*` is the truth for refunds. The `events.*`
-- columns stay as the "at least one frozen participation" aggregate, which is
-- exactly what they already meant (both rules were per-responder underneath),
-- so reports and the audit trail keep working unchanged.

alter table public.event_responders
  add column if not exists frozen_over_60km boolean not null default false,
  add column if not exists frozen_suspicious_duplicate boolean not null default false;

comment on column public.event_responders.frozen_over_60km is
  'Computed: this participation has lead total_km >= 80 and is not in events.approved_over_60km_responder_ids. Excluded from fuel refund. Clients must not write this.';

comment on column public.event_responders.frozen_suspicious_duplicate is
  'Computed: this responder has another participation at the same place/date within 30 minutes and the event is not approved. Excluded from fuel refund. Clients must not write this.';

comment on column public.events.frozen_over_60km is
  'Aggregate: at least one participation on this event is frozen for high km (lead total_km >= 80, pending). Clients must not write this.';

comment on column public.events.frozen_suspicious_duplicate is
  'Aggregate: at least one participation on this event is frozen as a suspected duplicate. Clients must not write this.';

-- Recompute both levels for one event. Responder rows first, event flags as the
-- OR over them. Set-based on purpose: a STABLE helper cannot see rows written
-- earlier in the same transaction (see 20260820151000).
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

  with wanted as (
    select
      er.id,
      (
        er.total_km is not null
        and er.total_km >= 80
        and not (er.responder_id = any (e.approved_over_60km_responder_ids))
      ) as over_km,
      (
        not e.approved_suspicious_duplicate
        and er.started_at is not null
        and nullif(btrim(coalesce(e.location, '')), '') is not null
        and exists (
          select 1
          from public.event_responders other
          join public.events other_event on other_event.id = other.event_id
          where other.responder_id = er.responder_id
            and other.event_id <> er.event_id
            and other_event.event_date = e.event_date
            and btrim(coalesce(other_event.location, '')) = btrim(e.location)
            and other.started_at is not null
            and abs(extract(epoch from (er.started_at - other.started_at))) <= 1800
        )
      ) as duplicate
    from public.event_responders er
    join public.events e on e.id = er.event_id
    where er.event_id = p_event_id
  )
  update public.event_responders er
  set
    frozen_over_60km = wanted.over_km,
    frozen_suspicious_duplicate = wanted.duplicate
  from wanted
  where wanted.id = er.id
    -- Only real transitions: refresh fans out across a responder's whole day,
    -- and a no-op write would still fire the audit trigger.
    and (
      er.frozen_over_60km is distinct from wanted.over_km
      or er.frozen_suspicious_duplicate is distinct from wanted.duplicate
    );

  update public.events e
  set
    frozen_over_60km = agg.over_km,
    frozen_suspicious_duplicate = agg.duplicate
  from (
    select
      exists (
        select 1
        from public.event_responders er
        where er.event_id = p_event_id
          and er.frozen_over_60km
      ) as over_km,
      exists (
        select 1
        from public.event_responders er
        where er.event_id = p_event_id
          and er.frozen_suspicious_duplicate
      ) as duplicate
  ) agg
  where e.id = p_event_id
    and (
      e.frozen_over_60km is distinct from agg.over_km
      or e.frozen_suspicious_duplicate is distinct from agg.duplicate
    );
end;
$$;

-- Same contract as guard_event_freeze_columns: only refresh_event_freeze writes
-- the frozen flags, never a client (fill, lead edit, edge function).
create or replace function public.guard_event_responder_freeze_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('yahpaz.refreshing_event_freeze', true) = '1' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.frozen_over_60km := false;
    new.frozen_suspicious_duplicate := false;
  else
    new.frozen_over_60km := old.frozen_over_60km;
    new.frozen_suspicious_duplicate := old.frozen_suspicious_duplicate;
  end if;

  return new;
end;
$$;

drop trigger if exists event_responders_guard_freeze_columns on public.event_responders;
create trigger event_responders_guard_freeze_columns
  before insert or update on public.event_responders
  for each row
  execute function public.guard_event_responder_freeze_columns();

-- Same inclusion as החזר דלק: lead-entered km, minus frozen participations.
-- A frozen teammate on the same event no longer zeroes this responder's km.
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
     and not er.frozen_over_60km
     and not er.frozen_suspicious_duplicate
    group by pr.id
  ) as s
  where p.id = s.profile_id;
end;
$$;

revoke all on function public.refresh_event_freeze(uuid) from public, anon, authenticated;
grant execute on function public.refresh_event_freeze(uuid) to postgres, service_role;

-- Backfill: one pass per event fills the new responder columns and rewrites the
-- event aggregates from them.
do $$
begin
  perform public.refresh_event_freeze(e.id) from public.events e;
end;
$$;

select public.refresh_profile_lifetime_stats();
