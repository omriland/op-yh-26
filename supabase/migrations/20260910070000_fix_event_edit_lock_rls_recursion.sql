-- The 7-day lock write policies queried `events` from FOR ALL policies on
-- event_responders / event_treated_vehicles. events_select also reads
-- event_responders, so every list fetch hit 42P17 infinite recursion.

create or replace function public.is_event_id_edit_unlocked(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select public.is_event_edit_unlocked(e.created_at)
      from public.events e
      where e.id = p_event_id
    ),
    false
  );
$$;

create or replace function public.is_event_responder_edit_unlocked(p_event_responder_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select public.is_event_edit_unlocked(e.created_at)
      from public.event_responders er
      join public.events e on e.id = er.event_id
      where er.id = p_event_responder_id
    ),
    false
  );
$$;

revoke all on function public.is_event_id_edit_unlocked(uuid) from public;
revoke all on function public.is_event_responder_edit_unlocked(uuid) from public;
grant execute on function public.is_event_id_edit_unlocked(uuid) to authenticated;
grant execute on function public.is_event_responder_edit_unlocked(uuid) to authenticated;

drop policy if exists event_responders_lead_admin_write on public.event_responders;
drop policy if exists event_responders_lead_admin_insert on public.event_responders;
drop policy if exists event_responders_lead_admin_update on public.event_responders;
drop policy if exists event_responders_lead_admin_delete on public.event_responders;

create policy event_responders_lead_admin_insert on public.event_responders
for insert to authenticated
with check (public.is_event_id_edit_unlocked(event_id));

create policy event_responders_lead_admin_update on public.event_responders
for update to authenticated
using (public.is_event_id_edit_unlocked(event_id))
with check (public.is_event_id_edit_unlocked(event_id));

create policy event_responders_lead_admin_delete on public.event_responders
for delete to authenticated
using (public.is_event_id_edit_unlocked(event_id));

drop policy if exists treated_vehicles_lead_admin_write on public.event_treated_vehicles;
drop policy if exists treated_vehicles_lead_admin_insert on public.event_treated_vehicles;
drop policy if exists treated_vehicles_lead_admin_update on public.event_treated_vehicles;
drop policy if exists treated_vehicles_lead_admin_delete on public.event_treated_vehicles;

create policy treated_vehicles_lead_admin_insert on public.event_treated_vehicles
for insert to authenticated
with check (
  (
    event_treated_vehicles.event_responder_id is not null
    and public.is_event_responder_edit_unlocked(event_treated_vehicles.event_responder_id)
  )
  or (
    event_treated_vehicles.event_id is not null
    and public.is_event_id_edit_unlocked(event_treated_vehicles.event_id)
  )
);

create policy treated_vehicles_lead_admin_update on public.event_treated_vehicles
for update to authenticated
using (
  (
    event_treated_vehicles.event_responder_id is not null
    and public.is_event_responder_edit_unlocked(event_treated_vehicles.event_responder_id)
  )
  or (
    event_treated_vehicles.event_id is not null
    and public.is_event_id_edit_unlocked(event_treated_vehicles.event_id)
  )
)
with check (
  (
    event_treated_vehicles.event_responder_id is not null
    and public.is_event_responder_edit_unlocked(event_treated_vehicles.event_responder_id)
  )
  or (
    event_treated_vehicles.event_id is not null
    and public.is_event_id_edit_unlocked(event_treated_vehicles.event_id)
  )
);

create policy treated_vehicles_lead_admin_delete on public.event_treated_vehicles
for delete to authenticated
using (
  (
    event_treated_vehicles.event_responder_id is not null
    and public.is_event_responder_edit_unlocked(event_treated_vehicles.event_responder_id)
  )
  or (
    event_treated_vehicles.event_id is not null
    and public.is_event_id_edit_unlocked(event_treated_vehicles.event_id)
  )
);

drop policy if exists event_secondary_leads_insert on public.event_secondary_leads;
create policy event_secondary_leads_insert on public.event_secondary_leads
for insert to authenticated
with check (public.is_event_id_edit_unlocked(event_id));

drop policy if exists event_secondary_leads_update on public.event_secondary_leads;
create policy event_secondary_leads_update on public.event_secondary_leads
for update to authenticated
using (public.is_event_id_edit_unlocked(event_id))
with check (public.is_event_id_edit_unlocked(event_id));

drop policy if exists event_secondary_leads_delete on public.event_secondary_leads;
create policy event_secondary_leads_delete on public.event_secondary_leads
for delete to authenticated
using (
  locked = false
  and public.is_event_id_edit_unlocked(event_id)
);
