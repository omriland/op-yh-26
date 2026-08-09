-- Responders may update their own participation only while it (and the event) are not done.
-- After סיום דיווח, only shift_lead / admin may change the row (existing lead_admin_write policy).

drop policy if exists event_responders_self_update on public.event_responders;

create policy event_responders_self_update on public.event_responders
  for update to authenticated
  using (
    responder_id = auth.uid()
    and status is distinct from 'done'
    and exists (
      select 1
      from public.events e
      where e.id = event_id
        and e.status is distinct from 'done'
    )
  )
  with check (
    responder_id = auth.uid()
  );
