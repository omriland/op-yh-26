-- Unit contact directory: every signed-in active user can read other
-- active members' name, callsign, phone, and email — without opening
-- the rest of profiles (invite tokens, OTP flags, stats).

create or replace function public.list_unit_contacts()
returns table (
  id uuid,
  full_name text,
  callsign text,
  phone text,
  email text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.full_name, p.callsign, p.phone, p.email
  from public.profiles p
  where auth.uid() is not null
    and exists (
      select 1
      from public.profiles me
      where me.id = auth.uid()
        and me.active
    )
    and p.active
    and not p.invite_pending
    and p.id <> auth.uid()
  order by p.full_name;
$$;

revoke all on function public.list_unit_contacts() from public;
grant execute on function public.list_unit_contacts() to authenticated;
