-- Outdated iPhone apps may not save a responder report.
--
-- iPhone builds 1-8 (the AltStore app from 2026-08-17 and the first Ad Hoc builds of
-- 2026-09-04) have no treated vehicles, treated plates or photos in their report and
-- no update check, so every report they save is missing those parts and the app never
-- asks to update. On 2026-11-03 nine members were still on build 2 (event 815).
--
-- The app is identified by its User-Agent, "Yahpaz/<CFBundleVersion> CFNetwork/…".
-- Builds 9 and up (Ad Hoc 9-16, the App Store build 17) are untouched; future App Store
-- builds must keep CFBundleVersion >= 9. The web, Android and edge functions send other
-- user agents. A missing or unreadable header never blocks.
--
-- The old app shows its own fixed text on any failed save ("שמירת הדיווח נכשלה…"),
-- not this message; members on it must be told to install the current app.

create or replace function public.is_outdated_ios_app_request()
returns boolean
language plpgsql
stable
set search_path = public
as $$
begin
  return coalesce(
    nullif(current_setting('request.headers', true), '')::json ->> 'user-agent',
    ''
  ) ~ '^Yahpaz/[1-8] ';
exception when others then
  return false;
end;
$$;

revoke all on function public.is_outdated_ios_app_request() from public, anon;
grant execute on function public.is_outdated_ios_app_request() to authenticated, service_role;

create or replace function public.reject_outdated_ios_report_save()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.is_outdated_ios_app_request() then
    raise exception 'גרסת האפליקציה באייפון ישנה ואינה שומרת רכבים מטופלים ותמונות. יש להתקין את הגרסה החדשה או לתעד באתר yahpz.com.';
  end if;
  return new;
end;
$$;

drop trigger if exists event_responders_reject_outdated_ios on public.event_responders;
create trigger event_responders_reject_outdated_ios
  before update on public.event_responders
  for each row
  execute function public.reject_outdated_ios_report_save();
