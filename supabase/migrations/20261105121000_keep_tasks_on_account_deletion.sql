-- Deleting an account keeps the tasks that account opened on the משוב board.
--
-- Same routine as 20261103180000_account_deletion.sql with one change: only
-- feedback the member sent (title is null) is deleted, with its files. A task
-- (title set) stays and keeps user_id, which now points at the anonymized
-- profile, so the board shows its creator as "משתמש שנמחק". Nothing else in the
-- routine changes.
--
-- Must run after 20261103180000 and after 20261105120000 (adds title). The
-- deploy workflow re-applies 20261103180000 on every edge-function push, which
-- puts back the older body; this file has to be re-applied after it.

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
    where uf.user_id = p_user_id and uf.title is null and uf.audio_storage_path is not null
    union all
    select jsonb_build_object('bucket', 'user-feedback', 'path', a ->> 'path')
    from public.user_feedback uf, jsonb_array_elements(uf.attachments) a
    where uf.user_id = p_user_id and uf.title is null
  ) s;

  -- Personal data. The flag lets the cancelled-event media guard and the shift
  -- identity guard through for this transaction's deletion steps only.
  perform set_config('yahpaz.deleting_account', '1', true);
  delete from public.event_media where uploaded_by = p_user_id;
  update public.shifts set personal_vehicle_id = null
    where personal_vehicle_id in (select v.id from public.vehicles v where v.user_id = p_user_id);
  perform set_config('yahpaz.deleting_account', '', true);
  -- Feedback the member sent goes; tasks they opened on the board stay, credited
  -- to the anonymized profile ("משתמש שנמחק").
  delete from public.user_feedback where user_id = p_user_id and title is null;
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
