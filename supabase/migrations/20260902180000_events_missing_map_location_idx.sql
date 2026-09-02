-- SuperAdmin event-locations queue: newest-first list + missing-coords chip.
create index if not exists events_event_date_created_at_idx
  on public.events (event_date desc, created_at desc);

create index if not exists events_missing_map_location_idx
  on public.events (event_date desc, created_at desc)
  where location_lat is null or location_lng is null;

-- SuperAdmin can patch locations without relying on the seed admin+shift_lead combo.
-- Admin and shift_lead keep event-form location edits.
drop policy if exists events_update_lead_admin on public.events;

create policy events_update_lead_admin on public.events
for update to authenticated
using (
  has_role(auth.uid(), 'admin'::app_role)
  or has_role(auth.uid(), 'shift_lead'::app_role)
  or has_role(auth.uid(), 'super_admin'::app_role)
)
with check (
  has_role(auth.uid(), 'admin'::app_role)
  or has_role(auth.uid(), 'shift_lead'::app_role)
  or has_role(auth.uid(), 'super_admin'::app_role)
);
