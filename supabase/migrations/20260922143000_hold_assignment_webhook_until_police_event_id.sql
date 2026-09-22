-- Hold assignment_created webhooks until the lead enters police_event_id (מספר אירוע).
-- Insert still creates event_responders; Telegram / partner bots only hear about it
-- once the event has a police id. Filling that field later flushes the held assignments.

create or replace function public.enqueue_partner_webhook_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  event_summary jsonb;
  police_id text;
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
  where e.id = new.event_id;

  if event_summary is null then
    return new;
  end if;

  police_id := nullif(btrim(coalesce(event_summary->>'police_event_id', '')), '');
  if police_id is null then
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

create or replace function public.enqueue_partner_webhooks_on_police_event_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  event_summary jsonb;
begin
  if nullif(btrim(coalesce(old.police_event_id, '')), '') is not null then
    return new;
  end if;
  if nullif(btrim(coalesce(new.police_event_id, '')), '') is null then
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
  after update of police_event_id on public.events
  for each row
  execute function public.enqueue_partner_webhooks_on_police_event_id();
