-- A cancelled event with no responders is `done` (list filter הושלם), not `draft`.
--
-- `20260913090000_lead_km_not_required_without_vehicle.sql` is already applied
-- (remote version 20260913071015). That file stays as applied. Deploy Edge
-- Functions replays it, which restores the older function bodies, so this
-- file is applied after that replay.

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
    ) then case
      when coalesce((
        select ev.is_cancelled from public.events ev where ev.id = p_event_id
      ), false) then 'done'::public.event_status
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

  if new.is_cancelled
     and not exists (
       select 1 from public.event_responders er where er.event_id = new.id
     ) then
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

-- Heal only rows the replay of 20260913090000 would have moved off this rule.
update public.events e
set
  status = public.derived_event_status(e.id, e.ended_at),
  updated_at = now()
where e.is_cancelled
  and not exists (
    select 1 from public.event_responders er where er.event_id = e.id
  )
  and public.derived_event_status(e.id, e.ended_at) is distinct from e.status;
