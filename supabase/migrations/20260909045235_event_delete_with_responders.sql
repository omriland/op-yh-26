-- Owning shift-leads may delete recent events even when responders are assigned.
-- event_responders and their dependent rows are removed by existing ON DELETE CASCADE constraints.

drop policy if exists events_delete_cockpit_draft_lead on public.events;

create policy events_delete_cockpit_draft_lead on public.events
for delete to authenticated
using (
  has_role(auth.uid(), 'shift_lead'::app_role)
  and shift_lead_id = auth.uid()
  and created_at >= (now() - interval '2 hours')
);
