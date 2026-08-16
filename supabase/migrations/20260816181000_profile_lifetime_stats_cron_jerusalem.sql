-- Fix cron schedule: honor 07:00 and 19:00 Asia/Jerusalem year-round (DST-safe).
-- Original migration already applied with UTC-fixed 0 4,16 * * * schedule.

do $$
begin
  perform cron.unschedule('refresh-profile-lifetime-stats');
exception
  when others then null;
end;
$$;

select cron.schedule(
  'refresh-profile-lifetime-stats',
  '0 * * * *',
  $cmd$select public.refresh_profile_lifetime_stats()
    where extract(hour from timezone('Asia/Jerusalem', now())) in (7, 19)$cmd$
);
