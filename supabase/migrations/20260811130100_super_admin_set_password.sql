-- must_change_password + guards + clear RPC + seed Super Admin

alter table public.profiles
  add column if not exists must_change_password boolean not null default false;

comment on column public.profiles.must_change_password is
  'When true, sign-in arms the set-password gate until the user chooses a new password.';

create or replace function public.guard_super_admin_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Migrations / service_role have no end-user JWT
  if auth.uid() is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' and new.role = 'super_admin' then
    raise exception 'super_admin ניתן להקצות רק ממסד הנתונים';
  end if;

  if tg_op = 'DELETE' and old.role = 'super_admin' then
    raise exception 'super_admin ניתן להסיר רק ממסד הנתונים';
  end if;

  if tg_op = 'UPDATE' and (old.role = 'super_admin' or new.role = 'super_admin') then
    raise exception 'super_admin ניתן לשנות רק ממסד הנתונים';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists user_roles_guard_super_admin on public.user_roles;
create trigger user_roles_guard_super_admin
  before insert or update or delete on public.user_roles
  for each row
  execute function public.guard_super_admin_role();

create or replace function public.guard_must_change_password()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Session flag set by clear_must_change_password() (JWT still has auth.uid())
  if current_setting('app.bypass_must_change_guard', true) = 'on' then
    return new;
  end if;

  if auth.uid() is null then
    return new;
  end if;

  if new.must_change_password is distinct from old.must_change_password then
    raise exception 'must_change_password ניתן לשינוי רק דרך השרת';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_must_change_password on public.profiles;
create trigger profiles_guard_must_change_password
  before update on public.profiles
  for each row
  execute function public.guard_must_change_password();

create or replace function public.clear_must_change_password()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'יש להתחבר מחדש.';
  end if;

  perform set_config('app.bypass_must_change_guard', 'on', true);

  update public.profiles
  set
    must_change_password = false,
    updated_at = now()
  where id = auth.uid();
end;
$$;

revoke all on function public.clear_must_change_password() from public;
grant execute on function public.clear_must_change_password() to authenticated;

insert into public.user_roles (user_id, role)
select id, 'super_admin'::public.app_role
from public.profiles
where email = 'omriland@gmail.com'
on conflict (user_id, role) do nothing;
