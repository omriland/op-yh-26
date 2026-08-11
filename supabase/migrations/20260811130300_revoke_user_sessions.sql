-- Revoke Auth sessions/refresh tokens for a user (service_role / no JWT only).
-- Used after Super Admin sets a password so existing devices cannot stay signed in.

create or replace function public.revoke_user_sessions(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = auth, public
as $$
begin
  -- Block end-user JWT callers; Edge service_role has auth.uid() is null
  if auth.uid() is not null then
    raise exception 'אין הרשאה לביצוע פעולה זו.';
  end if;

  if target_user_id is null then
    raise exception 'חסר מזהה משתמש.';
  end if;

  delete from auth.refresh_tokens where user_id = target_user_id;
  delete from auth.sessions where user_id = target_user_id;
end;
$$;

revoke all on function public.revoke_user_sessions(uuid) from public;
grant execute on function public.revoke_user_sessions(uuid) to service_role;
