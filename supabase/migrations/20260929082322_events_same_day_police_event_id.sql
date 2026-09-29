-- Same-day מספר אירוע uniqueness among non-cancelled, non-blank rows.
-- Client already blocks a second event with the same police_event_id on the
-- same event_date. Cancelled rows do not occupy the number (reuse allowed).
-- Blank/null numbers may repeat. Cross-day reuse is allowed.
--
-- One existing pair remains: 5523 on 2026-09-08 (two drafts, 24s apart).
-- A unique index cannot apply until that pair is cleaned. This trigger
-- rejects NEW collisions without deleting or merging those rows. Saving
-- other fields on a grandfathered duplicate is allowed.

create or replace function public.events_reject_same_day_police_event_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_police_id text;
begin
  if new.is_cancelled then
    return new;
  end if;

  v_police_id := nullif(btrim(coalesce(new.police_event_id, '')), '');
  if v_police_id is null then
    return new;
  end if;

  -- Grandfather: this row already holds this active pair (including the
  -- known 5523 / 2026-09-08 drafts). Do not block note-only saves.
  if tg_op = 'UPDATE'
     and old.is_cancelled = false
     and old.police_event_id is not distinct from new.police_event_id
     and old.event_date is not distinct from new.event_date then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtext(v_police_id),
    hashtext(new.event_date::text)
  );

  if exists (
    select 1
    from public.events e
    where e.id is distinct from new.id
      and e.is_cancelled = false
      and e.event_date = new.event_date
      and nullif(btrim(coalesce(e.police_event_id, '')), '') is not null
      and btrim(e.police_event_id) = v_police_id
  ) then
    raise exception 'כבר קיים אירוע עם המספר הזה באותו תאריך.'
      using errcode = '23505';
  end if;

  return new;
end;
$$;

drop trigger if exists events_reject_same_day_police_event_id on public.events;
create trigger events_reject_same_day_police_event_id
before insert or update of police_event_id, event_date, is_cancelled
on public.events
for each row
execute function public.events_reject_same_day_police_event_id();
