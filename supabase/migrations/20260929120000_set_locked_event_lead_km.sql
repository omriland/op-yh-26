-- After 7 days a shift lead cannot edit the event. One exception: fill
-- event_responders.total_km while it is still null, and only for a volunteer
-- who has an active (unarchived) vehicle. 0 is a real value and cannot be
-- changed. Admin and super_admin keep their existing full update path.
-- This RPC does not widen it.

create or replace function public.set_locked_event_lead_km(
  p_event_responder_id uuid,
  p_total_km numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_responder_id uuid;
  v_current_km numeric;
  v_created_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not allowed';
  end if;

  -- The age lock does not apply to these roles; they use events / responder updates.
  if public.has_role(auth.uid(), 'admin')
     or public.has_role(auth.uid(), 'super_admin') then
    raise exception 'not allowed';
  end if;

  -- Same role that may edit the event inside the 7-day window.
  if not public.has_role(auth.uid(), 'shift_lead') then
    raise exception 'not allowed';
  end if;

  if p_total_km is null or p_total_km < 0 then
    raise exception 'not allowed';
  end if;

  select er.event_id, er.responder_id, er.total_km, e.created_at
    into v_event_id, v_responder_id, v_current_km, v_created_at
  from public.event_responders er
  join public.events e on e.id = er.event_id
  where er.id = p_event_responder_id;

  if v_event_id is null then
    raise exception 'not allowed';
  end if;

  -- Still inside the window: the normal update policies apply, not this RPC.
  if v_created_at >= (now() - interval '7 days') then
    raise exception 'not allowed';
  end if;

  if v_current_km is not null then
    raise exception 'not allowed';
  end if;

  if not exists (
    select 1
    from public.vehicles v
    where v.user_id = v_responder_id
      and not v.archived
  ) then
    raise exception 'not allowed';
  end if;

  update public.event_responders
  set
    total_km = p_total_km,
    updated_at = now()
  where id = p_event_responder_id
    and total_km is null;

  if not found then
    raise exception 'not allowed';
  end if;
end;
$$;

comment on function public.set_locked_event_lead_km(uuid, numeric) is
  'Shift lead only: set event_responders.total_km from null after the 7-day edit lock, for a volunteer with an active vehicle. Does not update any other column except updated_at.';

revoke all on function public.set_locked_event_lead_km(uuid, numeric) from public;
revoke all on function public.set_locked_event_lead_km(uuid, numeric) from anon;
revoke all on function public.set_locked_event_lead_km(uuid, numeric) from authenticated;
grant execute on function public.set_locked_event_lead_km(uuid, numeric) to authenticated;
