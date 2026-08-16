-- Shift-born events: origin, shared fill, live sync from type-counts.

create type public.event_origin as enum ('manual', 'shift');

alter table public.events
  add column origin public.event_origin not null default 'manual',
  add column shift_id uuid,
  add column treatment_detail text,
  add column emergency_means boolean not null default false,
  add column treatment_notes text,
  add column last_saved_by uuid;

alter table public.events
  add constraint events_shift_id_fkey
    foreign key (shift_id) references public.shifts (id) on delete cascade,
  add constraint events_last_saved_by_fkey
    foreign key (last_saved_by) references public.profiles (id),
  add constraint events_origin_shift_id_check
    check (
      (origin = 'manual' and shift_id is null)
      or (origin = 'shift' and shift_id is not null)
    );

create index events_shift_id_idx on public.events (shift_id)
  where shift_id is not null;

alter table public.shifts
  add column last_saved_by uuid references public.profiles (id);

alter table public.event_treated_vehicles
  alter column event_responder_id drop not null,
  add column event_id uuid;

alter table public.event_treated_vehicles
  add constraint event_treated_vehicles_event_id_fkey
    foreign key (event_id) references public.events (id) on delete cascade,
  add constraint event_treated_vehicles_owner_xor
    check (
      (event_responder_id is not null and event_id is null)
      or (event_responder_id is null and event_id is not null)
    );

create unique index event_treated_vehicles_event_kind_uidx
  on public.event_treated_vehicles (event_id, vehicle_kind_id)
  where event_id is not null;

-- SELECT for event-keyed treated rows (responder-keyed policy still uses event_responder_id).
create policy treated_vehicles_event_select on public.event_treated_vehicles
  for select to authenticated
  using (
    event_id is not null
    and exists (
      select 1
      from public.events e
      where e.id = event_treated_vehicles.event_id
        and (
          public.has_role(auth.uid(), 'admin')
          or public.has_role(auth.uid(), 'shift_lead')
          or exists (
            select 1
            from public.event_responders er
            where er.event_id = e.id and er.responder_id = auth.uid()
          )
        )
    )
  );

create or replace function public.shift_born_event_is_empty(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1
    from public.events e
    where e.id = p_event_id
      and e.origin = 'shift'
      and (
        nullif(trim(coalesce(e.police_event_id, '')), '') is not null
        or nullif(trim(coalesce(e.treatment_detail, '')), '') is not null
        or nullif(trim(coalesce(e.treatment_notes, '')), '') is not null
        or e.emergency_means
        or exists (
          select 1
          from public.event_treated_vehicles tv
          where tv.event_id = e.id
        )
      )
  );
$$;

revoke all on function public.shift_born_event_is_empty(uuid) from public;
grant execute on function public.shift_born_event_is_empty(uuid) to authenticated;

create or replace function public.sync_shift_born_events(p_shift_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift public.shifts%rowtype;
  v_is_lead boolean;
  v_type record;
  v_existing uuid[];
  v_empty uuid[];
  v_desired int;
  v_have int;
  v_need int;
  v_drop int;
  v_new_id uuid;
  i int;
begin
  select * into v_shift from public.shifts where id = p_shift_id;
  if not found then
    raise exception 'אין הרשאה';
  end if;

  v_is_lead :=
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'shift_lead');

  if not v_is_lead then
    if not public.is_assigned_to_shift(p_shift_id) then
      raise exception 'אין הרשאה';
    end if;
    if v_shift.shift_date > (timezone('Asia/Jerusalem', now()))::date then
      raise exception 'אין הרשאה';
    end if;
  end if;

  for v_type in
    select et.id as event_type_id, coalesce(c.count, 0) as desired
    from public.event_types et
    left join public.shift_event_type_counts c
      on c.event_type_id = et.id and c.shift_id = p_shift_id
  loop
    v_desired := v_type.desired;

    select coalesce(array_agg(e.id order by e.created_at), '{}')
    into v_existing
    from public.events e
    where e.origin = 'shift'
      and e.shift_id = p_shift_id
      and e.event_type_id = v_type.event_type_id;

    v_have := coalesce(cardinality(v_existing), 0);

    if v_desired > v_have then
      v_need := v_desired - v_have;
      for i in 1..v_need loop
        insert into public.events (
          shift_lead_id,
          event_date,
          event_type_id,
          status,
          origin,
          shift_id
        )
        values (
          v_shift.shift_lead_id,
          v_shift.shift_date,
          v_type.event_type_id,
          'in_progress',
          'shift',
          p_shift_id
        )
        returning id into v_new_id;
      end loop;
    elsif v_desired < v_have then
      select coalesce(array_agg(e.id order by e.created_at desc), '{}')
      into v_empty
      from public.events e
      where e.id = any (v_existing)
        and public.shift_born_event_is_empty(e.id);

      v_drop := v_have - v_desired;
      if coalesce(cardinality(v_empty), 0) < v_drop then
        raise exception 'לא ניתן להקטין — קיימים אירועים שמולאו';
      end if;

      delete from public.events
      where id in (select unnest(v_empty[1:v_drop]));
    end if;
  end loop;

  -- Types that disappeared from the closed list but still have events: treat desired as 0
  -- already covered because we iterate all event_types; leftover types with no count = 0.

  for v_new_id in
    select e.id
    from public.events e
    where e.origin = 'shift' and e.shift_id = p_shift_id
  loop
    insert into public.event_responders (event_id, responder_id, status)
    select v_new_id, sr.responder_id, 'pending'
    from public.shift_responders sr
    where sr.shift_id = p_shift_id
    on conflict (event_id, responder_id) do nothing;

    delete from public.event_responders er
    where er.event_id = v_new_id
      and not exists (
        select 1
        from public.shift_responders sr
        where sr.shift_id = p_shift_id and sr.responder_id = er.responder_id
      );
  end loop;
end;
$$;

revoke all on function public.sync_shift_born_events(uuid) from public;
grant execute on function public.sync_shift_born_events(uuid) to authenticated;

create or replace function public.save_shift_born_event_fill(
  p_event_id uuid,
  p_expected_updated_at timestamptz,
  p_police_event_id text,
  p_treatment_detail text,
  p_emergency_means boolean,
  p_treatment_notes text,
  p_treated jsonb,
  p_complete boolean
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events%rowtype;
  v_is_lead boolean;
  v_updated int;
  v_row jsonb;
begin
  select * into v_event from public.events where id = p_event_id;
  if not found or v_event.origin is distinct from 'shift' then
    raise exception 'אין הרשאה';
  end if;

  v_is_lead :=
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'shift_lead');

  if not v_is_lead then
    if not exists (
      select 1
      from public.event_responders er
      where er.event_id = p_event_id and er.responder_id = auth.uid()
    ) then
      raise exception 'אין הרשאה';
    end if;
    if exists (
      select 1
      from public.shifts s
      where s.id = v_event.shift_id
        and s.shift_date > (timezone('Asia/Jerusalem', now()))::date
    ) then
      raise exception 'אין הרשאה';
    end if;
    if v_event.status = 'done' then
      raise exception 'אין הרשאה';
    end if;
  end if;

  update public.events
  set
    police_event_id = nullif(trim(coalesce(p_police_event_id, '')), ''),
    treatment_detail = nullif(trim(coalesce(p_treatment_detail, '')), ''),
    emergency_means = coalesce(p_emergency_means, false),
    treatment_notes = nullif(trim(coalesce(p_treatment_notes, '')), ''),
    last_saved_by = auth.uid(),
    status = case when p_complete then 'done'::public.event_status else status end,
    updated_at = now()
  where id = p_event_id
    and updated_at = p_expected_updated_at;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'מישהו שמר לפניך — רעננו';
  end if;

  delete from public.event_treated_vehicles where event_id = p_event_id;

  if p_treated is not null then
    for v_row in select * from jsonb_array_elements(p_treated)
    loop
      if coalesce((v_row->>'quantity')::int, 0) > 0 and (v_row->>'vehicle_kind_id') is not null then
        insert into public.event_treated_vehicles (event_id, vehicle_kind_id, quantity)
        values (
          p_event_id,
          (v_row->>'vehicle_kind_id')::uuid,
          (v_row->>'quantity')::int
        );
      end if;
    end loop;
  end if;

  if p_complete then
    update public.event_responders
    set status = 'done', updated_at = now()
    where event_id = p_event_id;
  end if;

  return (select updated_at from public.events where id = p_event_id);
end;
$$;

revoke all on function public.save_shift_born_event_fill(
  uuid, timestamptz, text, text, boolean, text, jsonb, boolean
) from public;
grant execute on function public.save_shift_born_event_fill(
  uuid, timestamptz, text, text, boolean, text, jsonb, boolean
) to authenticated;

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
    )
    or exists (
      select 1
      from public.events e
      where e.shift_id = s.id
        and e.origin = 'shift'
        and e.police_event_id ilike v_pattern escape '\'
    );
end;
$$;
