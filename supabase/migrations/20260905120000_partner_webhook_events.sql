-- Partner webhook (Telegram bot): assignment_created notifications. Outbox + delivery config.

alter table public.oauth_clients
  add column if not exists webhook_url text,
  add column if not exists webhook_secret text;

comment on column public.oauth_clients.webhook_url is
  'Where to POST assignment_created notifications. Null = not configured, no webhook delivery.';
comment on column public.oauth_clients.webhook_secret is
  'Plaintext HMAC-SHA256 signing key for outbound webhooks. Not hashed: the bot server needs the same plaintext to verify X-Yahpaz-Signature.';

create table if not exists public.partner_webhook_events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.oauth_clients (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  event_type text not null,
  payload jsonb not null,
  attempts int not null default 0,
  last_attempt_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists partner_webhook_events_undelivered_idx
  on public.partner_webhook_events (created_at)
  where delivered_at is null;

comment on table public.partner_webhook_events is
  'Outbox for signed webhook deliveries to partner bot servers (e.g. assignment_created). Service-role only.';

alter table public.partner_webhook_events enable row level security;
revoke all on public.partner_webhook_events from public, anon, authenticated;

-- Enqueue one outbox row per (client, volunteer) with an active grant + configured webhook_url,
-- whenever a volunteer gets a new event assignment.
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
  where e.id = new.event_id;

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
    and oc.webhook_url is not null;

  return new;
exception
  when others then
    raise warning 'enqueue_partner_webhook_events failed: %', sqlerrm;
    return new;
end;
$$;

drop trigger if exists event_responders_enqueue_webhooks on public.event_responders;
create trigger event_responders_enqueue_webhooks
  after insert on public.event_responders
  for each row
  execute function public.enqueue_partner_webhook_events();

-- Scheduled delivery worker (mirrors invoke_notify_overdue_fills in 20260818090000_overdue_fill_reminder.sql).
create or replace function public.invoke_deliver_partner_webhooks()
returns bigint
language plpgsql
security definer
set search_path = public, net, vault
as $$
declare
  secret text;
  request_id bigint;
begin
  select ds.decrypted_secret
    into secret
  from vault.decrypted_secrets as ds
  where ds.name = 'yahpaz_service_role_key'
  limit 1;

  if secret is null or btrim(secret) = '' then
    raise warning 'invoke_deliver_partner_webhooks: missing vault secret yahpaz_service_role_key';
    return null;
  end if;

  select net.http_post(
    url := 'https://rtvizpsfvtjowbimugns.supabase.co/functions/v1/partner-auth',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || secret,
      'apikey', secret
    ),
    body := '{"action":"deliver_webhooks"}'::jsonb,
    timeout_milliseconds := 50000
  )
  into request_id;

  return request_id;
end;
$$;

revoke all on function public.invoke_deliver_partner_webhooks() from public, anon, authenticated;
grant execute on function public.invoke_deliver_partner_webhooks() to postgres;

do $$
begin
  perform cron.unschedule('deliver-partner-webhooks');
exception
  when others then null;
end;
$$;

select cron.schedule(
  'deliver-partner-webhooks',
  '* * * * *',
  $cmd$select public.invoke_deliver_partner_webhooks()$cmd$
);
