-- Pending invitees are not on duty; keep them off the unit map like contacts.

create or replace function public.list_unit_map_pins()
returns table (
  user_id uuid,
  full_name text,
  callsign text,
  kind public.address_kind,
  label text,
  formatted_address text,
  lat double precision,
  lng double precision,
  volunteer_status public.volunteer_status,
  availability public.availability_status,
  available_from date
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.full_name,
    p.callsign,
    a.kind,
    a.label,
    a.formatted_address,
    a.lat,
    a.lng,
    p.volunteer_status,
    p.availability,
    p.available_from
  from public.user_addresses a
  join public.profiles p on p.id = a.user_id
  where auth.uid() is not null
    and exists (
      select 1
      from public.profiles me
      where me.id = auth.uid()
        and me.active
    )
    and p.active
    and not p.invite_pending
    and p.volunteer_status not in (
      'administration'::public.volunteer_status,
      'basic_training'::public.volunteer_status,
      'shifts_only'::public.volunteer_status
    )
  order by p.callsign, a.kind;
$$;
