-- Shift-leads may delete incomplete cockpit drafts (still בהזנה, missing type or road).
-- Admin delete policy is unchanged.

create policy events_delete_incomplete_draft_lead on public.events
for delete to authenticated
using (
  has_role(auth.uid(), 'shift_lead'::app_role)
  and status = 'draft'
  and (event_type_id is null or road_id is null)
);
