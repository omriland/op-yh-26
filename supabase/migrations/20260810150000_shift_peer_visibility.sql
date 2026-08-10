-- Peer visibility for shifts: assigned responders can see co-responders,
-- shift lead profiles, and the shift's personal vehicle. SELECT only.

-- Helper: true when auth.uid() is assigned to the given shift (bypasses RLS recursion).
create or replace function public.is_assigned_to_shift(p_shift_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.shift_responders sr
    where sr.shift_id = p_shift_id
      and sr.responder_id = auth.uid()
  );
$$;

revoke all on function public.is_assigned_to_shift(uuid) from public;
grant execute on function public.is_assigned_to_shift(uuid) to authenticated;

-- A) shift_responders SELECT: admin | shift_lead | peer-on-shift
drop policy if exists shift_responders_select on public.shift_responders;

create policy shift_responders_select on public.shift_responders
for select to authenticated
using (
  public.has_role(auth.uid(), 'admin')
  or public.has_role(auth.uid(), 'shift_lead')
  or public.is_assigned_to_shift(shift_id)
);

-- B) profiles SELECT: extend unit visibility with shift peers + shift lead
drop policy if exists profiles_select_unit_visibility on public.profiles;

create policy profiles_select_unit_visibility on public.profiles
for select to authenticated
using (
  id = auth.uid()
  or has_role(auth.uid(), 'admin'::app_role)
  or has_role(auth.uid(), 'shift_lead'::app_role)
  or exists (
    select 1
    from event_responders mine
    join events e on e.id = mine.event_id
    where mine.responder_id = auth.uid()
      and (
        e.shift_lead_id = profiles.id
        or exists (
          select 1 from event_responders peer
          where peer.event_id = e.id and peer.responder_id = profiles.id
        )
      )
  )
  or exists (
    select 1
    from shift_responders mine
    join shifts s on s.id = mine.shift_id
    where mine.responder_id = auth.uid()
      and (
        s.shift_lead_id = profiles.id
        or exists (
          select 1 from shift_responders peer
          where peer.shift_id = s.id and peer.responder_id = profiles.id
        )
      )
  )
);

-- C) vehicles SELECT: personal_vehicle_id on a shift the viewer is assigned to
drop policy if exists vehicles_select_own_or_admin on public.vehicles;

create policy vehicles_select_own_or_admin on public.vehicles
for select to authenticated
using (
  user_id = auth.uid()
  or public.has_role(auth.uid(), 'admin')
  or public.has_role(auth.uid(), 'shift_lead')
  or exists (
    select 1
    from public.shifts s
    where s.personal_vehicle_id = vehicles.id
      and public.is_assigned_to_shift(s.id)
  )
);
