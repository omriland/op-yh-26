-- Allow assigned responders (and leads/admins) to refresh event.status after
-- participation saves. Direct UPDATE on events stays lead/admin-only.

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
    select 1 from unnest(statuses) s(status) where s.status in ('in_progress', 'done')
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
