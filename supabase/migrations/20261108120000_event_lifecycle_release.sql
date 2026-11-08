-- Event lifecycle (טיוטה · פרטים חסרים · ממתין למתנדב · תועד חלקית · תועד):
-- the server half.
--
-- `events.status` is unchanged. The on-screen status is derived in the app
-- (src/lib/eventLifecycle.ts). This file makes the database agree with the one
-- rule the app cannot enforce alone: a volunteer never sees a טיוטה, and is not
-- told about one, until סוג אירוע, או״ק (the number), כביש and מספר אירוע are all
-- filled. Shift-born events are visible to their crew from the start.
--
--   1. event_released_to_responders(...)  the release rule, same as
--      src/lib/eventResponderRelease.ts and supabase/functions/_shared/eventRelease.ts.
--   2. events_select                      an assigned כונן reads the event only once
--      it is released. Admins and shift-leads are unchanged.
--   3. event_is_open_for_responder_edit   a כונן cannot write their own row on an
--      unreleased event (the iOS app reads and writes PostgREST directly).
--   4. Partner webhooks                   assignment_created waits for release, not
--      only for מספר אירוע, and fires when the last release field is filled.
--   5. lead_km_owed(events)               computed column over event_missing_lead_km,
--      so a כונן's list can tell פרטים חסרים (the אחמ״ש still owes ק״מ) even though
--      RLS hides their teammates' cars.
--
-- Idempotent. Deploy Edge Functions replays older files that restore the
-- previous event_is_open_for_responder_edit body and both webhook triggers, so
-- this file has to run after all of them.

-- 1. Release rule -------------------------------------------------------------

create or replace function public.event_released_to_responders(
  p_origin public.event_origin,
  p_police_event_id text,
  p_event_type_id uuid,
  p_road_id uuid,
  p_patrol_callsign_prefix text,
  p_patrol_callsign_number text,
  p_patrol_callsign text
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select case
    when p_origin = 'shift' then true
    when nullif(btrim(coalesce(p_police_event_id, '')), '') is null then false
    when p_event_type_id is null or p_road_id is null then false
    -- Split columns win once either is set; only a legacy row reads the combined value.
    when btrim(coalesce(p_patrol_callsign_prefix, '')) <> ''
      or btrim(coalesce(p_patrol_callsign_number, '')) <> ''
      then coalesce(p_patrol_callsign_number, '') ~ '[0-9]'
    else coalesce(p_patrol_callsign, '') ~ '[0-9]'
  end;
$$;

revoke all on function public.event_released_to_responders(
  public.event_origin, text, uuid, uuid, text, text, text
) from public;
grant execute on function public.event_released_to_responders(
  public.event_origin, text, uuid, uuid, text, text, text
) to anon, authenticated, service_role;

-- 2. A כונן reads an event once it is released -------------------------------

drop policy if exists events_select on public.events;
create policy events_select on public.events
  for select
  to authenticated
  using (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    or public.has_role(auth.uid(), 'shift_lead'::public.app_role)
    or (
      exists (
        select 1
        from public.event_responders er
        where er.event_id = events.id
          and er.responder_id = auth.uid()
      )
      and public.event_released_to_responders(
        origin,
        police_event_id,
        event_type_id,
        road_id,
        patrol_callsign_prefix,
        patrol_callsign_number,
        patrol_callsign
      )
    )
  );

-- 3. ... and writes their own row only then -----------------------------------
-- Same shape as 20261103100000 (security definer, so the self-update policy never
-- reads events inline and 42P17 cannot come back).

create or replace function public.event_is_open_for_responder_edit(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select e.status is distinct from 'done'
        and e.origin is distinct from 'shift'
        and public.event_released_to_responders(
          e.origin,
          e.police_event_id,
          e.event_type_id,
          e.road_id,
          e.patrol_callsign_prefix,
          e.patrol_callsign_number,
          e.patrol_callsign
        )
      from public.events e
      where e.id = p_event_id
    ),
    false
  );
$$;

-- 4. Partner webhooks wait for release ----------------------------------------

create or replace function public.enqueue_partner_webhook_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  event_summary jsonb;
begin
  select jsonb_build_object(
    'event_type_name', et.name,
    'event_date', e.event_date,
    'police_event_id', e.police_event_id,
    'location', e.location
  )
  into event_summary
  from public.events e
  left join public.event_types et on et.id = e.event_type_id
  where e.id = new.event_id
    and e.origin is distinct from 'shift'
    and public.event_released_to_responders(
      e.origin,
      e.police_event_id,
      e.event_type_id,
      e.road_id,
      e.patrol_callsign_prefix,
      e.patrol_callsign_number,
      e.patrol_callsign
    );

  -- A טיוטה: the update that releases it enqueues this assignment.
  if event_summary is null then
    return new;
  end if;

  insert into public.partner_webhook_events (client_id, user_id, event_type, payload)
  select
    oc.id,
    new.responder_id,
    'assignment_created',
    jsonb_build_object('event_id', new.event_id, 'event_summary', event_summary)
  from public.oauth_access_tokens oat
  join public.oauth_clients oc on oc.id = oat.client_id
  where oat.user_id = new.responder_id
    and oat.revoked_at is null
    and oat.expires_at > now()
    and oc.is_active = true
    and oc.webhook_url is not null
    and not exists (
      select 1
      from public.partner_webhook_events existing
      where existing.client_id = oc.id
        and existing.user_id = new.responder_id
        and existing.event_type = 'assignment_created'
        and existing.payload->>'event_id' = new.event_id::text
    );

  return new;
exception
  when others then
    raise warning 'enqueue_partner_webhook_events failed: %', sqlerrm;
    return new;
end;
$$;

-- Name kept from 20260922143000 so its replay and this file replace the same
-- function. It now fires on the update that releases the event, whichever
-- release field was filled last.
create or replace function public.enqueue_partner_webhooks_on_police_event_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  event_summary jsonb;
begin
  if new.origin = 'shift' then
    return new;
  end if;
  if public.event_released_to_responders(
    old.origin,
    old.police_event_id,
    old.event_type_id,
    old.road_id,
    old.patrol_callsign_prefix,
    old.patrol_callsign_number,
    old.patrol_callsign
  ) then
    return new;
  end if;
  if not public.event_released_to_responders(
    new.origin,
    new.police_event_id,
    new.event_type_id,
    new.road_id,
    new.patrol_callsign_prefix,
    new.patrol_callsign_number,
    new.patrol_callsign
  ) then
    return new;
  end if;

  select jsonb_build_object(
    'event_type_name', et.name,
    'event_date', new.event_date,
    'police_event_id', new.police_event_id,
    'location', new.location
  )
  into event_summary
  from public.event_types et
  where et.id = new.event_type_id;

  if event_summary is null then
    event_summary := jsonb_build_object(
      'event_type_name', null,
      'event_date', new.event_date,
      'police_event_id', new.police_event_id,
      'location', new.location
    );
  end if;

  insert into public.partner_webhook_events (client_id, user_id, event_type, payload)
  select
    oc.id,
    er.responder_id,
    'assignment_created',
    jsonb_build_object('event_id', new.id, 'event_summary', event_summary)
  from public.event_responders er
  join public.oauth_access_tokens oat
    on oat.user_id = er.responder_id
   and oat.revoked_at is null
   and oat.expires_at > now()
  join public.oauth_clients oc on oc.id = oat.client_id
  where er.event_id = new.id
    and oc.is_active = true
    and oc.webhook_url is not null
    and not exists (
      select 1
      from public.partner_webhook_events existing
      where existing.client_id = oc.id
        and existing.user_id = er.responder_id
        and existing.event_type = 'assignment_created'
        and existing.payload->>'event_id' = new.id::text
    );

  return new;
exception
  when others then
    raise warning 'enqueue_partner_webhooks_on_police_event_id failed: %', sqlerrm;
    return new;
end;
$$;

drop trigger if exists events_enqueue_webhooks_on_police_id on public.events;
create trigger events_enqueue_webhooks_on_police_id
  after update of
    police_event_id,
    event_type_id,
    road_id,
    patrol_callsign,
    patrol_callsign_prefix,
    patrol_callsign_number
  on public.events
  for each row
  execute function public.enqueue_partner_webhooks_on_police_event_id();

-- 5. lead_km_owed computed column ---------------------------------------------
-- Security invoker: it reveals nothing event_missing_lead_km (already granted to
-- authenticated) does not, and the caller only reaches rows RLS lets them read.

create or replace function public.lead_km_owed(e public.events)
returns boolean
language sql
stable
set search_path = public
as $$
  select public.event_missing_lead_km(e.id);
$$;

revoke all on function public.lead_km_owed(public.events) from public;
grant execute on function public.lead_km_owed(public.events) to authenticated, service_role;

notify pgrst, 'reload schema';
