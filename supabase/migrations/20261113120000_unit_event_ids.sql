-- אירוע יחידתי: an event with no police number gets a unit ID instead.
--
-- A unit ID is 6 characters of 0-9 and A-Z with at least one letter, so it can
-- never equal a police number (digits only). It lives in police_event_id, so
-- lists, search, completeness and partner webhooks treat it as the event's number.
--
-- unit_event_ids is the ledger of every ID ever issued. Rows are never deleted,
-- so an ID is never issued twice, even after its event is deleted, cancelled or
-- given a real police number. Re-applied on every deploy, so every statement
-- here is idempotent.

create table if not exists public.unit_event_ids (
  code text primary key
    check (code ~ '^[0-9A-Z]{6}$' and code ~ '[A-Z]'),
  -- Deferred: the insert trigger claims the ID before the event row exists.
  event_id uuid references public.events (id) on delete set null
    deferrable initially deferred,
  issued_by uuid references auth.users (id) on delete set null default auth.uid(),
  issued_at timestamptz not null default now(),
  -- Set once, on the first save that uses the ID. A claimed ID only ever goes
  -- back to that same event, even after event_id is nulled by a delete.
  claimed_at timestamptz
);

-- Only the functions below touch the ledger.
alter table public.unit_event_ids enable row level security;
revoke all on public.unit_event_ids from anon, authenticated;

-- Issue a fresh unit ID to a shift lead or admin. The event claims it on save.
create or replace function public.issue_unit_event_id()
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_alphabet constant text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  v_code text;
  v_attempt int := 0;
begin
  if auth.uid() is null
     or not (
       public.has_role(auth.uid(), 'shift_lead')
       or public.has_role(auth.uid(), 'admin')
       or public.has_role(auth.uid(), 'super_admin')
     ) then
    raise exception 'unit_event_id_forbidden' using errcode = '42501';
  end if;

  loop
    v_attempt := v_attempt + 1;
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * 36)::int, 1);
    end loop;

    if v_code ~ '[A-Z]' then
      insert into public.unit_event_ids (code) values (v_code)
      on conflict (code) do nothing;
      if found then
        return v_code;
      end if;
    end if;

    if v_attempt >= 50 then
      raise exception 'unit_event_id_exhausted';
    end if;
  end loop;
end;
$$;

revoke all on function public.issue_unit_event_id() from public, anon;
grant execute on function public.issue_unit_event_id() to authenticated;

-- A police_event_id with a letter must be a unit ID that this event already
-- holds, or one the saving user was issued and no event has claimed yet.
create or replace function public.events_claim_unit_event_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := btrim(coalesce(new.police_event_id, ''));
  v_row public.unit_event_ids;
begin
  if v_code !~ '[A-Za-z]' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.police_event_id is not distinct from new.police_event_id then
    return new;
  end if;

  select * into v_row from public.unit_event_ids where code = v_code for update;

  -- Comparisons are null-safe: a plain `=` against a null event_id is unknown,
  -- and `if` would treat the whole test as false and let the save through.
  if v_row.code is null
     or not (
       coalesce(v_row.event_id = new.id, false)
       or (
         v_row.claimed_at is null
         and coalesce(v_row.issued_by = auth.uid(), false)
       )
     ) then
    raise exception 'מזהה יחידתי לא תקין.' using errcode = '23514';
  end if;

  if v_row.claimed_at is null then
    update public.unit_event_ids
    set event_id = new.id, claimed_at = now()
    where code = v_code;
  end if;

  return new;
end;
$$;

drop trigger if exists events_claim_unit_event_id on public.events;
create trigger events_claim_unit_event_id
  before insert or update of police_event_id on public.events
  for each row execute function public.events_claim_unit_event_id();
