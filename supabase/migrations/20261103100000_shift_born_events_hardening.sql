-- Shift-born events: the shift carries the odometer, the crew documents each event
-- once in the shared report. Until now the regular-event rules leaked in:
--   * completing required an end time and per-responder KM that a shift-born event
--     never has, so סיום דיווח always failed and the shift never closed;
--   * crew could write per-responder plate / odometer / KM on their own row;
--   * the missing-KM nag, fill links, overdue mails and partner webhooks fired for them.
-- Every change below is scoped to events.origin = 'shift'; manual events are untouched.

-- 1. Completion: no end time or KM for shift-born events.
create or replace function public.guard_event_done_requirements()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from 'done' then
    return new;
  end if;

  if new.origin = 'shift' then
    return new;
  end if;

  if new.is_cancelled
     and not exists (
       select 1 from public.event_responders er where er.event_id = new.id
     ) then
    return new;
  end if;

  if new.ended_at is null then
    raise exception 'לא ניתן להשלים אירוע ללא שעת סיום.';
  end if;

  if public.event_missing_lead_km(new.id) then
    raise exception 'לא ניתן להשלים אירוע לפני הזנת קילומטרים לכל הכוננים.';
  end if;

  return new;
end;
$$;

create or replace function public.event_missing_lead_km(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.event_responders er
    join public.events e on e.id = er.event_id
    where er.event_id = p_event_id
      and e.origin is distinct from 'shift'
      and er.total_km is null
      and exists (
        select 1
        from public.vehicles v
        where v.user_id = er.responder_id
          and not v.archived
      )
  );
$$;

create or replace function public.count_events_missing_lead_km()
returns integer
language sql
stable
set search_path = public
as $$
  select count(*)::integer
  from public.events e
  where (
    e.shift_lead_id = auth.uid()
    or exists (
      select 1
      from public.event_secondary_leads s
      where s.event_id = e.id
        and s.user_id = auth.uid()
    )
  )
  and e.origin is distinct from 'shift'
  and e.created_at < now() - interval '5 hours'
  -- A ללא-רכב volunteer has no KM to report, so their null must not nag the lead.
  and exists (
    select 1
    from public.event_responders er
    where er.event_id = e.id
      and er.total_km is null
      and exists (
        select 1
        from public.vehicles v
        where v.user_id = er.responder_id
          and not v.archived
      )
  );
$$;

-- 2. A shift-born event's status belongs to save_shift_born_event_fill; the
--    participation-derived rule must not move it.
create or replace function public.derived_event_status(p_event_id uuid, p_ended_at timestamp without time zone)
returns public.event_status
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (
      select 1 from public.events ev where ev.id = p_event_id and ev.origin = 'shift'
    ) then (select ev.status from public.events ev where ev.id = p_event_id)
    when not exists (
      select 1 from public.event_responders er where er.event_id = p_event_id
    ) then case
      when coalesce((
        select ev.is_cancelled from public.events ev where ev.id = p_event_id
      ), false) then 'done'::public.event_status
      else 'draft'::public.event_status
    end
    when not exists (
      select 1
      from public.event_responders er
      where er.event_id = p_event_id
        and er.status is distinct from 'done'
    )
    and p_ended_at is not null
    and not public.event_missing_lead_km(p_event_id)
    then 'done'::public.event_status
    when exists (
      select 1
      from public.event_responders er
      where er.event_id = p_event_id
        and er.status = 'done'
    ) then 'partial'::public.event_status
    else 'in_progress'::public.event_status
  end;
$$;

-- 3. Crew never edit their own row on a shift-born event (no plate / odometer / KM there).
create or replace function public.event_is_open_for_responder_edit(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select e.status is distinct from 'done' and e.origin is distinct from 'shift'
      from public.events e
      where e.id = p_event_id
    ),
    false
  );
$$;

-- No default plate on a shift-born crew row: the shift has the vehicle.
create or replace function public.event_responders_default_vehicle_plate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.vehicle_plate is null
     and not exists (
       select 1 from public.events e where e.id = new.event_id and e.origin = 'shift'
     ) then
    new.vehicle_plate := public.default_vehicle_plate_for_user(new.responder_id);
  end if;
  return new;
end;
$$;

-- Lead KM after the 7-day lock is for regular events only.
create or replace function public.set_locked_event_lead_km(p_event_responder_id uuid, p_total_km numeric)
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
  v_origin public.event_origin;
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

  select er.event_id, er.responder_id, er.total_km, e.created_at, e.origin
    into v_event_id, v_responder_id, v_current_km, v_created_at, v_origin
  from public.event_responders er
  join public.events e on e.id = er.event_id
  where er.id = p_event_responder_id;

  if v_event_id is null or v_origin = 'shift' then
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

-- The overdue clock (48h / 7d mails with a per-responder fill link) never starts
-- on a shift-born row.
create or replace function public.guard_fill_overdue_columns()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1 from public.events e where e.id = new.event_id and e.origin = 'shift'
  ) then
    new.fill_completable_at := null;
    if tg_op = 'INSERT' or auth.role() is distinct from 'service_role' then
      new.overdue_48h_emailed_at := case when tg_op = 'INSERT' then null else old.overdue_48h_emailed_at end;
      new.overdue_7d_emailed_at := case when tg_op = 'INSERT' then null else old.overdue_7d_emailed_at end;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    if auth.role() is distinct from 'service_role' then
      new.fill_completable_at := case
        when new.total_km is not null then now()
        else null
      end;
      new.overdue_48h_emailed_at := null;
      new.overdue_7d_emailed_at := null;
    elsif new.total_km is not null then
      new.fill_completable_at := coalesce(new.fill_completable_at, now());
    end if;
    return new;
  end if;

  if new.total_km is not null and old.total_km is null then
    new.fill_completable_at := coalesce(old.fill_completable_at, now());
  else
    new.fill_completable_at := old.fill_completable_at;
  end if;

  if auth.role() is distinct from 'service_role' then
    new.overdue_48h_emailed_at := old.overdue_48h_emailed_at;
    new.overdue_7d_emailed_at := old.overdue_7d_emailed_at;
  end if;

  return new;
end;
$$;

-- 4. The shared report: specific messages, and the geocoded pin survives a save
--    that did not change the road or location.
create or replace function public.save_shift_born_event_fill(
  p_event_id uuid,
  p_expected_updated_at timestamp with time zone,
  p_police_event_id text,
  p_treatment_detail text,
  p_emergency_means boolean,
  p_treatment_notes text,
  p_treated jsonb,
  p_complete boolean,
  p_road_id uuid default null::uuid,
  p_location text default null::text,
  p_plates jsonb default '[]'::jsonb
)
returns timestamp with time zone
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
  v_place_kept boolean;
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
      raise exception 'ניתן לתעד החל מתאריך המשמרת.';
    end if;
    if v_event.status = 'done' then
      raise exception 'התיעוד כבר הושלם. רק אחמ״ש יכול לערוך.';
    end if;
  end if;

  v_place_kept :=
    v_event.road_id is not distinct from p_road_id
    and v_event.location is not distinct from v_location;

  update public.events
  set
    police_event_id = nullif(trim(coalesce(p_police_event_id, '')), ''),
    treatment_detail = nullif(trim(coalesce(p_treatment_detail, '')), ''),
    emergency_means = coalesce(p_emergency_means, false),
    treatment_notes = nullif(trim(coalesce(p_treatment_notes, '')), ''),
    road_id = p_road_id,
    location = v_location,
    location_place_id = case when v_place_kept then location_place_id else null end,
    location_lat = case when v_place_kept then location_lat else null end,
    location_lng = case when v_place_kept then location_lng else null end,
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

-- 5. Crew sync: someone added after an event is done joins it as done (the shared
--    report is already complete), and an event with photos is never "empty".
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
        or exists (
          select 1
          from public.event_media m
          where m.event_id = e.id
        )
      )
  );
$$;

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
      raise exception 'ניתן לעדכן את המשמרת החל מתאריך המשמרת.';
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

      if public.has_role(auth.uid(), 'shift_lead')
         and not public.has_role(auth.uid(), 'admin')
         and v_shift.shift_lead_id is distinct from auth.uid() then
        raise exception 'אין הרשאה למחוק אירוע שנוצר על ידי אחמ״ש אחר.';
      end if;

      delete from public.events
      where id in (select unnest(v_empty[1:v_drop]));
    end if;
  end loop;

  for v_new_id in
    select e.id
    from public.events e
    where e.origin = 'shift' and e.shift_id = p_shift_id
  loop
    insert into public.event_responders (event_id, responder_id, status)
    select
      v_new_id,
      sr.responder_id,
      case
        when (select ev.status from public.events ev where ev.id = v_new_id) = 'done'
          then 'done'::public.participation_status
        else 'pending'::public.participation_status
      end
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

-- 6. Deleting a shift-born event lowers its type count, so the next shift save
--    does not create it again.
create or replace function public.delete_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead uuid;
  v_origin public.event_origin;
  v_shift_id uuid;
  v_type_id uuid;
  v_allowed boolean := false;
begin
  if auth.uid() is null then
    raise exception 'אין הרשאה';
  end if;

  select e.shift_lead_id, e.origin, e.shift_id, e.event_type_id
    into v_lead, v_origin, v_shift_id, v_type_id
  from public.events e
  where e.id = p_event_id;

  if not found then
    raise exception 'האירוע אינו קיים.';
  end if;

  if public.has_role(auth.uid(), 'super_admin')
     or public.has_role(auth.uid(), 'admin') then
    v_allowed := true;
  elsif public.has_role(auth.uid(), 'shift_lead')
     and v_lead is not distinct from auth.uid() then
    v_allowed := true;
  end if;

  if not v_allowed then
    if v_lead is distinct from auth.uid() then
      raise exception 'אין הרשאה למחוק אירוע שנוצר על ידי אחמ״ש אחר.';
    end if;
    raise exception 'מחיקת האירוע נכשלה. בדקו את החיבור ונסו שוב.';
  end if;

  if v_origin = 'shift' and v_shift_id is not null and v_type_id is not null then
    update public.shift_event_type_counts
    set count = greatest(count - 1, 0)
    where shift_id = v_shift_id
      and event_type_id = v_type_id;
  end if;

  delete from public.events where id = p_event_id;
end;
$$;

-- 7. Partner bots: a shift-born event is not a personal assignment the bot can open.
create or replace function public.enqueue_partner_webhook_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  event_summary jsonb;
  police_id text;
begin
  select jsonb_build_object(
    'event_type_name', et.name,
    'event_date', e.event_date,
    'police_event_id', e.police_event_id,
    'location', e.location
  )
  into event_summary
  from public.events e
  left join public.event_types et on et.id = e.event_type_id
  where e.id = new.event_id
    and e.origin is distinct from 'shift';

  if event_summary is null then
    return new;
  end if;

  police_id := nullif(btrim(coalesce(event_summary->>'police_event_id', '')), '');
  if police_id is null then
    return new;
  end if;

  insert into public.partner_webhook_events (client_id, user_id, event_type, payload)
  select
    oc.id,
    new.responder_id,
    'assignment_created',
    jsonb_build_object('event_id', new.event_id, 'event_summary', event_summary)
  from public.oauth_access_tokens oat
  join public.oauth_clients oc on oc.id = oat.client_id
  where oat.user_id = new.responder_id
    and oat.revoked_at is null
    and oat.expires_at > now()
    and oc.is_active = true
    and oc.webhook_url is not null
    and not exists (
      select 1
      from public.partner_webhook_events existing
      where existing.client_id = oc.id
        and existing.user_id = new.responder_id
        and existing.event_type = 'assignment_created'
        and existing.payload->>'event_id' = new.event_id::text
    );

  return new;
exception
  when others then
    raise warning 'enqueue_partner_webhook_events failed: %', sqlerrm;
    return new;
end;
$$;

create or replace function public.enqueue_partner_webhooks_on_police_event_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  event_summary jsonb;
begin
  if new.origin = 'shift' then
    return new;
  end if;
  if nullif(btrim(coalesce(old.police_event_id, '')), '') is not null then
    return new;
  end if;
  if nullif(btrim(coalesce(new.police_event_id, '')), '') is null then
    return new;
  end if;

  select jsonb_build_object(
    'event_type_name', et.name,
    'event_date', new.event_date,
    'police_event_id', new.police_event_id,
    'location', new.location
  )
  into event_summary
  from public.event_types et
  where et.id = new.event_type_id;

  if event_summary is null then
    event_summary := jsonb_build_object(
      'event_type_name', null,
      'event_date', new.event_date,
      'police_event_id', new.police_event_id,
      'location', new.location
    );
  end if;

  insert into public.partner_webhook_events (client_id, user_id, event_type, payload)
  select
    oc.id,
    er.responder_id,
    'assignment_created',
    jsonb_build_object('event_id', new.id, 'event_summary', event_summary)
  from public.event_responders er
  join public.oauth_access_tokens oat
    on oat.user_id = er.responder_id
   and oat.revoked_at is null
   and oat.expires_at > now()
  join public.oauth_clients oc on oc.id = oat.client_id
  where er.event_id = new.id
    and oc.is_active = true
    and oc.webhook_url is not null
    and not exists (
      select 1
      from public.partner_webhook_events existing
      where existing.client_id = oc.id
        and existing.user_id = er.responder_id
        and existing.event_type = 'assignment_created'
        and existing.payload->>'event_id' = new.id::text
    );

  return new;
exception
  when others then
    raise warning 'enqueue_partner_webhooks_on_police_event_id failed: %', sqlerrm;
    return new;
end;
$function$
;
