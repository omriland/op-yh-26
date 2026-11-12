-- A super admin may now set, edit or clear a card's title on submitted
-- feedback too, not only on tasks they opened. Submitted feedback keeps an
-- immutable body; only task rows (kind is null) edit their body.
--
-- kind replaces title as the task/feedback discriminator, because a titled
-- feedback card is still the member's feedback: it shows the reporter, and
-- moving it to טופל still texts them. Every place that read "title is null"
-- as "member feedback" now reads kind. That includes delete_user_account,
-- re-created here with kind is not null. The deploy workflow re-applies the
-- older account-deletion migrations on every push, so this file must stay
-- listed after them.

create or replace function public.user_feedback_lock_identity()
returns trigger
language plpgsql
as $$
begin
  if new.user_id is distinct from old.user_id
     or new.kind is distinct from old.kind
     or new.page_path is distinct from old.page_path
     or new.audio_storage_path is distinct from old.audio_storage_path
     or new.audio_mime_type is distinct from old.audio_mime_type
     or new.audio_byte_size is distinct from old.audio_byte_size
     or new.attachments is distinct from old.attachments
     or (old.kind is not null and new.body is distinct from old.body) then
    raise exception 'user_feedback_immutable' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

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
    where uf.user_id = p_user_id and uf.kind is not null and uf.audio_storage_path is not null
    union all
    select jsonb_build_object('bucket', 'user-feedback', 'path', a ->> 'path')
    from public.user_feedback uf, jsonb_array_elements(uf.attachments) a
    where uf.user_id = p_user_id and uf.kind is not null
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
  delete from public.user_feedback where user_id = p_user_id and kind is not null;
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
