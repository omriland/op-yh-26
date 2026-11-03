-- A responder who completes their report from an email link saves through the
-- responder-fill edge function, which calls this with the service role. There is
-- no auth.uid() then, so the role check refused it and the event's status was
-- never recomputed (the function ignored the error). The service role already
-- checked the fill token for this exact assignment, so it may recompute.

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
    auth.role() = 'service_role'
    or public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'shift_lead')
    or exists (
      select 1
      from public.event_responders er
      where er.event_id = p_event_id
        and er.responder_id = auth.uid()
    )
  into allowed;

  if not coalesce(allowed, false) then
    raise exception 'not allowed';
  end if;

  select e.ended_at into v_ended_at
  from public.events e
  where e.id = p_event_id;

  next_status := public.derived_event_status(p_event_id, v_ended_at);

  perform set_config('yahpaz.skip_auto_secondary', '1', true);

  update public.events
  set status = next_status, updated_at = now()
  where id = p_event_id
    and status is distinct from next_status;

  return next_status;
end;
$$;
