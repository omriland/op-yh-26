-- A volunteer with no active vehicle has no kilometers to report.
--
-- The event form disables their KM input and shows `מתנדב ללא רכב`, so
-- `event_responders.total_km` stays null forever. `derived_event_status` and
-- `guard_event_done_requirements` treated that null as "still owed", which
-- stranded the whole event: it could never reach `done`, stayed pinned under
-- `דורשים השלמת פרטים`, and the trigger rejected any attempt to complete it.
--
-- KM is now only owed by a responder who actually has an unarchived vehicle.
-- `total_km` deliberately stays null rather than being written as 0 — a stored
-- 0 is indistinguishable from a real measurement and would under-refund the
-- volunteer once a car is added later.

create or replace function public.event_missing_lead_km(p_event_id uuid)
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
      and er.total_km is null
      and exists (
        select 1
        from public.vehicles v
        where v.user_id = er.responder_id
          and not v.archived
      )
  );
$$;

comment on function public.event_missing_lead_km(uuid) is
  'True when a responder who owns an active vehicle still has no lead-entered total_km.';

revoke all on function public.event_missing_lead_km(uuid) from public;
grant execute on function public.event_missing_lead_km(uuid) to authenticated;

create or replace function public.derived_event_status(
  p_event_id uuid,
  p_ended_at timestamp
)
returns public.event_status
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not exists (
      select 1 from public.event_responders er where er.event_id = p_event_id
    ) then 'draft'::public.event_status
    when not exists (
      select 1
      from public.event_responders er
      where er.event_id = p_event_id
        and er.status is distinct from 'done'
    )
    and p_ended_at is not null
    and not public.event_missing_lead_km(p_event_id)
    then 'done'::public.event_status
    when exists (
      select 1
      from public.event_responders er
      where er.event_id = p_event_id
        and er.status = 'done'
    ) then 'partial'::public.event_status
    else 'in_progress'::public.event_status
  end;
$$;

revoke all on function public.derived_event_status(uuid, timestamp) from public;
grant execute on function public.derived_event_status(uuid, timestamp) to authenticated;

create or replace function public.guard_event_done_requirements()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from 'done' then
    return new;
  end if;

  if new.ended_at is null then
    raise exception 'לא ניתן להשלים אירוע ללא שעת סיום.';
  end if;

  if public.event_missing_lead_km(new.id) then
    raise exception 'לא ניתן להשלים אירוע לפני הזנת קילומטרים לכל הכוננים.';
  end if;

  return new;
end;
$$;

-- Release events that were held open only by a ללא-רכב volunteer's null KM.
-- Recompute in both directions so nothing is promoted that does not qualify.
update public.events e
set
  status = public.derived_event_status(e.id, e.ended_at),
  updated_at = now()
where public.derived_event_status(e.id, e.ended_at) is distinct from e.status;
