-- Rollback for supabase/migrations/20261029120000_app_review_demo_isolation.sql.
-- Restores the schema exactly as it was before that migration (function bodies
-- come from pg_get_functiondef on a replay of every earlier migration).
--
-- Run the teardown first (scripts/app-review-demo/remove-app-review-demo.mjs):
-- with the policies gone, any demo rows left would become visible to everyone,
-- so this file refuses while demo rows exist.
--
--   supabase db query --linked --project-ref rtvizpsfvtjowbimugns \
--     -f scripts/app-review-demo/rollback-20261029120000.sql

begin;

do $$
begin
  if exists (select 1 from public.profiles where is_app_review_demo)
     or exists (select 1 from public.events where is_demo)
     or exists (select 1 from public.shifts where is_demo) then
    raise exception 'Demo rows still exist. Run remove-app-review-demo.mjs first.';
  end if;
end
$$;

-- RPCs and the same-day trigger function, as before the migration.
CREATE OR REPLACE FUNCTION public.events_reject_same_day_police_event_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_police_id text;
begin
  if new.is_cancelled then
    return new;
  end if;

  v_police_id := nullif(btrim(coalesce(new.police_event_id, '')), '');
  if v_police_id is null then
    return new;
  end if;

  -- Grandfather: this row already holds this active pair (including the
  -- known 5523 / 2026-09-08 drafts). Do not block note-only saves.
  if tg_op = 'UPDATE'
     and old.is_cancelled = false
     and old.police_event_id is not distinct from new.police_event_id
     and old.event_date is not distinct from new.event_date then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtext(v_police_id),
    hashtext(new.event_date::text)
  );

  if exists (
    select 1
    from public.events e
    where e.id is distinct from new.id
      and e.is_cancelled = false
      and e.event_date = new.event_date
      and nullif(btrim(coalesce(e.police_event_id, '')), '') is not null
      and btrim(e.police_event_id) = v_police_id
  ) then
    raise exception 'כבר קיים אירוע עם המספר הזה באותו תאריך.'
      using errcode = '23505';
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.list_unit_contacts()
 RETURNS TABLE(id uuid, full_name text, callsign text, phone text, email text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p.id, p.full_name, p.callsign, p.phone, p.email
  from public.profiles p
  where auth.uid() is not null
    and exists (
      select 1
      from public.profiles me
      where me.id = auth.uid()
        and me.active
    )
    and p.active
    and not p.invite_pending
    and p.id <> auth.uid()
  order by p.full_name;
$function$
;
CREATE OR REPLACE FUNCTION public.list_unit_map_pins()
 RETURNS TABLE(user_id uuid, full_name text, callsign text, kind address_kind, label text, formatted_address text, lat double precision, lng double precision, volunteer_status volunteer_status, availability availability_status, available_from date)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    p.id,
    p.full_name,
    p.callsign,
    a.kind,
    a.label,
    a.formatted_address,
    a.lat,
    a.lng,
    p.volunteer_status,
    p.availability,
    p.available_from
  from public.user_addresses a
  join public.profiles p on p.id = a.user_id
  where auth.uid() is not null
    and exists (
      select 1
      from public.profiles me
      where me.id = auth.uid()
        and me.active
    )
    and p.active
    and not p.invite_pending
    and p.volunteer_status not in (
      'administration'::public.volunteer_status,
      'basic_training'::public.volunteer_status,
      'shifts_only'::public.volunteer_status
    )
  order by p.callsign, a.kind;
$function$
;
CREATE OR REPLACE FUNCTION public.mint_ios_enroll_token()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := auth.uid();
  active int;
  tok text;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  select count(*)::int into active
  from public.ios_devices
  where user_id = uid
    and status in ('pending', 'approved', 'registered');
  if active >= 2 then
    raise exception 'ios_device_cap' using errcode = 'P0001';
  end if;
  tok := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.ios_enroll_tokens (token, user_id, expires_at)
  values (tok, uid, now() + interval '30 minutes');
  return tok;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.upsert_device_token(p_token text, p_platform text, p_environment text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'יש להתחבר מחדש.';
  end if;
  if p_platform is distinct from 'ios' then
    raise exception 'פלטפורמה לא נתמכת.';
  end if;
  if p_environment not in ('sandbox', 'production') then
    raise exception 'סביבה לא נתמכת.';
  end if;
  if p_token is null or length(trim(p_token)) < 16 then
    raise exception 'טוקן לא תקין.';
  end if;

  insert into public.device_tokens (user_id, token, platform, environment, updated_at)
  values (auth.uid(), trim(p_token), p_platform, p_environment, now())
  on conflict (token) do update
    set user_id = excluded.user_id,
        platform = excluded.platform,
        environment = excluded.environment,
        updated_at = now();
end;
$function$
;
CREATE OR REPLACE FUNCTION public.upsert_locked_secondary_lead(p_event_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_main uuid;
begin
  if p_event_id is null or p_user_id is null then
    return;
  end if;
  if not public.has_role(p_user_id, 'shift_lead') then
    return;
  end if;
  select e.shift_lead_id into v_main from public.events e where e.id = p_event_id;
  if v_main is null or v_main = p_user_id then
    return;
  end if;
  insert into public.event_secondary_leads (event_id, user_id, locked)
  values (p_event_id, p_user_id, true)
  on conflict (event_id, user_id) do update
    set locked = true;
end;
$function$
;

-- 20261029120000 revoked this from anon/authenticated; restore the old grants.
grant execute on function public.default_vehicle_plate_for_user(uuid) to anon, authenticated;

-- Guards.
drop trigger if exists events_app_review_demo_link on public.events;
drop trigger if exists shifts_app_review_demo_link on public.shifts;
drop trigger if exists event_responders_app_review_demo_link on public.event_responders;
drop trigger if exists event_secondary_leads_app_review_demo_link on public.event_secondary_leads;
drop trigger if exists shift_responders_app_review_demo_link on public.shift_responders;
drop trigger if exists shift_events_app_review_demo_link on public.shift_events;
drop trigger if exists profiles_guard_app_review_demo on public.profiles;
drop trigger if exists user_roles_guard_app_review_demo on public.user_roles;
drop trigger if exists oauth_authorization_codes_guard_app_review_demo on public.oauth_authorization_codes;
drop trigger if exists oauth_access_tokens_guard_app_review_demo on public.oauth_access_tokens;
drop function if exists public.guard_app_review_demo_link();
drop function if exists public.guard_app_review_demo_profile();
drop function if exists public.guard_app_review_demo_role();
drop function if exists public.guard_app_review_demo_oauth();

-- Restrictive policies.
drop policy if exists profiles_app_review_demo_scope on public.profiles;
drop policy if exists events_app_review_demo_scope on public.events;
drop policy if exists shifts_app_review_demo_scope on public.shifts;
drop policy if exists event_responders_app_review_demo_scope on public.event_responders;
drop policy if exists event_media_app_review_demo_scope on public.event_media;
drop policy if exists event_secondary_leads_app_review_demo_scope on public.event_secondary_leads;
drop policy if exists event_audit_app_review_demo_scope on public.event_audit;
drop policy if exists my_active_event_prefs_app_review_demo_scope on public.my_active_event_prefs;
drop policy if exists event_treated_plates_app_review_demo_scope on public.event_treated_plates;
drop policy if exists event_treated_vehicles_app_review_demo_scope on public.event_treated_vehicles;
drop policy if exists event_responder_live_locations_app_review_demo_scope on public.event_responder_live_locations;
drop policy if exists shift_responders_app_review_demo_scope on public.shift_responders;
drop policy if exists shift_events_app_review_demo_scope on public.shift_events;
drop policy if exists shift_event_type_counts_app_review_demo_scope on public.shift_event_type_counts;
drop policy if exists shift_treated_vehicle_counts_app_review_demo_scope on public.shift_treated_vehicle_counts;
drop policy if exists vehicles_app_review_demo_scope on public.vehicles;
drop policy if exists user_addresses_app_review_demo_scope on public.user_addresses;
drop policy if exists user_roles_app_review_demo_scope on public.user_roles;
drop policy if exists user_feedback_app_review_demo_scope on public.user_feedback;
drop policy if exists ios_devices_app_review_demo_scope on public.ios_devices;
drop policy if exists device_tokens_app_review_demo_scope on public.device_tokens;
drop policy if exists storage_app_review_demo_scope on storage.objects;

-- Helpers, indexes, columns.
drop function if exists public.is_app_review_demo_caller();
drop function if exists public.app_review_demo_user_ids();
drop function if exists public.app_review_demo_event_ids();
drop function if exists public.app_review_demo_shift_ids();
drop function if exists public.app_review_demo_assignment_ids();
drop index if exists public.profiles_app_review_demo_idx;
drop index if exists public.events_is_demo_idx;
drop index if exists public.shifts_is_demo_idx;
alter table public.profiles drop column if exists is_app_review_demo;
alter table public.events drop column if exists is_demo;
alter table public.shifts drop column if exists is_demo;

commit;
