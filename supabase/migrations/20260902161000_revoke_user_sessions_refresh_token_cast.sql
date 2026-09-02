-- refresh_tokens.user_id is varchar; comparing it to uuid raises 42883 and
-- rolls back the whole function — including the auth.sessions delete.
-- Cast, and isolate that delete so a legacy-table failure cannot undo sessions.

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

  begin
    delete from auth.refresh_tokens where user_id = target_user_id::text;
  exception
    when undefined_table then
      null;
    when undefined_function then
      null;
  end;
end;
$$;

revoke all on function public.revoke_user_sessions(uuid) from public;
grant execute on function public.revoke_user_sessions(uuid) to service_role;
