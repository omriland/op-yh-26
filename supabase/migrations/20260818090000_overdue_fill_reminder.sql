-- Overdue responder fill: clock from first total_km, 48h/7d reminder mail.

create extension if not exists pg_net;

alter table public.event_responders
  add column if not exists fill_completable_at timestamptz,
  add column if not exists overdue_48h_emailed_at timestamptz,
  add column if not exists overdue_7d_emailed_at timestamptz;

comment on column public.event_responders.fill_completable_at is
  'First time lead total_km became non-null. Sticky clock for overdue fill UI/mail.';
comment on column public.event_responders.overdue_48h_emailed_at is
  'Set only after a successful 48h overdue-fill email.';
comment on column public.event_responders.overdue_7d_emailed_at is
  'Set only after a successful 7d overdue-fill email.';

-- Backfill before the guard trigger so postgres can write the stamp.
update public.event_responders
set fill_completable_at = coalesce(fill_ready_emailed_at, now())
where total_km is not null
  and fill_completable_at is null;

create or replace function public.guard_fill_overdue_columns()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if auth.role() is distinct from 'service_role' then
      new.fill_completable_at := case
        when new.total_km is not null then now()
        else null
      end;
      new.overdue_48h_emailed_at := null;
      new.overdue_7d_emailed_at := null;
    elsif new.total_km is not null then
      new.fill_completable_at := coalesce(new.fill_completable_at, now());
    end if;
    return new;
  end if;

  if new.total_km is not null and old.total_km is null then
    new.fill_completable_at := coalesce(old.fill_completable_at, now());
  else
    new.fill_completable_at := old.fill_completable_at;
  end if;

  if auth.role() is distinct from 'service_role' then
    new.overdue_48h_emailed_at := old.overdue_48h_emailed_at;
    new.overdue_7d_emailed_at := old.overdue_7d_emailed_at;
  end if;

  return new;
end;
$$;

drop trigger if exists event_responders_guard_fill_overdue on public.event_responders;
create trigger event_responders_guard_fill_overdue
  before insert or update on public.event_responders
  for each row
  execute function public.guard_fill_overdue_columns();

create or replace function public.invoke_notify_overdue_fills()
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
    raise warning 'invoke_notify_overdue_fills: missing vault secret yahpaz_service_role_key';
    return null;
  end if;

  select net.http_post(
    url := 'https://rtvizpsfvtjowbimugns.supabase.co/functions/v1/responder-fill',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || secret,
      'apikey', secret
    ),
    body := '{"action":"notify_overdue_fills"}'::jsonb,
    timeout_milliseconds := 50000
  )
  into request_id;

  return request_id;
end;
$$;

revoke all on function public.invoke_notify_overdue_fills() from public, anon, authenticated;
grant execute on function public.invoke_notify_overdue_fills() to postgres;

do $$
begin
  perform cron.unschedule('notify-overdue-fills');
exception
  when others then null;
end;
$$;

select cron.schedule(
  'notify-overdue-fills',
  '15 * * * *',
  $cmd$select public.invoke_notify_overdue_fills()$cmd$
);
