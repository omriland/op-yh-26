-- Kilometers driven per month, for each person's own profile page.
-- Rebuilt by refresh_profile_lifetime_stats() twice a day (07:00 and 19:00
-- Asia/Jerusalem), so the monthly rows always add up to profiles.lifetime_km.
-- Safe to run more than once.

create table if not exists public.profile_km_monthly (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  month date not null,
  km numeric not null,
  primary key (profile_id, month)
);

comment on table public.profile_km_monthly is
  'Km per profile per month (month = first day, from events.event_date, an Asia/Jerusalem calendar date). Written only by refresh_profile_lifetime_stats().';

alter table public.profile_km_monthly enable row level security;

drop policy if exists profile_km_monthly_select_own on public.profile_km_monthly;
create policy profile_km_monthly_select_own
  on public.profile_km_monthly
  for select
  to authenticated
  using (profile_id = auth.uid());

revoke all on public.profile_km_monthly from public, anon, authenticated;
grant select on public.profile_km_monthly to authenticated;

-- Counts all lead-entered km, frozen participations included (owner's decision,
-- 25 Nov 2026): 20260910140000_responder_level_event_freeze.sql excluded them from
-- the lifetime totals, this puts them back. The fuel refund still excludes frozen
-- participations in its own report. Cancelled and demo events are not filtered.
-- The monthly rows use the same conditions, so they add up to lifetime_km.
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

  delete from public.profile_km_monthly where true;

  insert into public.profile_km_monthly (profile_id, month, km)
  select
    er.responder_id,
    date_trunc('month', e.event_date)::date,
    sum(er.total_km)
  from public.event_responders as er
  join public.events as e
    on e.id = er.event_id
  join public.profiles as pr
    on pr.id = er.responder_id
  where er.total_km is not null
  group by er.responder_id, date_trunc('month', e.event_date)::date;
end;
$$;

revoke all on function public.refresh_profile_lifetime_stats() from public, anon, authenticated;
grant execute on function public.refresh_profile_lifetime_stats() to postgres, service_role;

select public.refresh_profile_lifetime_stats();
