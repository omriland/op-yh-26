-- A cancelled event with nobody assigned is `done` only after the lead has
-- set שעת סיום. That is the same end-time half of `guard_event_done_requirements`
-- a normal event already needs; with no responders there is no lead KM to owe.
-- A non-cancelled event with nobody assigned stays `draft`.
--
-- Assigned responders are unchanged: done still means every participation is
-- done, `ended_at` is set, and `event_missing_lead_km` is false.
--
-- `20261103100000_shift_born_events_hardening.sql` is replayed by Deploy Edge
-- Functions and restores the older "cancelled + nobody = done immediately"
-- bodies. This file is applied after that replay. Do not edit the older files.

create or replace function public.derived_event_status(p_event_id uuid, p_ended_at timestamp without time zone)
returns public.event_status
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (
      select 1 from public.events ev where ev.id = p_event_id and ev.origin = 'shift'
    ) then (select ev.status from public.events ev where ev.id = p_event_id)
    when not exists (
      select 1 from public.event_responders er where er.event_id = p_event_id
    ) then case
      when coalesce((
        select ev.is_cancelled from public.events ev where ev.id = p_event_id
      ), false)
      and p_ended_at is not null
      and not public.event_missing_lead_km(p_event_id)
      then 'done'::public.event_status
      else 'draft'::public.event_status
    end
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

  if new.origin = 'shift' then
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

-- Rows the previous rule marked done before the lead set an end time.
update public.events e
set
  status = public.derived_event_status(e.id, e.ended_at),
  updated_at = now()
where e.is_cancelled
  and e.origin is distinct from 'shift'
  and not exists (
    select 1 from public.event_responders er where er.event_id = e.id
  )
  and public.derived_event_status(e.id, e.ended_at) is distinct from e.status;
