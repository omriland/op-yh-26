-- Canonical police event numbers: 7 → XX-XXX-XX, 8 → XXX-XX-XXX.
-- Typist-entered dashes are ignored and rewritten on write.

create or replace function public.normalize_police_event_id(raw text)
returns text
language sql
immutable
as $$
  select case
    when length(d) = 7 then
      substr(d, 1, 2) || '-' || substr(d, 3, 3) || '-' || substr(d, 6, 2)
    when length(d) = 8 then
      substr(d, 1, 3) || '-' || substr(d, 4, 2) || '-' || substr(d, 6, 3)
    else nullif(trim(coalesce(raw, '')), '')
  end
  from (select regexp_replace(coalesce(raw, ''), '\D', '', 'g')) as normalized(d);
$$;

create or replace function public.events_normalize_police_event_id()
returns trigger
language plpgsql
as $$
begin
  new.police_event_id := public.normalize_police_event_id(new.police_event_id);
  return new;
end;
$$;

drop trigger if exists events_normalize_police_event_id on public.events;
create trigger events_normalize_police_event_id
before insert or update of police_event_id
on public.events
for each row
execute function public.events_normalize_police_event_id();

update public.events
set police_event_id = public.normalize_police_event_id(police_event_id)
where police_event_id is distinct from public.normalize_police_event_id(police_event_id);

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
  v_digits text;
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

  v_pattern :=
    '%'
    || replace(replace(replace(v_raw, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_')
    || '%';
  v_digits := regexp_replace(v_raw, '\D', '', 'g');

  return query
  select distinct e.id
  from public.events e
  left join public.roads r on r.id = e.road_id
  left join public.profiles lead on lead.id = e.shift_lead_id
  where
    e.police_event_id ilike v_pattern escape '\'
    or (
      v_digits <> ''
      and regexp_replace(coalesce(e.police_event_id, ''), '\D', '', 'g') like '%' || v_digits || '%'
    )
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
  v_digits text;
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

  v_pattern :=
    '%'
    || replace(replace(replace(v_raw, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_')
    || '%';
  v_digits := regexp_replace(v_raw, '\D', '', 'g');

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
        and (
          e.police_event_id ilike v_pattern escape '\'
          or (
            v_digits <> ''
            and regexp_replace(coalesce(e.police_event_id, ''), '\D', '', 'g')
              like '%' || v_digits || '%'
          )
        )
    )
    or exists (
      select 1
      from public.events e
      where e.shift_id = s.id
        and e.origin = 'shift'
        and (
          e.police_event_id ilike v_pattern escape '\'
          or (
            v_digits <> ''
            and regexp_replace(coalesce(e.police_event_id, ''), '\D', '', 'g')
              like '%' || v_digits || '%'
          )
        )
    );
end;
$$;
