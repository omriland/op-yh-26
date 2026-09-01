-- Android last-session stamp for Super Admin משתמשים (not device_tokens / FCM).

alter table public.profiles
  add column if not exists last_android_seen_at timestamptz,
  add column if not exists last_android_version_code integer,
  add column if not exists last_android_version_name text;

comment on column public.profiles.last_android_seen_at is
  'Last signed-in Android heartbeat. Super Admin UI only.';

create or replace function public.protect_profile_android_session()
returns trigger
language plpgsql
as $$
begin
  if current_setting('yahpaz.reporting_android_session', true) = '1' then
    return new;
  end if;
  new.last_android_seen_at := old.last_android_seen_at;
  new.last_android_version_code := old.last_android_version_code;
  new.last_android_version_name := old.last_android_version_name;
  return new;
end;
$$;

drop trigger if exists protect_profile_android_session on public.profiles;
create trigger protect_profile_android_session
  before update on public.profiles
  for each row
  execute function public.protect_profile_android_session();

create or replace function public.report_android_session(
  p_version_code integer,
  p_version_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'יש להתחבר מחדש.';
  end if;
  if p_version_code is null or p_version_code < 1 then
    raise exception 'גרסה לא תקינה.';
  end if;
  v_name := trim(p_version_name);
  if v_name is null or char_length(v_name) < 1 or char_length(v_name) > 32 then
    raise exception 'גרסה לא תקינה.';
  end if;

  perform set_config('yahpaz.reporting_android_session', '1', true);

  update public.profiles
  set
    last_android_seen_at = now(),
    last_android_version_code = p_version_code,
    last_android_version_name = v_name
  where id = auth.uid();
end;
$$;

revoke all on function public.report_android_session(integer, text) from public;
grant execute on function public.report_android_session(integer, text) to authenticated;
