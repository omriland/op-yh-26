-- Live shifts: a shift with hours (starts_at, ends_at) lets its crew create, fill,
-- complete, reopen and delete empty events from starts_at until ends_at + 48 hours.
-- Leads and admins are not limited by the window. Shifts without hours (both null)
-- keep the old rules exactly.

-- 1. Hours on the shift.
alter table public.shifts
  add column if not exists starts_at timestamptz,
  add column if not exists ends_at timestamptz;

alter table public.shifts
  drop constraint if exists shifts_live_hours_both_or_none,
  add constraint shifts_live_hours_both_or_none
    check ((starts_at is null) = (ends_at is null)),
  drop constraint if exists shifts_live_hours_in_order,
  add constraint shifts_live_hours_in_order
    check (ends_at is null or ends_at > starts_at);

-- 1a. Admins, super admins and any shift lead are not limited by the crew window,
--     the same as today's fill rule (any lead may edit any shift).
create or replace function public.is_shift_unrestricted_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'super_admin')
    or public.has_role(auth.uid(), 'shift_lead');
$$;

-- 1b. Only leads and admins may move a shift's hours. Crew can update their shift row,
--     so without this they could stretch or remove their own window. Body otherwise
--     identical to 20261103180000_account_deletion.sql.
--     Hours cannot be removed by anyone once set. With no signed-in user they can only
--     be changed inside the account-deletion bypass above the checks. A shift that was
--     converted to a live shift by mistake therefore needs a deliberate fix: a
--     migration or a manual statement that sets the yahpaz.deleting_account bypass.
create or replace function public.enforce_shift_identity_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('yahpaz.deleting_account', true) = '1' then
    return new;
  end if;

  if old.starts_at is not null
     and (new.starts_at is null or new.ends_at is null) then
    raise exception 'לא ניתן להסיר את שעות המשמרת.';
  end if;

  if public.is_shift_unrestricted_user() then
    return new;
  end if;

  if new.shift_date is distinct from old.shift_date
     or new.shift_kind is distinct from old.shift_kind
     or new.vehicle_type is distinct from old.vehicle_type
     or new.personal_vehicle_id is distinct from old.personal_vehicle_id
     or new.starts_at is distinct from old.starts_at
     or new.ends_at is distinct from old.ends_at then
    raise exception 'אין הרשאה לשנות פרטי משמרת';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_shift_identity_edit() from public;

-- 2. The crew window.
create or replace function public.shift_open_for_crew(p_shift_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and public.is_assigned_to_shift(p_shift_id)
    and exists (
      select 1
      from public.shifts s
      where s.id = p_shift_id
        and s.starts_at is not null
        and now() >= s.starts_at
        and now() < s.ends_at + interval '48 hours'
    );
$$;

-- 2b. The message a crew member gets when the window is not open.
create or replace function public.raise_crew_window_closed(p_shift_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.shifts s
    where s.id = p_shift_id and now() < s.starts_at
  ) then
    raise exception 'המשמרת עוד לא התחילה.';
  end if;
  raise exception 'חלון התיעוד של המשמרת נסגר.';
end;
$$;

-- 3. A responder may not be on two overlapping live shifts. Touching edges are fine.
create or replace function public.find_overlapping_live_shift(
  p_shift_id uuid,
  p_responder_id uuid
)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select other.id
  from public.shifts this_shift
  join public.shift_responders sr on sr.responder_id = p_responder_id
  join public.shifts other on other.id = sr.shift_id
  where this_shift.id = p_shift_id
    and this_shift.starts_at is not null
    and other.id <> this_shift.id
    and other.starts_at is not null
    and this_shift.starts_at < other.ends_at
    and other.starts_at < this_shift.ends_at
  order by other.starts_at
  limit 1;
$$;

create or replace function public.guard_shift_crew_overlap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_responder_id uuid;
  v_other_shift_id uuid;
begin
  if tg_table_name = 'shift_responders' then
    perform 1 from public.shifts where id = new.shift_id for update;
    perform pg_advisory_xact_lock(hashtextextended(new.responder_id::text, 0));
    v_other_shift_id := public.find_overlapping_live_shift(new.shift_id, new.responder_id);
    if v_other_shift_id is not null then
      raise exception 'המשמרת חופפת למשמרת אחרת של אחד מאנשי הצוות.';
    end if;
    return new;
  end if;

  for v_responder_id in
    select sr.responder_id from public.shift_responders sr where sr.shift_id = new.id
    order by sr.responder_id
  loop
    perform pg_advisory_xact_lock(hashtextextended(v_responder_id::text, 0));
    v_other_shift_id := public.find_overlapping_live_shift(new.id, v_responder_id);
    if v_other_shift_id is not null then
      raise exception 'המשמרת חופפת למשמרת אחרת של אחד מאנשי הצוות.';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists guard_shift_crew_overlap on public.shift_responders;
create trigger guard_shift_crew_overlap
before insert or update of shift_id, responder_id on public.shift_responders
for each row
execute function public.guard_shift_crew_overlap();

drop trigger if exists guard_shift_crew_overlap on public.shifts;
create trigger guard_shift_crew_overlap
after update of starts_at, ends_at on public.shifts
for each row
execute function public.guard_shift_crew_overlap();

-- 3b. The first version of the unrestricted check took the shift lead id. It is gone.
drop function if exists public.is_live_shift_event_manager(uuid);

-- 4. Create an event on a live shift.
create or replace function public.create_shift_event(
  p_shift_id uuid,
  p_event_type_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift public.shifts%rowtype;
  v_new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'אין הרשאה';
  end if;

  select * into v_shift from public.shifts where id = p_shift_id;
  if not found then
    raise exception 'אין הרשאה';
  end if;

  if not public.is_shift_unrestricted_user() then
    if not public.is_assigned_to_shift(p_shift_id) then
      raise exception 'אין הרשאה';
    end if;
    if v_shift.starts_at is not null and not public.shift_open_for_crew(p_shift_id) then
      perform public.raise_crew_window_closed(p_shift_id);
    end if;
  end if;

  if v_shift.starts_at is null then
    raise exception 'המשמרת אינה משמרת חיה.';
  end if;

  if p_event_type_id is null
     or not exists (select 1 from public.event_types et where et.id = p_event_type_id) then
    raise exception 'סוג האירוע אינו קיים.';
  end if;

  insert into public.events (
    shift_lead_id,
    event_date,
    event_type_id,
    status,
    origin,
    shift_id,
    is_demo,
    last_saved_by
  )
  values (
    v_shift.shift_lead_id,
    v_shift.shift_date,
    p_event_type_id,
    'in_progress',
    'shift',
    p_shift_id,
    v_shift.is_demo,
    auth.uid()
  )
  returning id into v_new_id;

  insert into public.event_responders (event_id, responder_id, status)
  select v_new_id, sr.responder_id, 'pending'::public.participation_status
  from public.shift_responders sr
  where sr.shift_id = p_shift_id;

  return v_new_id;
end;
$$;

-- 5. Delete an event nobody has filled in yet.
create or replace function public.delete_empty_shift_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events%rowtype;
  v_shift public.shifts%rowtype;
begin
  if auth.uid() is null then
    raise exception 'אין הרשאה';
  end if;

  select * into v_event from public.events where id = p_event_id for update;
  if not found then
    raise exception 'אין הרשאה';
  end if;

  select * into v_shift from public.shifts where id = v_event.shift_id;
  if v_event.origin is distinct from 'shift' or not found or v_shift.starts_at is null then
    raise exception 'המשמרת אינה משמרת חיה.';
  end if;

  if not public.is_shift_unrestricted_user() then
    if not public.is_assigned_to_shift(v_shift.id) then
      raise exception 'אין הרשאה';
    end if;
    if not public.shift_open_for_crew(v_shift.id) then
      perform public.raise_crew_window_closed(v_shift.id);
    end if;
  end if;

  if v_event.status = 'done' and not public.is_shift_unrestricted_user() then
    raise exception 'לא ניתן למחוק אירוע שהושלם.';
  end if;

  if not public.shift_born_event_is_empty(p_event_id) then
    raise exception 'ניתן למחוק רק אירוע שעדיין לא הוזנו בו נתונים.';
  end if;

  delete from public.events where id = p_event_id;
end;
$$;

-- 6. The live shift the caller is on right now.
create or replace function public.my_current_shift()
returns table (
  id uuid,
  shift_kind public.shift_kind,
  shift_date date,
  starts_at timestamptz,
  ends_at timestamptz,
  vehicle_type public.shift_vehicle_type
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'אין הרשאה';
  end if;

  return query
  select s.id, s.shift_kind, s.shift_date, s.starts_at, s.ends_at, s.vehicle_type
  from public.shifts s
  join public.shift_responders sr on sr.shift_id = s.id
  where sr.responder_id = auth.uid()
    and s.starts_at is not null
    and now() >= s.starts_at
    and now() < s.ends_at + interval '48 hours'
  order by (now() >= s.ends_at), s.starts_at desc
  limit 1;
end;
$$;

-- 7. save_shift_born_event_fill: the crew gate follows the window on live shifts.
--    A done event is reopened only when p_reopen is true. The parameter list changes,
--    so the old signature is dropped first.
drop function if exists public.save_shift_born_event_fill(
  uuid, timestamp with time zone, text, text, boolean, text, jsonb, boolean, uuid, text, jsonb
);

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
  p_plates jsonb default '[]'::jsonb,
  p_reopen boolean default false
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
  v_shift_is_live boolean;
  v_reopen boolean;
begin
  if auth.uid() is null then
    raise exception 'אין הרשאה';
  end if;

  select * into v_event from public.events where id = p_event_id;
  if not found or v_event.origin is distinct from 'shift' then
    raise exception 'אין הרשאה';
  end if;

  v_is_lead := public.is_shift_unrestricted_user();

  select s.starts_at is not null into v_shift_is_live
  from public.shifts s
  where s.id = v_event.shift_id;
  v_shift_is_live := coalesce(v_shift_is_live, false);

  v_reopen := v_shift_is_live
    and p_reopen
    and not p_complete
    and v_event.status = 'done';

  if not v_is_lead then
    if not exists (
      select 1
      from public.event_responders er
      where er.event_id = p_event_id and er.responder_id = auth.uid()
    ) then
      raise exception 'אין הרשאה';
    end if;

    if v_shift_is_live then
      if not public.shift_open_for_crew(v_event.shift_id) then
        perform public.raise_crew_window_closed(v_event.shift_id);
      end if;
    else
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
  end if;

  if p_reopen and not v_reopen then
    raise exception 'לא ניתן לפתוח מחדש את האירוע.';
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
    status = case
      when p_complete then 'done'::public.event_status
      when v_reopen then 'in_progress'::public.event_status
      else status
    end,
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
  elsif v_reopen then
    update public.event_responders
    set status = 'pending', updated_at = now()
    where event_id = p_event_id;
  end if;

  return (select updated_at from public.events where id = p_event_id);
end;
$$;

-- 8. sync_shift_born_events: on a live shift it only syncs the crew onto the events.
--    Events there are created by create_shift_event, so counts are not followed.
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

  v_is_lead := public.is_shift_unrestricted_user();

  if not v_is_lead then
    if not public.is_assigned_to_shift(p_shift_id) then
      raise exception 'אין הרשאה';
    end if;
    if v_shift.starts_at is null
       and v_shift.shift_date > (timezone('Asia/Jerusalem', now()))::date then
      raise exception 'ניתן לעדכן את המשמרת החל מתאריך המשמרת.';
    end if;
  end if;

  if v_shift.starts_at is null then
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
           and not public.has_role(auth.uid(), 'super_admin')
           and v_shift.shift_lead_id is distinct from auth.uid() then
          raise exception 'אין הרשאה למחוק אירוע שנוצר על ידי אחמ״ש אחר.';
        end if;

        delete from public.events
        where id in (select unnest(v_empty[1:v_drop]));
      end if;
    end loop;
  end if;

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

-- 9. refresh_shift_log_status needs no change: a live shift that has not started and
--    has nothing logged already resolves to 'in_progress'. The web derives "planned"
--    from the hours; no enum value is added.

-- 10. Grants. New public functions are executable by anon through default ACLs, so
--     anon is revoked explicitly. find_overlapping_live_shift is for the trigger only.
revoke all on function public.shift_open_for_crew(uuid) from public, anon;
revoke all on function public.is_shift_unrestricted_user() from public, anon, authenticated;
revoke all on function public.find_overlapping_live_shift(uuid, uuid) from public, anon, authenticated;
revoke all on function public.create_shift_event(uuid, uuid) from public, anon;
revoke all on function public.delete_empty_shift_event(uuid) from public, anon;
revoke all on function public.my_current_shift() from public, anon;
grant execute on function public.shift_open_for_crew(uuid) to authenticated;
grant execute on function public.create_shift_event(uuid, uuid) to authenticated;
grant execute on function public.delete_empty_shift_event(uuid) to authenticated;
grant execute on function public.my_current_shift() to authenticated;
revoke all on function public.raise_crew_window_closed(uuid) from public, anon, authenticated;
revoke all on function public.save_shift_born_event_fill(
  uuid, timestamp with time zone, text, text, boolean, text, jsonb, boolean, uuid, text, jsonb, boolean
) from public, anon;
grant execute on function public.save_shift_born_event_fill(
  uuid, timestamp with time zone, text, text, boolean, text, jsonb, boolean, uuid, text, jsonb, boolean
) to authenticated;

-- 11. Direct writes follow the window too. For an event on a live shift, a non-lead
--     crew member may write only while the window is open. Legacy shifts, events
--     without a shift, leads and admins are unchanged. Everything else in each
--     policy is identical to the definitions in 20260818110000 and 20260819120000.
create or replace function public.crew_may_write_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_shift_unrestricted_user()
    or not exists (
      select 1
      from public.events e
      join public.shifts s on s.id = e.shift_id
      where e.id = p_event_id and s.starts_at is not null
    )
    or exists (
      select 1
      from public.events e
      where e.id = p_event_id and public.shift_open_for_crew(e.shift_id)
    );
$$;

revoke all on function public.crew_may_write_event(uuid) from public, anon;
grant execute on function public.crew_may_write_event(uuid) to authenticated;

drop policy if exists treated_plates_event_write on public.event_treated_plates;
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
      and public.crew_may_write_event(e.id)
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
      and public.crew_may_write_event(e.id)
  )
);

drop policy if exists event_media_insert on public.event_media;
create policy event_media_insert on public.event_media
for insert to authenticated
with check (
  uploaded_by = auth.uid()
  and public.is_assigned_to_event(event_id)
  and public.crew_may_write_event(event_id)
);

drop policy if exists event_media_update on public.event_media;
create policy event_media_update on public.event_media
for update to authenticated
using (
  uploaded_by = auth.uid()
  and public.is_assigned_to_event(event_id)
  and public.crew_may_write_event(event_id)
)
with check (
  uploaded_by = auth.uid()
  and public.is_assigned_to_event(event_id)
  and public.crew_may_write_event(event_id)
);

drop policy if exists event_media_delete on public.event_media;
create policy event_media_delete on public.event_media
for delete to authenticated
using (
  uploaded_by = auth.uid()
  and public.is_assigned_to_event(event_id)
  and public.crew_may_write_event(event_id)
);
