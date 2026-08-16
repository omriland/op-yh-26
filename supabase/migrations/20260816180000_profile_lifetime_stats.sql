create extension if not exists pg_cron;

alter table public.profiles
  add column if not exists lifetime_event_count integer not null default 0,
  add column if not exists lifetime_km numeric not null default 0,
  add column if not exists lifetime_stats_updated_at timestamptz;

create or replace function public.protect_profile_lifetime_stats()
returns trigger
language plpgsql
as $$
begin
  if current_setting('yahpaz.refreshing_lifetime_stats', true) = '1' then
    return new;
  end if;
  new.lifetime_event_count := old.lifetime_event_count;
  new.lifetime_km := old.lifetime_km;
  new.lifetime_stats_updated_at := old.lifetime_stats_updated_at;
  return new;
end;
$$;

drop trigger if exists protect_profile_lifetime_stats on public.profiles;
create trigger protect_profile_lifetime_stats
  before update on public.profiles
  for each row
  execute function public.protect_profile_lifetime_stats();

create or replace function public.refresh_profile_lifetime_stats()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('yahpaz.refreshing_lifetime_stats', '1', true);

  update public.profiles as p
  set
    lifetime_event_count = s.event_count,
    lifetime_km = s.total_km,
    lifetime_stats_updated_at = now()
  from (
    select
      pr.id as profile_id,
      count(er.id)::integer as event_count,
      coalesce(sum(er.total_km), 0) as total_km
    from public.profiles as pr
    left join public.event_responders as er
      on er.responder_id = pr.id
      and er.total_km is not null
    group by pr.id
  ) as s
  where p.id = s.profile_id;
end;
$$;

revoke all on function public.refresh_profile_lifetime_stats() from public, anon, authenticated;
grant execute on function public.refresh_profile_lifetime_stats() to postgres, service_role;

select public.refresh_profile_lifetime_stats();

do $$
begin
  perform cron.unschedule('refresh-profile-lifetime-stats');
exception
  when others then null;
end;
$$;

-- pg_cron 1.6.4 has no timezone arg; hourly cron with Asia/Jerusalem hour guard.
select cron.schedule(
  'refresh-profile-lifetime-stats',
  '0 * * * *',
  $cmd$select public.refresh_profile_lifetime_stats()
    where extract(hour from timezone('Asia/Jerusalem', now())) in (7, 19)$cmd$
);
