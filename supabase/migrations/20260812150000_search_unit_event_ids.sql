-- Unit events text search for shift_lead / admin / super_admin.
-- Returns distinct event ids matching police id, location, road name,
-- shift-lead name/callsign, or any assigned responder name/callsign.

create or replace function public.search_unit_event_ids(p_needle text)
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
  select distinct e.id
  from public.events e
  left join public.roads r on r.id = e.road_id
  left join public.profiles lead on lead.id = e.shift_lead_id
  where
    e.police_event_id ilike v_pattern escape '\'
    or e.location ilike v_pattern escape '\'
    or r.name ilike v_pattern escape '\'
    or lead.full_name ilike v_pattern escape '\'
    or lead.callsign ilike v_pattern escape '\'
    or exists (
      select 1
      from public.event_responders er
      join public.profiles p on p.id = er.responder_id
      where er.event_id = e.id
        and (
          p.full_name ilike v_pattern escape '\'
          or p.callsign ilike v_pattern escape '\'
        )
    );
end;
$$;

revoke all on function public.search_unit_event_ids(text) from public;
grant execute on function public.search_unit_event_ids(text) to authenticated;
