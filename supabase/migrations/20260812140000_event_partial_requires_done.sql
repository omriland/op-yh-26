-- partial = at least one participation fully done (not merely a draft save).
-- Draft saves stay as event in_progress until someone completes.

create or replace function public.apply_event_status_from_participations(p_event_id uuid)
returns public.event_status
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed boolean;
  statuses public.participation_status[];
  next_status public.event_status;
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

  select coalesce(array_agg(er.status), '{}')
  into statuses
  from public.event_responders er
  where er.event_id = p_event_id;

  if coalesce(cardinality(statuses), 0) = 0 then
    next_status := 'draft';
  elsif not exists (
    select 1 from unnest(statuses) s(status) where s.status is distinct from 'done'
  ) then
    next_status := 'done';
  elsif exists (
    select 1 from unnest(statuses) s(status) where s.status = 'done'
  ) then
    next_status := 'partial';
  else
    next_status := 'in_progress';
  end if;

  update public.events
  set status = next_status, updated_at = now()
  where id = p_event_id
    and status is distinct from next_status;

  return next_status;
end;
$$;

revoke all on function public.apply_event_status_from_participations(uuid) from public;
grant execute on function public.apply_event_status_from_participations(uuid) to authenticated;

-- Repair rows stuck on partial after draft-only participation progress.
update public.events e
set
  status = case
    when not exists (
      select 1 from public.event_responders er where er.event_id = e.id
    ) then 'draft'::public.event_status
    when not exists (
      select 1
      from public.event_responders er
      where er.event_id = e.id
        and er.status is distinct from 'done'
    ) then 'done'::public.event_status
    when exists (
      select 1
      from public.event_responders er
      where er.event_id = e.id
        and er.status = 'done'
    ) then 'partial'::public.event_status
    else 'in_progress'::public.event_status
  end,
  updated_at = now()
where e.status is distinct from (
  case
    when not exists (
      select 1 from public.event_responders er where er.event_id = e.id
    ) then 'draft'::public.event_status
    when not exists (
      select 1
      from public.event_responders er
      where er.event_id = e.id
        and er.status is distinct from 'done'
    ) then 'done'::public.event_status
    when exists (
      select 1
      from public.event_responders er
      where er.event_id = e.id
        and er.status = 'done'
    ) then 'partial'::public.event_status
    else 'in_progress'::public.event_status
  end
);
