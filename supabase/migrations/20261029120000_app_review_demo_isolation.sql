-- App Review demo isolation.
--
-- An App Store reviewer signs in with a demo account. That account must see
-- only demo data, and real members must never see demo data. "Demo-labelled":
--   * profiles.is_app_review_demo  the demo accounts themselves
--   * events.is_demo / shifts.is_demo  demo events and shifts
--   * every child row (assignments, media, plates, treated vehicles, secondary
--     leads, audit, prefs, shift links) is demo when its event or shift is.
-- Demo events also carry the human label "דמו - App Review" in notes.
--
-- Enforcement:
--   1. One RESTRICTIVE policy per table: a row is visible or writable only
--      when its demo-ness equals the caller's. Permissive policies still decide
--      everything else, so nothing changes for real users on real rows.
--   2. Link guards: a demo account can only be linked to demo events/shifts
--      and the other way round, whoever writes (service role included).
--   3. Profile and role guards: only the server sets the flag, a demo account
--      stays responder-only and has no phone (so no SMS path can reach it).
--   4. SECURITY DEFINER RPCs that bypass RLS and could leak or write real data
--      are patched below. docs/app-review-demo.md lists every RPC and policy.
--
-- Re-runnable: the Deploy Edge Functions workflow applies it on every run, last,
-- after 20260929082322 (which replaces events_reject_same_day_police_event_id).

alter table public.profiles
  add column if not exists is_app_review_demo boolean not null default false;
alter table public.events
  add column if not exists is_demo boolean not null default false;
alter table public.shifts
  add column if not exists is_demo boolean not null default false;

create index if not exists profiles_app_review_demo_idx on public.profiles (id) where is_app_review_demo;
create index if not exists events_is_demo_idx on public.events (id) where is_demo;
create index if not exists shifts_is_demo_idx on public.shifts (id) where is_demo;

-- ---------------------------------------------------------------------------
-- Helpers. SECURITY DEFINER so policies can call them without RLS recursion.
-- Policies wrap them in (select ...) so each runs once per statement.
-- ---------------------------------------------------------------------------

create or replace function public.is_app_review_demo_caller()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.is_app_review_demo from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

create or replace function public.app_review_demo_user_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(p.id), '{}') from public.profiles p where p.is_app_review_demo;
$$;

create or replace function public.app_review_demo_event_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(e.id), '{}') from public.events e where e.is_demo;
$$;

create or replace function public.app_review_demo_shift_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(s.id), '{}') from public.shifts s where s.is_demo;
$$;

-- event_responders rows of demo events (plates, treated vehicles and live
-- locations can point at an assignment instead of an event).
create or replace function public.app_review_demo_assignment_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(er.id), '{}')
  from public.event_responders er
  join public.events e on e.id = er.event_id
  where e.is_demo;
$$;

revoke all on function public.is_app_review_demo_caller() from public, anon;
revoke all on function public.app_review_demo_user_ids() from public, anon;
revoke all on function public.app_review_demo_event_ids() from public, anon;
revoke all on function public.app_review_demo_shift_ids() from public, anon;
revoke all on function public.app_review_demo_assignment_ids() from public, anon;
grant execute on function public.is_app_review_demo_caller() to authenticated, service_role;
grant execute on function public.app_review_demo_user_ids() to authenticated, service_role;
grant execute on function public.app_review_demo_event_ids() to authenticated, service_role;
grant execute on function public.app_review_demo_shift_ids() to authenticated, service_role;
grant execute on function public.app_review_demo_assignment_ids() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1. Restrictive policies: demo callers see demo rows only, real callers see
--    real rows only. service_role bypasses RLS (provisioning and cleanup).
-- ---------------------------------------------------------------------------

drop policy if exists profiles_app_review_demo_scope on public.profiles;
create policy profiles_app_review_demo_scope on public.profiles
  as restrictive for all to authenticated
  using (is_app_review_demo = (select public.is_app_review_demo_caller()))
  with check (is_app_review_demo = (select public.is_app_review_demo_caller()));

drop policy if exists events_app_review_demo_scope on public.events;
create policy events_app_review_demo_scope on public.events
  as restrictive for all to authenticated
  using (is_demo = (select public.is_app_review_demo_caller()))
  with check (is_demo = (select public.is_app_review_demo_caller()));

drop policy if exists shifts_app_review_demo_scope on public.shifts;
create policy shifts_app_review_demo_scope on public.shifts
  as restrictive for all to authenticated
  using (is_demo = (select public.is_app_review_demo_caller()))
  with check (is_demo = (select public.is_app_review_demo_caller()));

-- Event children keyed by event_id.
drop policy if exists event_responders_app_review_demo_scope on public.event_responders;
create policy event_responders_app_review_demo_scope on public.event_responders
  as restrictive for all to authenticated
  using (
    coalesce(event_id = any ((select public.app_review_demo_event_ids())::uuid[]), false)
      = (select public.is_app_review_demo_caller())
  )
  with check (
    coalesce(event_id = any ((select public.app_review_demo_event_ids())::uuid[]), false)
      = (select public.is_app_review_demo_caller())
  );

drop policy if exists event_media_app_review_demo_scope on public.event_media;
create policy event_media_app_review_demo_scope on public.event_media
  as restrictive for all to authenticated
  using (
    coalesce(event_id = any ((select public.app_review_demo_event_ids())::uuid[]), false)
      = (select public.is_app_review_demo_caller())
  )
  with check (
    coalesce(event_id = any ((select public.app_review_demo_event_ids())::uuid[]), false)
      = (select public.is_app_review_demo_caller())
  );

drop policy if exists event_secondary_leads_app_review_demo_scope on public.event_secondary_leads;
create policy event_secondary_leads_app_review_demo_scope on public.event_secondary_leads
  as restrictive for all to authenticated
  using (
    coalesce(event_id = any ((select public.app_review_demo_event_ids())::uuid[]), false)
      = (select public.is_app_review_demo_caller())
  )
  with check (
    coalesce(event_id = any ((select public.app_review_demo_event_ids())::uuid[]), false)
      = (select public.is_app_review_demo_caller())
  );

drop policy if exists event_audit_app_review_demo_scope on public.event_audit;
create policy event_audit_app_review_demo_scope on public.event_audit
  as restrictive for all to authenticated
  using (
    coalesce(event_id = any ((select public.app_review_demo_event_ids())::uuid[]), false)
      = (select public.is_app_review_demo_caller())
  )
  with check (
    coalesce(event_id = any ((select public.app_review_demo_event_ids())::uuid[]), false)
      = (select public.is_app_review_demo_caller())
  );

drop policy if exists my_active_event_prefs_app_review_demo_scope on public.my_active_event_prefs;
create policy my_active_event_prefs_app_review_demo_scope on public.my_active_event_prefs
  as restrictive for all to authenticated
  using (
    coalesce(event_id = any ((select public.app_review_demo_event_ids())::uuid[]), false)
      = (select public.is_app_review_demo_caller())
  )
  with check (
    coalesce(event_id = any ((select public.app_review_demo_event_ids())::uuid[]), false)
      = (select public.is_app_review_demo_caller())
  );

-- Event children keyed by event_id or by assignment.
drop policy if exists event_treated_plates_app_review_demo_scope on public.event_treated_plates;
create policy event_treated_plates_app_review_demo_scope on public.event_treated_plates
  as restrictive for all to authenticated
  using (
    coalesce(
      event_id = any ((select public.app_review_demo_event_ids())::uuid[]),
      event_responder_id = any ((select public.app_review_demo_assignment_ids())::uuid[]),
      false
    ) = (select public.is_app_review_demo_caller())
  )
  with check (
    coalesce(
      event_id = any ((select public.app_review_demo_event_ids())::uuid[]),
      event_responder_id = any ((select public.app_review_demo_assignment_ids())::uuid[]),
      false
    ) = (select public.is_app_review_demo_caller())
  );

drop policy if exists event_treated_vehicles_app_review_demo_scope on public.event_treated_vehicles;
create policy event_treated_vehicles_app_review_demo_scope on public.event_treated_vehicles
  as restrictive for all to authenticated
  using (
    coalesce(
      event_id = any ((select public.app_review_demo_event_ids())::uuid[]),
      event_responder_id = any ((select public.app_review_demo_assignment_ids())::uuid[]),
      false
    ) = (select public.is_app_review_demo_caller())
  )
  with check (
    coalesce(
      event_id = any ((select public.app_review_demo_event_ids())::uuid[]),
      event_responder_id = any ((select public.app_review_demo_assignment_ids())::uuid[]),
      false
    ) = (select public.is_app_review_demo_caller())
  );

drop policy if exists event_responder_live_locations_app_review_demo_scope on public.event_responder_live_locations;
create policy event_responder_live_locations_app_review_demo_scope
  on public.event_responder_live_locations
  as restrictive for all to authenticated
  using (
    coalesce(event_responder_id = any ((select public.app_review_demo_assignment_ids())::uuid[]), false)
      = (select public.is_app_review_demo_caller())
  )
  with check (
    coalesce(event_responder_id = any ((select public.app_review_demo_assignment_ids())::uuid[]), false)
      = (select public.is_app_review_demo_caller())
  );

-- Shift children.
drop policy if exists shift_responders_app_review_demo_scope on public.shift_responders;
create policy shift_responders_app_review_demo_scope on public.shift_responders
  as restrictive for all to authenticated
  using (
    coalesce(shift_id = any ((select public.app_review_demo_shift_ids())::uuid[]), false)
      = (select public.is_app_review_demo_caller())
  )
  with check (
    coalesce(shift_id = any ((select public.app_review_demo_shift_ids())::uuid[]), false)
      = (select public.is_app_review_demo_caller())
  );

drop policy if exists shift_events_app_review_demo_scope on public.shift_events;
create policy shift_events_app_review_demo_scope on public.shift_events
  as restrictive for all to authenticated
  using (
    coalesce(shift_id = any ((select public.app_review_demo_shift_ids())::uuid[]), false)
      = (select public.is_app_review_demo_caller())
  )
  with check (
    coalesce(shift_id = any ((select public.app_review_demo_shift_ids())::uuid[]), false)
      = (select public.is_app_review_demo_caller())
  );

drop policy if exists shift_event_type_counts_app_review_demo_scope on public.shift_event_type_counts;
create policy shift_event_type_counts_app_review_demo_scope on public.shift_event_type_counts
  as restrictive for all to authenticated
  using (
    coalesce(shift_id = any ((select public.app_review_demo_shift_ids())::uuid[]), false)
      = (select public.is_app_review_demo_caller())
  )
  with check (
    coalesce(shift_id = any ((select public.app_review_demo_shift_ids())::uuid[]), false)
      = (select public.is_app_review_demo_caller())
  );

drop policy if exists shift_treated_vehicle_counts_app_review_demo_scope on public.shift_treated_vehicle_counts;
create policy shift_treated_vehicle_counts_app_review_demo_scope
  on public.shift_treated_vehicle_counts
  as restrictive for all to authenticated
  using (
    coalesce(shift_id = any ((select public.app_review_demo_shift_ids())::uuid[]), false)
      = (select public.is_app_review_demo_caller())
  )
  with check (
    coalesce(shift_id = any ((select public.app_review_demo_shift_ids())::uuid[]), false)
      = (select public.is_app_review_demo_caller())
  );

-- Per-member tables keyed by user_id.
drop policy if exists vehicles_app_review_demo_scope on public.vehicles;
create policy vehicles_app_review_demo_scope on public.vehicles
  as restrictive for all to authenticated
  using (
    coalesce(user_id = any ((select public.app_review_demo_user_ids())::uuid[]), false)
      = (select public.is_app_review_demo_caller())
  )
  with check (
    coalesce(user_id = any ((select public.app_review_demo_user_ids())::uuid[]), false)
      = (select public.is_app_review_demo_caller())
  );

drop policy if exists user_addresses_app_review_demo_scope on public.user_addresses;
create policy user_addresses_app_review_demo_scope on public.user_addresses
  as restrictive for all to authenticated
  using (
    coalesce(user_id = any ((select public.app_review_demo_user_ids())::uuid[]), false)
      = (select public.is_app_review_demo_caller())
  )
  with check (
    coalesce(user_id = any ((select public.app_review_demo_user_ids())::uuid[]), false)
      = (select public.is_app_review_demo_caller())
  );

drop policy if exists user_roles_app_review_demo_scope on public.user_roles;
create policy user_roles_app_review_demo_scope on public.user_roles
  as restrictive for all to authenticated
  using (
    coalesce(user_id = any ((select public.app_review_demo_user_ids())::uuid[]), false)
      = (select public.is_app_review_demo_caller())
  )
  with check (
    coalesce(user_id = any ((select public.app_review_demo_user_ids())::uuid[]), false)
      = (select public.is_app_review_demo_caller())
  );

drop policy if exists user_feedback_app_review_demo_scope on public.user_feedback;
create policy user_feedback_app_review_demo_scope on public.user_feedback
  as restrictive for all to authenticated
  using (
    coalesce(user_id = any ((select public.app_review_demo_user_ids())::uuid[]), false)
      = (select public.is_app_review_demo_caller())
  )
  with check (
    coalesce(user_id = any ((select public.app_review_demo_user_ids())::uuid[]), false)
      = (select public.is_app_review_demo_caller())
  );

drop policy if exists ios_devices_app_review_demo_scope on public.ios_devices;
create policy ios_devices_app_review_demo_scope on public.ios_devices
  as restrictive for all to authenticated
  using (
    coalesce(user_id = any ((select public.app_review_demo_user_ids())::uuid[]), false)
      = (select public.is_app_review_demo_caller())
  )
  with check (
    coalesce(user_id = any ((select public.app_review_demo_user_ids())::uuid[]), false)
      = (select public.is_app_review_demo_caller())
  );

-- A demo account never holds a push token, so no broadcast reaches the
-- reviewer's phone.
drop policy if exists device_tokens_app_review_demo_scope on public.device_tokens;
create policy device_tokens_app_review_demo_scope on public.device_tokens
  as restrictive for all to authenticated
  using (not (select public.is_app_review_demo_caller()))
  with check (not (select public.is_app_review_demo_caller()));

-- Storage: event photos live under <event_id>/, feedback files under <user_id>/.
drop policy if exists storage_app_review_demo_scope on storage.objects;
create policy storage_app_review_demo_scope on storage.objects
  as restrictive for all to authenticated
  using (
    case bucket_id
      when 'event-media' then
        coalesce(
          public.event_media_path_event_id(name) = any ((select public.app_review_demo_event_ids())::uuid[]),
          false
        ) = (select public.is_app_review_demo_caller())
      when 'user-feedback' then
        coalesce(
          public.user_feedback_path_user_id(name) = any ((select public.app_review_demo_user_ids())::uuid[]),
          false
        ) = (select public.is_app_review_demo_caller())
      else true
    end
  )
  with check (
    case bucket_id
      when 'event-media' then
        coalesce(
          public.event_media_path_event_id(name) = any ((select public.app_review_demo_event_ids())::uuid[]),
          false
        ) = (select public.is_app_review_demo_caller())
      when 'user-feedback' then
        coalesce(
          public.user_feedback_path_user_id(name) = any ((select public.app_review_demo_user_ids())::uuid[]),
          false
        ) = (select public.is_app_review_demo_caller())
      else true
    end
  );

-- ---------------------------------------------------------------------------
-- 2. Link guards. Applies to every writer, service role included.
-- ---------------------------------------------------------------------------

create or replace function public.guard_app_review_demo_link()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_users uuid[] := public.app_review_demo_user_ids();
  v_ok boolean;
begin
  case tg_table_name
    when 'events' then
      -- Shift-born events inherit the shift's label.
      if new.shift_id is not null then
        new.is_demo := new.shift_id = any (public.app_review_demo_shift_ids());
      end if;
      v_ok := new.is_demo = (new.shift_lead_id = any (v_users));
    when 'shifts' then
      v_ok := new.is_demo = (new.shift_lead_id = any (v_users));
    when 'event_responders' then
      v_ok := (new.event_id = any (public.app_review_demo_event_ids()))
        = (new.responder_id = any (v_users));
    when 'event_secondary_leads' then
      v_ok := (new.event_id = any (public.app_review_demo_event_ids()))
        = (new.user_id = any (v_users));
    when 'shift_responders' then
      v_ok := (new.shift_id = any (public.app_review_demo_shift_ids()))
        = (new.responder_id = any (v_users));
    when 'shift_events' then
      v_ok := (new.shift_id = any (public.app_review_demo_shift_ids()))
        = (new.event_id = any (public.app_review_demo_event_ids()));
  end case;
  if v_ok is not true then
    raise exception 'חשבון דמו (App Review) ונתוני דמו מקושרים רק זה לזה.';
  end if;
  return new;
end;
$$;

drop trigger if exists events_app_review_demo_link on public.events;
create trigger events_app_review_demo_link
  before insert or update on public.events
  for each row execute function public.guard_app_review_demo_link();
drop trigger if exists shifts_app_review_demo_link on public.shifts;
create trigger shifts_app_review_demo_link
  before insert or update on public.shifts
  for each row execute function public.guard_app_review_demo_link();
drop trigger if exists event_responders_app_review_demo_link on public.event_responders;
create trigger event_responders_app_review_demo_link
  before insert or update on public.event_responders
  for each row execute function public.guard_app_review_demo_link();
drop trigger if exists event_secondary_leads_app_review_demo_link on public.event_secondary_leads;
create trigger event_secondary_leads_app_review_demo_link
  before insert or update on public.event_secondary_leads
  for each row execute function public.guard_app_review_demo_link();
drop trigger if exists shift_responders_app_review_demo_link on public.shift_responders;
create trigger shift_responders_app_review_demo_link
  before insert or update on public.shift_responders
  for each row execute function public.guard_app_review_demo_link();
drop trigger if exists shift_events_app_review_demo_link on public.shift_events;
create trigger shift_events_app_review_demo_link
  before insert or update on public.shift_events
  for each row execute function public.guard_app_review_demo_link();

-- ---------------------------------------------------------------------------
-- 3. Profile, role and partner-link guards.
-- ---------------------------------------------------------------------------

create or replace function public.guard_app_review_demo_profile()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Only the server (service role / no JWT) sets or clears the flag. The demo
  -- user cannot clear it, and an admin cannot turn a member into a demo.
  if auth.uid() is not null
     and new.is_app_review_demo is distinct from old.is_app_review_demo then
    raise exception 'סימון חשבון דמו ניתן לשינוי רק דרך השרת';
  end if;
  if new.is_app_review_demo then
    -- Every SMS path (OTP, tracking, feedback replies, broadcasts) reads
    -- profiles.phone, so a demo account must not have one.
    if new.phone is not null then
      raise exception 'לחשבון דמו אין מספר טלפון';
    end if;
    if exists (
      select 1 from public.user_roles ur
      where ur.user_id = new.id and ur.role <> 'responder'
    ) then
      raise exception 'חשבון דמו חייב להיות מתנדב בלבד';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_app_review_demo on public.profiles;
create trigger profiles_guard_app_review_demo
  before update on public.profiles
  for each row execute function public.guard_app_review_demo_profile();

create or replace function public.guard_app_review_demo_role()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.role <> 'responder' and new.user_id = any (public.app_review_demo_user_ids()) then
    raise exception 'חשבון דמו חייב להיות מתנדב בלבד';
  end if;
  return new;
end;
$$;

drop trigger if exists user_roles_guard_app_review_demo on public.user_roles;
create trigger user_roles_guard_app_review_demo
  before insert or update on public.user_roles
  for each row execute function public.guard_app_review_demo_role();

-- Partner apps (Telegram bots) act through responder-api with the service
-- role and receive assignment webhooks. A demo account never links one.
create or replace function public.guard_app_review_demo_oauth()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.user_id = any (public.app_review_demo_user_ids()) then
    raise exception 'חשבון דמו אינו יכול לחבר אפליקציה חיצונית';
  end if;
  return new;
end;
$$;

drop trigger if exists oauth_authorization_codes_guard_app_review_demo on public.oauth_authorization_codes;
create trigger oauth_authorization_codes_guard_app_review_demo
  before insert or update on public.oauth_authorization_codes
  for each row execute function public.guard_app_review_demo_oauth();
drop trigger if exists oauth_access_tokens_guard_app_review_demo on public.oauth_access_tokens;
create trigger oauth_access_tokens_guard_app_review_demo
  before insert or update on public.oauth_access_tokens
  for each row execute function public.guard_app_review_demo_oauth();

-- ---------------------------------------------------------------------------
-- 4. SECURITY DEFINER RPCs that bypass RLS.
-- ---------------------------------------------------------------------------

-- Contacts: a demo caller sees only demo members, a real caller never does.
create or replace function public.list_unit_contacts()
returns table (
  id uuid,
  full_name text,
  callsign text,
  phone text,
  email text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.full_name, p.callsign, p.phone, p.email
  from public.profiles p
  where auth.uid() is not null
    and exists (
      select 1
      from public.profiles me
      where me.id = auth.uid()
        and me.active
        and me.is_app_review_demo = p.is_app_review_demo
    )
    and p.active
    and not p.invite_pending
    and p.id <> auth.uid()
  order by p.full_name;
$$;

-- Map pins: same rule as contacts.
create or replace function public.list_unit_map_pins()
returns table (
  user_id uuid,
  full_name text,
  callsign text,
  kind public.address_kind,
  label text,
  formatted_address text,
  lat double precision,
  lng double precision,
  volunteer_status public.volunteer_status,
  availability public.availability_status,
  available_from date
)
language sql
stable
security definer
set search_path = public
as $$
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
        and me.is_app_review_demo = p.is_app_review_demo
    )
    and p.active
    and not p.invite_pending
    and p.volunteer_status not in (
      'administration'::public.volunteer_status,
      'basic_training'::public.volunteer_status,
      'shifts_only'::public.volunteer_status
    )
  order by p.callsign, a.kind;
$$;

-- Returns any member's plate for a user id. 20260901120000 meant it for the
-- service role only, but Supabase's default grants left it callable by
-- anon/authenticated. Its only caller is a SECURITY DEFINER trigger.
revoke execute on function public.default_vehicle_plate_for_user(uuid) from anon, authenticated;

-- Ad Hoc iOS enrollment goes to a super admin for approval.
create or replace function public.mint_ios_enroll_token()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  active int;
  tok text;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  if public.is_app_review_demo_caller() then
    raise exception 'forbidden' using errcode = 'P0001';
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
$$;

-- Push tokens: a no-op for a demo account (the app ignores the result).
create or replace function public.upsert_device_token(
  p_token text,
  p_platform text,
  p_environment text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'יש להתחבר מחדש.';
  end if;
  if public.is_app_review_demo_caller() then
    return;
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
$$;

-- Callable by any member for any event id. A demo caller could otherwise add a
-- real shift lead to a real event.
create or replace function public.upsert_locked_secondary_lead(p_event_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_main uuid;
begin
  if p_event_id is null or p_user_id is null then
    return;
  end if;
  if public.is_app_review_demo_caller() then
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
$$;

-- Same-day police event number check: a demo event and a real event never
-- block each other (the real lead could not even see what blocked them).
create or replace function public.events_reject_same_day_police_event_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
      and e.is_demo = new.is_demo
      and e.event_date = new.event_date
      and nullif(btrim(coalesce(e.police_event_id, '')), '') is not null
      and btrim(e.police_event_id) = v_police_id
  ) then
    raise exception 'כבר קיים אירוע עם המספר הזה באותו תאריך.'
      using errcode = '23505';
  end if;

  return new;
end;
$$;
