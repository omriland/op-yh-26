-- Manufacturer + logo slug on treated plates (brand logos).

alter table public.event_treated_plates
  add column if not exists manufacturer text,
  add column if not exists logo_slug text;

create or replace function public.save_shift_born_event_fill(
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
          event_id, plate_number, model, color, left_where, manufacturer, logo_slug, sort_order
        )
        values (
          p_event_id,
          trim(v_row->>'plate_number'),
          nullif(trim(coalesce(v_row->>'model', '')), ''),
          nullif(trim(coalesce(v_row->>'color', '')), ''),
          nullif(trim(coalesce(v_row->>'left_where', '')), ''),
          nullif(trim(coalesce(v_row->>'manufacturer', '')), ''),
          nullif(trim(coalesce(v_row->>'logo_slug', '')), ''),
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
