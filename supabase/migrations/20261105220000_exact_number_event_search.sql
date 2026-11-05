-- A digits-only events-page search is an id or a callsign, not a substring.
-- "363" used to match callsign 1363 and event 3631 via ILIKE '%363%'.
-- Words still match inside a road, a place or a name.

create or replace function public.search_unit_event_ids(p_needle text, p_shift_lead_id uuid default null)
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

  if v_raw ~ '^[0-9]+$' then
    return query
    select distinct e.id
    from public.events e
    left join public.profiles lead on lead.id = e.shift_lead_id
    where
      (p_shift_lead_id is null or e.shift_lead_id = p_shift_lead_id)
      and (
        btrim(coalesce(e.police_event_id, '')) = v_raw
        or btrim(coalesce(e.patrol_callsign_number, '')) = v_raw
        or btrim(coalesce(lead.callsign, '')) = v_raw
        or exists (
          select 1
          from public.event_responders er
          join public.profiles p on p.id = er.responder_id
          where er.event_id = e.id
            and btrim(coalesce(p.callsign, '')) = v_raw
        )
        or exists (
          select 1
          from public.event_secondary_leads s
          join public.profiles sp on sp.id = s.user_id
          where s.event_id = e.id
            and btrim(coalesce(sp.callsign, '')) = v_raw
        )
      );
    return;
  end if;

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
    (p_shift_lead_id is null or e.shift_lead_id = p_shift_lead_id)
    and (
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
      )
      or exists (
        select 1
        from public.event_secondary_leads s
        join public.profiles sp on sp.id = s.user_id
        where s.event_id = e.id
          and (
            sp.full_name ilike v_pattern escape '\'
            or sp.callsign ilike v_pattern escape '\'
          )
      )
    );
end;
$$;

revoke all on function public.search_unit_event_ids(text, uuid) from public;
grant execute on function public.search_unit_event_ids(text, uuid) to authenticated;
