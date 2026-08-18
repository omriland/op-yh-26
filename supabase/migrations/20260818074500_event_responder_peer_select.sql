-- Assigned responders can read co-responders on the same event
-- so the event view lists every כונן. SELECT only.

create or replace function public.is_assigned_to_event(p_event_id uuid)
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
      and er.responder_id = auth.uid()
  );
$$;

revoke all on function public.is_assigned_to_event(uuid) from public;
grant execute on function public.is_assigned_to_event(uuid) to authenticated;

drop policy if exists event_responders_select on public.event_responders;

create policy event_responders_select on public.event_responders
for select to authenticated
using (
  public.has_role(auth.uid(), 'admin')
  or public.has_role(auth.uid(), 'shift_lead')
  or responder_id = auth.uid()
  or public.is_assigned_to_event(event_id)
);

drop policy if exists treated_vehicles_select on public.event_treated_vehicles;

create policy treated_vehicles_select on public.event_treated_vehicles
for select to authenticated
using (
  exists (
    select 1 from public.event_responders er
    where er.id = event_responder_id
      and (
        public.has_role(auth.uid(), 'admin')
        or public.has_role(auth.uid(), 'shift_lead')
        or er.responder_id = auth.uid()
        or public.is_assigned_to_event(er.event_id)
      )
  )
);
