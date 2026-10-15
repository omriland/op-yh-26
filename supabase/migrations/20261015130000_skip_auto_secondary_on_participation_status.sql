-- Documenting a participation refreshes events.status. That update was treated as
-- an אחמ״ש field edit, so a volunteer who also has shift_lead was locked in as
-- אחמ״ש משני. The status RPC flags the transaction; the auto-secondary trigger
-- skips that flag. A real event edit still locks.

create or replace function public.apply_event_status_from_participations(p_event_id uuid)
returns public.event_status
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed boolean;
  next_status public.event_status;
  v_ended_at timestamp;
begin
  select
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'shift_lead')
    or exists (
      select 1
      from public.event_responders er
      where er.event_id = p_event_id
        and er.responder_id = auth.uid()
    )
  into allowed;

  if not allowed then
    raise exception 'not allowed';
  end if;

  select e.ended_at into v_ended_at
  from public.events e
  where e.id = p_event_id;

  next_status := public.derived_event_status(p_event_id, v_ended_at);

  perform set_config('yahpaz.skip_auto_secondary', '1', true);

  update public.events
  set status = next_status, updated_at = now()
  where id = p_event_id
    and status is distinct from next_status;

  return next_status;
end;
$$;

revoke all on function public.apply_event_status_from_participations(uuid) from public;
grant execute on function public.apply_event_status_from_participations(uuid) to authenticated;

create or replace function public.sync_event_main_and_auto_secondary()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_field_change boolean;
begin
  if old.shift_lead_id is distinct from new.shift_lead_id then
    delete from public.event_secondary_leads
    where event_id = new.id
      and user_id = new.shift_lead_id;

    insert into public.event_secondary_leads (event_id, user_id, locked)
    values (new.id, old.shift_lead_id, false)
    on conflict (event_id, user_id) do nothing;
  end if;

  v_field_change :=
    old.event_date is distinct from new.event_date
    or old.police_event_id is distinct from new.police_event_id
    or old.district_id is distinct from new.district_id
    or old.patrol_callsign is distinct from new.patrol_callsign
    or old.patrol_callsign_prefix is distinct from new.patrol_callsign_prefix
    or old.patrol_callsign_number is distinct from new.patrol_callsign_number
    or old.started_at is distinct from new.started_at
    or old.ended_at is distinct from new.ended_at
    or old.event_type_id is distinct from new.event_type_id
    or old.road_id is distinct from new.road_id
    or old.location is distinct from new.location
    or old.location_place_id is distinct from new.location_place_id
    or old.location_lat is distinct from new.location_lat
    or old.location_lng is distinct from new.location_lng
    or old.location_pin_source is distinct from new.location_pin_source
    or old.notes is distinct from new.notes
    or old.is_cancelled is distinct from new.is_cancelled
    or old.bus_lane is distinct from new.bus_lane
    or old.status is distinct from new.status;
  if not v_field_change
     and old.shift_lead_id is not distinct from new.shift_lead_id
     and old.updated_at is distinct from new.updated_at then
    v_field_change := true;
  end if;

  if v_field_change
     and auth.uid() is not null
     and coalesce(current_setting('yahpaz.skip_auto_secondary', true), '') is distinct from '1'
  then
    perform public.upsert_locked_secondary_lead(new.id, auth.uid());
  end if;

  return new;
end;
$$;

-- Rows locked solely because participation status refreshed the event.
-- The enforce trigger refuses locked deletes; this repair is the exception.
alter table public.event_secondary_leads disable trigger event_secondary_leads_enforce;

delete from public.event_secondary_leads s
using public.event_audit a
where a.event_id = s.event_id
  and a.actor_id = s.user_id
  and a.table_name = 'events'
  and a.op = 'UPDATE'
  and a.changed_at = s.added_at
  and a.changed_fields = array['status']::text[]
  and s.locked
  and exists (
    select 1
    from public.event_responders er
    where er.event_id = s.event_id
      and er.responder_id = s.user_id
  );

alter table public.event_secondary_leads enable trigger event_secondary_leads_enforce;
