-- The cockpit keeps an event for 5 hours after created_at (COCKPIT_WINDOW_MS).
-- While it is still there the shift is in progress, so the missing-KM banner
-- and login popup must not count it. Completing an event still requires KM;
-- this only changes the reminder.

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
  and e.created_at < now() - interval '5 hours'
  -- A ללא-רכב volunteer has no KM to report, so their null must not nag the lead.
  and exists (
    select 1
    from public.event_responders er
    where er.event_id = e.id
      and er.total_km is null
      and exists (
        select 1
        from public.vehicles v
        where v.user_id = er.responder_id
          and not v.archived
      )
  );
$$;

comment on function public.count_events_missing_lead_km() is
  'Events this user leads that still owe lead KM, excluding those still on the cockpit (created within the last 5 hours).';

revoke all on function public.count_events_missing_lead_km() from public;
grant execute on function public.count_events_missing_lead_km() to authenticated;
grant execute on function public.count_events_missing_lead_km() to service_role;
