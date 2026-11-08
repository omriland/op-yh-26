-- Super admin: reopen one responder log, and retarget one shift-born event type.
--
-- A client update of event_responders.status is allowed for super_admin (the
-- 7-day lock treats them as unlocked), but that is not enough to reopen the
-- log:
--   * the fill stays locked while events.status is still done
--   * apply_event_status_from_participations does not allow a super_admin who
--     is not also admin, shift_lead, or assigned on the event
--   * writing events.status from the client locks the editor as אחמ״ש משני
--
-- shift_event_type_counts is a stored tally, not a live count of child events.
-- Changing one event's type without moving that tally leaves the shift summary
-- stale, and the next shift save recreates or drops siblings to match the old
-- numbers. The write policy on that table is admin / shift_lead / assigned
-- editor — not super_admin. A direct events.event_type_id update also locks
-- אחמ״ש משני.
--
-- Both functions are super_admin only, touch one row, and set
-- yahpaz.skip_auto_secondary so the status / type write is not an אחמ״ש edit.
-- Not applied to production by this change.

create or replace function public.reopen_responder_log(p_event_responder_id uuid)
returns public.event_status
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_origin public.event_origin;
  v_ended_at timestamp;
  next_status public.event_status;
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'super_admin') then
    raise exception 'אין הרשאה';
  end if;

  select er.event_id, e.origin, e.ended_at
    into v_event_id, v_origin, v_ended_at
  from public.event_responders er
  join public.events e on e.id = er.event_id
  where er.id = p_event_responder_id;

  if v_event_id is null then
    raise exception 'הדיווח אינו קיים.';
  end if;

  -- A shift-born event is one shared report. It has no per-responder log to reopen.
  if v_origin = 'shift' then
    raise exception 'לאירוע ממשמרת אין תיעוד נפרד למתנדב.';
  end if;

  -- Draft in the product is participation status in_progress (טיוטה נשמרה).
  -- Only the status changes. Notes, km, plates, treatment and times stay.
  update public.event_responders
  set status = 'in_progress', updated_at = now()
  where id = p_event_responder_id;

  perform set_config('yahpaz.skip_auto_secondary', '1', true);

  next_status := public.derived_event_status(v_event_id, v_ended_at);

  update public.events
  set status = next_status, updated_at = now()
  where id = v_event_id
    and status is distinct from next_status;

  return next_status;
end;
$$;

revoke all on function public.reopen_responder_log(uuid) from public, anon;
grant execute on function public.reopen_responder_log(uuid) to authenticated;

create or replace function public.set_shift_born_event_type(
  p_event_id uuid,
  p_event_type_id uuid,
  p_expected_updated_at timestamptz
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events%rowtype;
  v_updated int;
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'super_admin') then
    raise exception 'אין הרשאה';
  end if;

  select * into v_event from public.events where id = p_event_id;
  if not found or v_event.origin is distinct from 'shift' or v_event.shift_id is null then
    raise exception 'אין הרשאה';
  end if;

  if p_event_type_id is null or not exists (
    select 1 from public.event_types et where et.id = p_event_type_id
  ) then
    raise exception 'יש לבחור סוג אירוע.';
  end if;

  if v_event.event_type_id is not distinct from p_event_type_id then
    return v_event.updated_at;
  end if;

  if v_event.updated_at is distinct from p_expected_updated_at then
    raise exception 'מישהו שמר לפניך — רעננו';
  end if;

  perform set_config('yahpaz.skip_auto_secondary', '1', true);

  update public.events
  set
    event_type_id = p_event_type_id,
    last_saved_by = auth.uid(),
    updated_at = now()
  where id = p_event_id
    and origin = 'shift'
    and updated_at = p_expected_updated_at;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'מישהו שמר לפניך — רעננו';
  end if;

  update public.shift_event_type_counts
  set count = greatest(count - 1, 0)
  where shift_id = v_event.shift_id
    and event_type_id = v_event.event_type_id;

  insert into public.shift_event_type_counts (shift_id, event_type_id, count)
  values (v_event.shift_id, p_event_type_id, 1)
  on conflict (shift_id, event_type_id)
  do update set count = public.shift_event_type_counts.count + 1;

  return (select updated_at from public.events where id = p_event_id);
end;
$$;

revoke all on function public.set_shift_born_event_type(uuid, uuid, timestamptz) from public, anon;
grant execute on function public.set_shift_born_event_type(uuid, uuid, timestamptz) to authenticated;
