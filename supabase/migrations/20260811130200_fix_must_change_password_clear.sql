-- Allow clear_must_change_password() to flip the flag under SECURITY DEFINER
-- (auth.uid() remains set for JWT callers, so the plain guard would block).

create or replace function public.guard_must_change_password()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
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
