-- Unit shifts text search for shift_lead / admin / super_admin.
-- Returns distinct shift ids matching Hebrew kind/vehicle labels, plate,
-- shift-lead name/callsign, assigned responder name/callsign, or a linked
-- event's police id.

create or replace function public.search_unit_shift_ids(p_needle text)
returns setof uuid
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_raw text := trim(coalesce(p_needle, ''));
  v_pattern text;
begin
  if v_raw = '' then
    return;
  end if;

  if not (
    public.has_role(auth.uid(), 'shift_lead')
    or public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'super_admin')
  ) then
    return;
  end if;

  -- Literal % / _ / \ for ilike
  v_pattern :=
    '%'
    || replace(replace(replace(v_raw, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_')
    || '%';

  return query
  select distinct s.id
  from public.shifts s
  left join public.profiles lead on lead.id = s.shift_lead_id
  left join public.vehicles v on v.id = s.personal_vehicle_id
  where
    case s.shift_kind
      when 'morning' then 'בוקר'
      when 'midday' then 'צהריים'
      when 'reinforcement' then 'תגבור'
      when 'escort' then 'ליווי'
      else 'אחר'
    end ilike v_pattern escape '\'
    or case s.vehicle_type
      when 'patrol_north' then 'ניידת צפון'
      when 'patrol_center' then 'ניידת מרכז'
      else 'רכב פרטי'
    end ilike v_pattern escape '\'
    or v.plate_number ilike v_pattern escape '\'
    or lead.full_name ilike v_pattern escape '\'
    or lead.callsign ilike v_pattern escape '\'
    or exists (
      select 1
      from public.shift_responders sr
      join public.profiles p on p.id = sr.responder_id
      where sr.shift_id = s.id
        and (
          p.full_name ilike v_pattern escape '\'
          or p.callsign ilike v_pattern escape '\'
        )
    )
    or exists (
      select 1
      from public.shift_events se
      join public.events e on e.id = se.event_id
      where se.shift_id = s.id
        and e.police_event_id ilike v_pattern escape '\'
    );
end;
$$;

revoke all on function public.search_unit_shift_ids(text) from public;
grant execute on function public.search_unit_shift_ids(text) to authenticated;
