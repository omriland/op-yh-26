-- Self-service account deletion (App Store guideline 5.1.1(v)).
--
-- Used by the delete-account edge function (a member deletes their own
-- account) and by admin-users "delete". Deleting an account keeps the
-- profiles row as an anonymized, inactive placeholder, so events, shifts,
-- reports, fuel refunds and audit rows that point at it stay valid. Personal
-- data, the member's files and the login itself are removed.
--
-- Re-runnable: the deploy workflow applies this file on every push.
-- Rollback: scripts/delete-account/rollback-20261103180000.sql
-- Test:     scripts/app-review-demo/test/run-local-db.sh scripts/delete-account/test/delete-account.sql

-- 1. The profile must outlive its auth user. Every other reference to
--    auth.users cascades or sets null, so this is the only constraint that
--    would wipe the profile (and fail on its NO ACTION references).
alter table public.profiles drop constraint if exists profiles_id_fkey;

-- 2. Marks a deleted (anonymized) profile. Admin user lists hide these rows.
alter table public.profiles add column if not exists deleted_at timestamptz;

-- 3. "View as" sessions are recorded, so an account can never be deleted from
--    a super admin's impersonation session.
alter table public.impersonation_audit add column if not exists session_id uuid;
create index if not exists impersonation_audit_session_id_idx
  on public.impersonation_audit (session_id)
  where session_id is not null;

-- 4. Media on a cancelled event is otherwise frozen. Account deletion alone may
--    remove the member's own photos and videos from it.
create or replace function public.event_media_not_cancelled()
returns trigger
language plpgsql
as $$
declare
  cancelled boolean;
  target_event uuid;
begin
  if tg_op = 'DELETE' and current_setting('yahpaz.deleting_account', true) = '1' then
    return old;
  end if;
  target_event := coalesce(new.event_id, old.event_id);
  select e.is_cancelled into cancelled from public.events e where e.id = target_event;
  if cancelled then
    raise exception 'event_cancelled' using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- 5. A shift's personal vehicle is otherwise locked to leads and admins (the
--    server has no role, so it is locked for the server too). Account deletion
--    alone may detach the member's vehicle before deleting it. Body otherwise
--    identical to 20260811140000_shift_identity_fields_lock.sql.
create or replace function public.enforce_shift_identity_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('yahpaz.deleting_account', true) = '1' then
    return new;
  end if;

  if public.has_role(auth.uid(), 'admin')
     or public.has_role(auth.uid(), 'shift_lead') then
    return new;
  end if;

  if new.shift_date is distinct from old.shift_date
     or new.shift_kind is distinct from old.shift_kind
     or new.vehicle_type is distinct from old.vehicle_type
     or new.personal_vehicle_id is distinct from old.personal_vehicle_id then
    raise exception 'אין הרשאה לשנות פרטי משמרת';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_shift_identity_edit() from public;

-- 6. The routine. Server only (service role / no end-user JWT).
--    Returns {"status":"simulated"} for the App Review demo account (nothing
--    changes), or {"status":"deleted","storage":[{"bucket","path"}...]} with
--    the files the caller must remove from Storage after the commit.
--    Errors (message): server_only, account_not_found, account_already_deleted,
--    account_is_super_admin, account_is_last_admin.
create or replace function public.delete_user_account(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target public.profiles%rowtype;
  files jsonb;
begin
  if auth.uid() is not null then
    raise exception 'server_only';
  end if;

  -- One deletion at a time, so two admins cannot both pass the last-admin check.
  perform pg_advisory_xact_lock(hashtext('public.delete_user_account'));

  select * into target from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'account_not_found';
  end if;
  if target.deleted_at is not null then
    raise exception 'account_already_deleted';
  end if;
  if target.is_app_review_demo then
    return jsonb_build_object('status', 'simulated');
  end if;
  if public.has_role(p_user_id, 'super_admin') then
    raise exception 'account_is_super_admin';
  end if;
  if public.has_role(p_user_id, 'admin') and not exists (
    select 1
    from public.user_roles ur
    join public.profiles p on p.id = ur.user_id
    where ur.role = 'admin'
      and ur.user_id <> p_user_id
      and p.active
      and p.deleted_at is null
  ) then
    raise exception 'account_is_last_admin';
  end if;

  select coalesce(jsonb_agg(f), '[]'::jsonb) into files
  from (
    select jsonb_build_object('bucket', 'event-media', 'path', m.storage_path) as f
    from public.event_media m
    where m.uploaded_by = p_user_id
    union all
    select jsonb_build_object('bucket', 'user-feedback', 'path', uf.audio_storage_path)
    from public.user_feedback uf
    where uf.user_id = p_user_id and uf.audio_storage_path is not null
    union all
    select jsonb_build_object('bucket', 'user-feedback', 'path', a ->> 'path')
    from public.user_feedback uf, jsonb_array_elements(uf.attachments) a
    where uf.user_id = p_user_id
  ) s;

  -- Personal data. The flag lets the cancelled-event media guard and the shift
  -- identity guard through for this transaction's deletion steps only.
  perform set_config('yahpaz.deleting_account', '1', true);
  delete from public.event_media where uploaded_by = p_user_id;
  update public.shifts set personal_vehicle_id = null
    where personal_vehicle_id in (select v.id from public.vehicles v where v.user_id = p_user_id);
  perform set_config('yahpaz.deleting_account', '', true);
  delete from public.user_feedback where user_id = p_user_id;
  delete from public.event_responder_live_locations l
    using public.event_responders er
    where l.event_responder_id = er.id and er.responder_id = p_user_id;
  delete from public.vehicles where user_id = p_user_id;
  delete from public.user_addresses where user_id = p_user_id;
  delete from public.device_tokens where user_id = p_user_id;
  delete from public.ios_enroll_tokens where user_id = p_user_id;
  delete from public.ios_devices where user_id = p_user_id;
  delete from public.otp_device_trust where user_id = p_user_id;
  delete from public.otp_step_up where user_id = p_user_id;
  delete from public.otp_challenges where user_id = p_user_id;
  delete from public.user_presence where user_id = p_user_id;
  delete from public.oauth_access_tokens where user_id = p_user_id;
  delete from public.oauth_authorization_codes where user_id = p_user_id;
  delete from public.my_active_event_prefs where user_id = p_user_id;
  delete from public.user_roles where user_id = p_user_id;

  -- Anonymized placeholder. Name, email and callsign are NOT NULL (email and
  -- callsign unique), so they get neutral per-user values.
  perform set_config('yahpaz.reporting_android_session', '1', true);
  update public.profiles set
    full_name = 'משתמש שנמחק',
    email = 'deleted+' || p_user_id::text || '@deleted.invalid',
    callsign = 'נמחק-' || right(p_user_id::text, 12),
    phone = null,
    active = false,
    deleted_at = now(),
    updated_at = now(),
    invite_pending = false,
    invite_token = null,
    invite_token_expires_at = null,
    must_change_password = false,
    otp_login_enabled = false,
    otp_users_page_enabled = false,
    availability = 'unavailable',
    available_from = null,
    last_android_seen_at = null,
    last_android_version_code = null,
    last_android_version_name = null
  where id = p_user_id;
  perform set_config('yahpaz.reporting_android_session', '', true);

  -- The login: every session, then the auth user (identities, MFA factors and
  -- one-time tokens cascade from it).
  perform public.revoke_user_sessions(p_user_id);
  delete from auth.users where id = p_user_id;

  return jsonb_build_object('status', 'deleted', 'storage', files);
end;
$$;

revoke all on function public.delete_user_account(uuid) from public, anon, authenticated;
grant execute on function public.delete_user_account(uuid) to service_role;
