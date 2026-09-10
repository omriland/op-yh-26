-- Event status `done` requires events.ended_at and every assigned lead total_km.
-- Auto-done previously looked only at participation statuses, so fill / EventForm /
-- shift-born complete could mark an event הושלם with no end time.

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
    and not exists (
      select 1
      from public.event_responders er
      where er.event_id = p_event_id
        and er.total_km is null
    )
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

create or replace function public.apply_event_status_from_participations(p_event_id uuid)
returns public.event_status
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed boolean;
  next_status public.event_status;
  v_ended_at timestamp;
begin
  select
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'shift_lead')
    or exists (
      select 1
      from public.event_responders er
      where er.event_id = p_event_id
        and er.responder_id = auth.uid()
    )
  into allowed;

  if not allowed then
    raise exception 'not allowed';
  end if;

  select e.ended_at into v_ended_at
  from public.events e
  where e.id = p_event_id;

  next_status := public.derived_event_status(p_event_id, v_ended_at);

  update public.events
  set status = next_status, updated_at = now()
  where id = p_event_id
    and status is distinct from next_status;

  return next_status;
end;
$$;

revoke all on function public.apply_event_status_from_participations(uuid) from public;
grant execute on function public.apply_event_status_from_participations(uuid) to authenticated;

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

  if exists (
    select 1
    from public.event_responders er
    where er.event_id = new.id
      and er.total_km is null
  ) then
    raise exception 'לא ניתן להשלים אירוע לפני הזנת קילומטרים לכל הכוננים.';
  end if;

  return new;
end;
$$;

drop trigger if exists events_guard_done_requirements on public.events;
create trigger events_guard_done_requirements
before insert or update of status, ended_at on public.events
for each row
execute function public.guard_event_done_requirements();

-- Revert illegally-done rows. Do not invent end times or KM.
update public.events e
set
  status = public.derived_event_status(e.id, e.ended_at),
  updated_at = now()
where e.status = 'done'
  and public.derived_event_status(e.id, e.ended_at) is distinct from 'done';
