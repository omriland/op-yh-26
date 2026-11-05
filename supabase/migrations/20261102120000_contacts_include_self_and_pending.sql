-- Contacts list every active member of the caller's unit, the caller included.
--
-- Until now list_unit_contacts dropped the caller (p.id <> auth.uid()) and
-- every member whose invite was still pending, so nobody saw themselves and
-- 11 of 164 production members were missing for everyone.
--
-- Unchanged: inactive members stay out, the App Review demo accounts and real
-- members never see each other, and the pre-launch check stays (inert since
-- 2026-10-31T22:01:00Z).
-- Must land after 20261029180000_prelaunch_gate.sql, which last replaced it.

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
    and not public.is_prelaunch_blocked_caller()
    and exists (
      select 1
      from public.profiles me
      where me.id = auth.uid()
        and me.active
        and me.is_app_review_demo = p.is_app_review_demo
    )
    and p.active
  order by p.full_name;
$$;
