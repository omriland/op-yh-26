-- Treated licence plates on fill (responder-keyed) and shift-born fill (event-keyed).

create table public.event_treated_plates (
  id uuid primary key default gen_random_uuid(),
  event_responder_id uuid references public.event_responders (id) on delete cascade,
  event_id uuid references public.events (id) on delete cascade,
  plate_number text not null,
  plate_digits text generated always as (regexp_replace(plate_number, '\D', '', 'g')) stored,
  model text,
  color text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint event_treated_plates_owner_xor check (
    (event_responder_id is not null and event_id is null)
    or (event_responder_id is null and event_id is not null)
  )
);

create unique index event_treated_plates_responder_digits_uidx
  on public.event_treated_plates (event_responder_id, plate_digits)
  where event_responder_id is not null;

create unique index event_treated_plates_event_digits_uidx
  on public.event_treated_plates (event_id, plate_digits)
  where event_id is not null;

create or replace function public.event_treated_plates_normalize_plate()
returns trigger
language plpgsql
as $$
begin
  new.plate_number := public.normalize_plate_number(new.plate_number);
  return new;
end;
$$;

create trigger event_treated_plates_normalize_plate
before insert or update of plate_number
on public.event_treated_plates
for each row
execute function public.event_treated_plates_normalize_plate();

alter table public.event_treated_plates enable row level security;

-- SELECT: same visibility as treated vehicles (admin / shift_lead / assigned / peer).
create policy treated_plates_select on public.event_treated_plates
for select to authenticated
using (
  (
    event_responder_id is not null
    and exists (
      select 1 from public.event_responders er
      where er.id = event_treated_plates.event_responder_id
        and (
          public.has_role(auth.uid(), 'admin')
          or public.has_role(auth.uid(), 'shift_lead')
          or er.responder_id = auth.uid()
          or public.is_assigned_to_event(er.event_id)
        )
    )
  )
  or (
    event_id is not null
    and exists (
      select 1
      from public.events e
      where e.id = event_treated_plates.event_id
        and (
          public.has_role(auth.uid(), 'admin')
          or public.has_role(auth.uid(), 'shift_lead')
          or public.is_assigned_to_event(e.id)
        )
    )
  )
);

-- Write: assigned responder only, participation + event not done (no lead/admin write).
create policy treated_plates_responder_write on public.event_treated_plates
for all to authenticated
using (
  event_responder_id is not null
  and exists (
    select 1
    from public.event_responders er
    join public.events e on e.id = er.event_id
    where er.id = event_treated_plates.event_responder_id
      and er.responder_id = auth.uid()
      and er.status is distinct from 'done'
      and e.status is distinct from 'done'
  )
)
with check (
  event_responder_id is not null
  and exists (
    select 1
    from public.event_responders er
    join public.events e on e.id = er.event_id
    where er.id = event_treated_plates.event_responder_id
      and er.responder_id = auth.uid()
      and er.status is distinct from 'done'
      and e.status is distinct from 'done'
  )
);

-- Write: shift-born shared list — assigned crew, event not done.
create policy treated_plates_event_write on public.event_treated_plates
for all to authenticated
using (
  event_id is not null
  and exists (
    select 1
    from public.events e
    where e.id = event_treated_plates.event_id
      and e.origin = 'shift'
      and e.status is distinct from 'done'
      and public.is_assigned_to_event(e.id)
  )
)
with check (
  event_id is not null
  and exists (
    select 1
    from public.events e
    where e.id = event_treated_plates.event_id
      and e.origin = 'shift'
      and e.status is distinct from 'done'
      and public.is_assigned_to_event(e.id)
  )
);

-- Plates count as filled for shift-born live sync.
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
        or e.road_id is not null
        or nullif(trim(coalesce(e.location, '')), '') is not null
        or e.emergency_means
        or exists (
          select 1
          from public.event_treated_vehicles tv
          where tv.event_id = e.id
        )
        or exists (
          select 1
          from public.event_treated_plates tp
          where tp.event_id = e.id
        )
      )
  );
$$;

drop function if exists public.save_shift_born_event_fill(
  uuid, timestamptz, text, text, boolean, text, jsonb, boolean, uuid, text
);

create function public.save_shift_born_event_fill(
  p_event_id uuid,
  p_expected_updated_at timestamptz,
  p_police_event_id text,
  p_treatment_detail text,
  p_emergency_means boolean,
  p_treatment_notes text,
  p_treated jsonb,
  p_complete boolean,
  p_road_id uuid default null,
  p_location text default null,
  p_plates jsonb default '[]'::jsonb
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
  v_location text := nullif(trim(coalesce(p_location, '')), '');
  v_sort int := 0;
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
    road_id = p_road_id,
    location = v_location,
    location_place_id = null,
    location_lat = null,
    location_lng = null,
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

  delete from public.event_treated_plates where event_id = p_event_id;

  if p_plates is not null then
    for v_row in select * from jsonb_array_elements(p_plates)
    loop
      if nullif(trim(coalesce(v_row->>'plate_number', '')), '') is not null then
        insert into public.event_treated_plates (
          event_id, plate_number, model, color, sort_order
        )
        values (
          p_event_id,
          trim(v_row->>'plate_number'),
          nullif(trim(coalesce(v_row->>'model', '')), ''),
          nullif(trim(coalesce(v_row->>'color', '')), ''),
          v_sort
        );
        v_sort := v_sort + 1;
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
  uuid, timestamptz, text, text, boolean, text, jsonb, boolean, uuid, text, jsonb
) from public;
grant execute on function public.save_shift_born_event_fill(
  uuid, timestamptz, text, text, boolean, text, jsonb, boolean, uuid, text, jsonb
) to authenticated;
