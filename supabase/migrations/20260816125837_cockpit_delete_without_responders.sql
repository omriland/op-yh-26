-- Shift-leads may delete a recent event once no responders remain.
-- Admin delete policy is unchanged.

drop policy if exists events_delete_incomplete_draft_lead on public.events;

create policy events_delete_cockpit_draft_lead on public.events
for delete to authenticated
using (
  has_role(auth.uid(), 'shift_lead'::app_role)
  and created_at >= (now() - interval '2 hours')
  and not exists (
    select 1
    from public.event_responders er
    where er.event_id = events.id
  )
);
