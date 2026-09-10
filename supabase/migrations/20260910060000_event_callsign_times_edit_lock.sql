-- Split או״ק ניידת, move start/end to the event, lock edits after 7 days.

alter table public.events
  add column if not exists patrol_callsign_prefix text,
  add column if not exists patrol_callsign_number text,
  add column if not exists started_at timestamp,
  add column if not exists ended_at timestamp;

comment on column public.events.patrol_callsign_prefix is 'אוק - כינוי (optional short text)';
comment on column public.events.patrol_callsign_number is 'אוק - מס (required digits, max 5)';
comment on column public.events.started_at is 'Event start wall time (timestamp without time zone)';
comment on column public.events.ended_at is 'Event end wall time; next calendar day when overnight';

-- Last contiguous digit run → number (first 5 if longer). Leftover text → prefix.
create or replace function public.split_patrol_callsign(raw text)
returns table(prefix text, number text)
language plpgsql
immutable
as $$
declare
  v_raw text := trim(both from coalesce(raw, ''));
  v_digits text;
  v_prefix text;
begin
  if v_raw = '' then
    prefix := null;
    number := null;
    return next;
    return;
  end if;

  v_digits := (regexp_match(v_raw, '(\d+)(?!.*\d)'))[1];
  if v_digits is null then
    prefix := v_raw;
    number := null;
    return next;
    return;
  end if;

  number := left(v_digits, 5);
  v_prefix := trim(both from regexp_replace(
    regexp_replace(v_raw, '(\d+)(?!.*\d)', ''),
    '\s+',
    ' ',
    'g'
  ));
  prefix := nullif(v_prefix, '');
  return next;
end;
$$;

with split as (
  select e.id, s.prefix, s.number
  from public.events e
  cross join lateral public.split_patrol_callsign(e.patrol_callsign) as s
  where e.patrol_callsign is not null
    and e.patrol_callsign_prefix is null
    and e.patrol_callsign_number is null
)
update public.events e
set
  patrol_callsign_prefix = split.prefix,
  patrol_callsign_number = split.number
from split
where e.id = split.id;

update public.events
set patrol_callsign = nullif(
  trim(both from concat_ws(' ', patrol_callsign_prefix, patrol_callsign_number)),
  ''
)
where patrol_callsign_prefix is not null
   or patrol_callsign_number is not null;

-- Earliest responder start / latest responder end → event times. Do not drop responder timestamps.
update public.events e
set
  started_at = coalesce(e.started_at, s.min_start),
  ended_at = coalesce(e.ended_at, s.max_end)
from (
  select
    event_id,
    min(started_at) as min_start,
    max(ended_at) as max_end
  from public.event_responders
  group by event_id
) s
where e.id = s.event_id
  and (e.started_at is null or e.ended_at is null);

create or replace function public.events_sync_patrol_callsign()
returns trigger
language plpgsql
as $$
declare
  v_split record;
begin
  if new.patrol_callsign_prefix is not null or new.patrol_callsign_number is not null then
    new.patrol_callsign := nullif(
      trim(both from concat_ws(' ', new.patrol_callsign_prefix, new.patrol_callsign_number)),
      ''
    );
  elsif new.patrol_callsign is not null then
    select s.prefix, s.number into v_split
    from public.split_patrol_callsign(new.patrol_callsign) s;
    new.patrol_callsign_prefix := v_split.prefix;
    new.patrol_callsign_number := v_split.number;
  end if;
  return new;
end;
$$;

drop trigger if exists events_sync_patrol_callsign on public.events;
create trigger events_sync_patrol_callsign
before insert or update of patrol_callsign, patrol_callsign_prefix, patrol_callsign_number
on public.events
for each row
execute function public.events_sync_patrol_callsign();

-- 7-day edit lock: admin / super_admin always; shift_lead only while created_at is within 7 days.
create or replace function public.is_event_edit_unlocked(p_created_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'super_admin')
    or (
      public.has_role(auth.uid(), 'shift_lead')
      and p_created_at >= (now() - interval '7 days')
    );
$$;

revoke all on function public.is_event_edit_unlocked(timestamptz) from public;
grant execute on function public.is_event_edit_unlocked(timestamptz) to authenticated;

drop policy if exists events_update_lead_admin on public.events;
create policy events_update_lead_admin on public.events
for update to authenticated
using (public.is_event_edit_unlocked(created_at))
with check (public.is_event_edit_unlocked(created_at));

drop policy if exists event_responders_lead_admin_write on public.event_responders;
create policy event_responders_lead_admin_write on public.event_responders
for all to authenticated
using (
  exists (
    select 1 from public.events e
    where e.id = event_responders.event_id
      and public.is_event_edit_unlocked(e.created_at)
  )
)
with check (
  exists (
    select 1 from public.events e
    where e.id = event_responders.event_id
      and public.is_event_edit_unlocked(e.created_at)
  )
);

drop policy if exists treated_vehicles_lead_admin_write on public.event_treated_vehicles;
create policy treated_vehicles_lead_admin_write on public.event_treated_vehicles
for all to authenticated
using (
  (
    event_treated_vehicles.event_responder_id is not null
    and exists (
      select 1
      from public.event_responders er
      join public.events e on e.id = er.event_id
      where er.id = event_treated_vehicles.event_responder_id
        and public.is_event_edit_unlocked(e.created_at)
    )
  )
  or (
    event_treated_vehicles.event_id is not null
    and exists (
      select 1 from public.events e
      where e.id = event_treated_vehicles.event_id
        and public.is_event_edit_unlocked(e.created_at)
    )
  )
)
with check (
  (
    event_treated_vehicles.event_responder_id is not null
    and exists (
      select 1
      from public.event_responders er
      join public.events e on e.id = er.event_id
      where er.id = event_treated_vehicles.event_responder_id
        and public.is_event_edit_unlocked(e.created_at)
    )
  )
  or (
    event_treated_vehicles.event_id is not null
    and exists (
      select 1 from public.events e
      where e.id = event_treated_vehicles.event_id
        and public.is_event_edit_unlocked(e.created_at)
    )
  )
);

drop policy if exists event_secondary_leads_insert on public.event_secondary_leads;
create policy event_secondary_leads_insert on public.event_secondary_leads
for insert to authenticated
with check (
  exists (
    select 1 from public.events e
    where e.id = event_secondary_leads.event_id
      and public.is_event_edit_unlocked(e.created_at)
  )
);

drop policy if exists event_secondary_leads_update on public.event_secondary_leads;
create policy event_secondary_leads_update on public.event_secondary_leads
for update to authenticated
using (
  exists (
    select 1 from public.events e
    where e.id = event_secondary_leads.event_id
      and public.is_event_edit_unlocked(e.created_at)
  )
)
with check (
  exists (
    select 1 from public.events e
    where e.id = event_secondary_leads.event_id
      and public.is_event_edit_unlocked(e.created_at)
  )
);

drop policy if exists event_secondary_leads_delete on public.event_secondary_leads;
create policy event_secondary_leads_delete on public.event_secondary_leads
for delete to authenticated
using (
  locked = false
  and exists (
    select 1 from public.events e
    where e.id = event_secondary_leads.event_id
      and public.is_event_edit_unlocked(e.created_at)
  )
);

-- Auto-lock secondary on a real field edit should include the new columns.
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

  if v_field_change and auth.uid() is not null then
    perform public.upsert_locked_secondary_lead(new.id, auth.uid());
  end if;

  return new;
end;
$$;
