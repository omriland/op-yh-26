-- Split write ALL so DELETE is admin-only (shift-lead keeps insert/update).
drop policy if exists events_write_lead_admin on public.events;

create policy events_insert_lead_admin on public.events
for insert to authenticated
with check (
  has_role(auth.uid(), 'admin'::app_role)
  or has_role(auth.uid(), 'shift_lead'::app_role)
);

create policy events_update_lead_admin on public.events
for update to authenticated
using (
  has_role(auth.uid(), 'admin'::app_role)
  or has_role(auth.uid(), 'shift_lead'::app_role)
)
with check (
  has_role(auth.uid(), 'admin'::app_role)
  or has_role(auth.uid(), 'shift_lead'::app_role)
);

create policy events_delete_admin on public.events
for delete to authenticated
using (has_role(auth.uid(), 'admin'::app_role));
