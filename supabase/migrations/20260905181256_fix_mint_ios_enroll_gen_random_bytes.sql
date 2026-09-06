-- mint_ios_enroll_token used gen_random_bytes with search_path=public only;
-- pgcrypto lives in extensions, so every mint failed with undefined_function.

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

revoke all on function public.mint_ios_enroll_token() from public;
grant execute on function public.mint_ios_enroll_token() to authenticated;
