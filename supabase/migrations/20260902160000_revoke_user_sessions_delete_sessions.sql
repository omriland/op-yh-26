-- Session revoke after Super Admin set-password must actually delete auth.sessions.
-- Newer GoTrue stores refresh material on auth.sessions (refresh_token_hmac_key).
-- RLS on auth.sessions can make DELETE match 0 rows for postgres security-definer
-- functions; disable row security for this call and delete sessions first.

create or replace function public.revoke_user_sessions(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = auth, public
as $$
begin
  if auth.uid() is not null then
    raise exception 'אין הרשאה לביצוע פעולה זו.';
  end if;

  if target_user_id is null then
    raise exception 'חסר מזהה משתמש.';
  end if;

  perform set_config('row_security', 'off', true);

  delete from auth.sessions where user_id = target_user_id;

  if to_regclass('auth.refresh_tokens') is not null then
    delete from auth.refresh_tokens where user_id = target_user_id;
  end if;
end;
$$;

revoke all on function public.revoke_user_sessions(uuid) from public;
grant execute on function public.revoke_user_sessions(uuid) to service_role;
