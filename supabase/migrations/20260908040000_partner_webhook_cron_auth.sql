-- Partner webhook delivery: authenticate the cron caller with a database-held secret.
--
-- The delivery cron used to present the Vault copy of the service_role key, and
-- partner-auth compared it to the SUPABASE_SERVICE_ROLE_KEY in its own runtime. The two
-- copies drift apart whenever that key is rotated or the runtime snapshot changes, and
-- every deliver_webhooks call answers 403 until someone notices. Both sides now read the
-- same row, so rotating the service_role key can no longer stop delivery.

create table if not exists public.partner_webhook_cron_auth (
  id boolean primary key default true,
  secret text not null,
  created_at timestamptz not null default now(),
  constraint partner_webhook_cron_auth_single_row check (id)
);

comment on table public.partner_webhook_cron_auth is
  'Single-row shared secret the delivery cron presents to partner-auth deliver_webhooks. Service-role only; never reaches a client.';

alter table public.partner_webhook_cron_auth enable row level security;
revoke all on public.partner_webhook_cron_auth from public, anon, authenticated;

insert into public.partner_webhook_cron_auth (id, secret)
values (true, encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (id) do nothing;

create or replace function public.invoke_deliver_partner_webhooks()
returns bigint
language plpgsql
security definer
set search_path = public, net, vault
as $$
declare
  cron_secret text;
  gateway_key text;
  request_id bigint;
begin
  select cron_auth.secret
    into cron_secret
  from public.partner_webhook_cron_auth as cron_auth
  where cron_auth.id
  limit 1;

  if cron_secret is null or btrim(cron_secret) = '' then
    raise warning 'invoke_deliver_partner_webhooks: missing partner_webhook_cron_auth secret';
    return null;
  end if;

  -- Still sent as apikey so the request reaches the function the same way it does today.
  -- Authorization is what deliver_webhooks actually checks.
  select btrim(ds.decrypted_secret)
    into gateway_key
  from vault.decrypted_secrets as ds
  where ds.name = 'yahpaz_service_role_key'
  limit 1;

  select net.http_post(
    url := 'https://rtvizpsfvtjowbimugns.supabase.co/functions/v1/partner-auth',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || cron_secret,
      'apikey', coalesce(gateway_key, '')
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
