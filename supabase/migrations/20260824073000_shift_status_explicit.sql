-- Shift status follows documentation, not start/close and not the calendar.
--
--   in_progress  -> פתוחה   (nothing logged yet)
--   draft        -> טיוטה   (responder started the shift or an event)
--   closed       -> נסגרה   (both odometers and every shift-born event is done)
--
-- Empty event slots do not count as logging. Mirrors deriveShiftLogStatus
-- in src/lib/shiftLogStatus.ts.

create or replace function public.refresh_shift_log_status(p_shift_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start numeric;
  v_end numeric;
  v_shift_done boolean;
  v_all_events_done boolean;
  v_any_started boolean;
  v_next public.shift_status;
begin
  select s.odometer_start, s.odometer_end
    into v_start, v_end
  from public.shifts s
  where s.id = p_shift_id;

  if not found then
    return;
  end if;

  v_shift_done := v_start is not null and v_end is not null;

  select
    coalesce(bool_and(e.status = 'done'), true),
    coalesce(bool_or(
      e.status = 'done'
      or nullif(btrim(coalesce(e.police_event_id, '')), '') is not null
      or nullif(btrim(coalesce(e.treatment_detail, '')), '') is not null
      or nullif(btrim(coalesce(e.treatment_notes, '')), '') is not null
      or e.road_id is not null
      or nullif(btrim(coalesce(e.location, '')), '') is not null
      or exists (
        select 1
        from public.event_treated_vehicles t
        where t.event_id = e.id
          and coalesce(t.quantity, 0) > 0
      )
    ), false)
  into v_all_events_done, v_any_started
  from public.events e
  where e.shift_id = p_shift_id
    and e.origin = 'shift';

  if v_shift_done and v_all_events_done then
    v_next := 'closed';
  elsif v_shift_done or v_start is not null or v_end is not null or v_any_started then
    v_next := 'draft';
  else
    v_next := 'in_progress';
  end if;

  update public.shifts
  set status = v_next
  where id = p_shift_id
    and status is distinct from v_next;
end;
$$;

revoke all on function public.refresh_shift_log_status(uuid) from public;
grant execute on function public.refresh_shift_log_status(uuid) to authenticated;

create or replace function public.trg_refresh_shift_log_status_from_shift()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_shift_log_status(new.id);
  return new;
end;
$$;

drop trigger if exists trg_refresh_shift_log_status_from_shift on public.shifts;
create trigger trg_refresh_shift_log_status_from_shift
after insert or update of odometer_start, odometer_end on public.shifts
for each row
execute function public.trg_refresh_shift_log_status_from_shift();

create or replace function public.trg_refresh_shift_log_status_from_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift_id uuid;
begin
  v_shift_id := coalesce(new.shift_id, old.shift_id);
  if v_shift_id is not null then
    perform public.refresh_shift_log_status(v_shift_id);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_refresh_shift_log_status_from_event on public.events;
create trigger trg_refresh_shift_log_status_from_event
after insert or update of status, police_event_id, treatment_detail, treatment_notes,
  road_id, location, shift_id or delete
on public.events
for each row
execute function public.trg_refresh_shift_log_status_from_event();

create or replace function public.trg_refresh_shift_log_status_from_treated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_shift_id uuid;
begin
  v_event_id := coalesce(new.event_id, old.event_id);
  select e.shift_id into v_shift_id
  from public.events e
  where e.id = v_event_id;
  if v_shift_id is not null then
    perform public.refresh_shift_log_status(v_shift_id);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_refresh_shift_log_status_from_treated on public.event_treated_vehicles;
create trigger trg_refresh_shift_log_status_from_treated
after insert or update or delete on public.event_treated_vehicles
for each row
execute function public.trg_refresh_shift_log_status_from_treated();

alter table public.shifts
  alter column status set default 'in_progress';

update public.shifts as s
set status = derived.status
from (
  select s2.id, (
    case
      when s2.odometer_start is not null
        and s2.odometer_end is not null
        and not exists (
          select 1
          from public.events e
          where e.shift_id = s2.id
            and e.origin = 'shift'
            and e.status is distinct from 'done'
        )
        then 'closed'::public.shift_status
      when s2.odometer_start is not null
        or s2.odometer_end is not null
        or exists (
          select 1
          from public.events e
          where e.shift_id = s2.id
            and e.origin = 'shift'
            and (
              e.status = 'done'
              or nullif(btrim(coalesce(e.police_event_id, '')), '') is not null
              or nullif(btrim(coalesce(e.treatment_detail, '')), '') is not null
              or nullif(btrim(coalesce(e.treatment_notes, '')), '') is not null
              or e.road_id is not null
              or nullif(btrim(coalesce(e.location, '')), '') is not null
              or exists (
                select 1
                from public.event_treated_vehicles t
                where t.event_id = e.id
                  and coalesce(t.quantity, 0) > 0
              )
            )
        )
        then 'draft'::public.shift_status
      else 'in_progress'::public.shift_status
    end
  ) as status
  from public.shifts s2
) as derived
where derived.id = s.id
  and s.status is distinct from derived.status;

comment on column public.shifts.status is
  'Derived from logging: in_progress = פתוחה (nothing logged); draft = טיוטה (partial); closed = נסגרה (odometers + every shift-born event done).';
