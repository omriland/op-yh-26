-- Missing-KM alerts are for the event's actual אחמ״ש (main or secondary),
-- not every lead-role user who can see the event as a responder.

create or replace function public.count_events_missing_lead_km()
returns integer
language sql
stable
security invoker
set search_path = public
as $$
  select count(*)::integer
  from public.events e
  where (
    e.shift_lead_id = auth.uid()
    or exists (
      select 1
      from public.event_secondary_leads s
      where s.event_id = e.id
        and s.user_id = auth.uid()
    )
  )
  and exists (
    select 1
    from public.event_responders er
    where er.event_id = e.id
      and er.total_km is null
  );
$$;

revoke all on function public.count_events_missing_lead_km() from public;
grant execute on function public.count_events_missing_lead_km() to authenticated;
grant execute on function public.count_events_missing_lead_km() to service_role;
