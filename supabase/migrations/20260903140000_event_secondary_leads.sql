-- Secondary אחמ״ש: keep events.shift_lead_id as the one main lead.
-- Secondaries live in event_secondary_leads (never also main). Auto-edit locks.

create table public.event_secondary_leads (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  locked boolean not null default false,
  added_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create index event_secondary_leads_user_idx on public.event_secondary_leads (user_id);
create index event_secondary_leads_event_idx on public.event_secondary_leads (event_id);

comment on table public.event_secondary_leads is
  'אחמ״ש משני on an event. Main remains events.shift_lead_id. locked = auto-added on a real edit.';

alter table public.event_secondary_leads enable row level security;

create policy event_secondary_leads_select on public.event_secondary_leads
for select to authenticated
using (
  public.has_role(auth.uid(), 'admin')
  or public.has_role(auth.uid(), 'super_admin')
  or public.has_role(auth.uid(), 'shift_lead')
  or exists (
    select 1 from public.event_responders er
    where er.event_id = event_secondary_leads.event_id
      and er.responder_id = auth.uid()
  )
);

create policy event_secondary_leads_insert on public.event_secondary_leads
for insert to authenticated
with check (
  public.has_role(auth.uid(), 'admin')
  or public.has_role(auth.uid(), 'super_admin')
  or public.has_role(auth.uid(), 'shift_lead')
);

create policy event_secondary_leads_update on public.event_secondary_leads
for update to authenticated
using (
  public.has_role(auth.uid(), 'admin')
  or public.has_role(auth.uid(), 'super_admin')
  or public.has_role(auth.uid(), 'shift_lead')
)
with check (
  public.has_role(auth.uid(), 'admin')
  or public.has_role(auth.uid(), 'super_admin')
  or public.has_role(auth.uid(), 'shift_lead')
);

create policy event_secondary_leads_delete on public.event_secondary_leads
for delete to authenticated
using (
  locked = false
  and (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'super_admin')
    or public.has_role(auth.uid(), 'shift_lead')
  )
);

create or replace function public.list_shift_lead_profiles()
returns table (id uuid, full_name text, callsign text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (
    public.has_role(auth.uid(), 'shift_lead')
    or public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'super_admin')
  ) then
    return;
  end if;

  return query
  select p.id, p.full_name, p.callsign
  from public.profiles p
  where p.active
    and exists (
      select 1
      from public.user_roles ur
      where ur.user_id = p.id
        and ur.role = 'shift_lead'::public.app_role
    )
  order by p.full_name;
end;
$$;

revoke all on function public.list_shift_lead_profiles() from public;
grant execute on function public.list_shift_lead_profiles() to authenticated;

create or replace function public.enforce_event_secondary_lead_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_main uuid;
begin
  if tg_op = 'DELETE' then
    if old.locked then
      select e.shift_lead_id into v_main from public.events e where e.id = old.event_id;
      -- Promoting a locked secondary to main deletes their secondary row.
      if v_main is distinct from old.user_id then
        raise exception 'לא ניתן להסיר אחמ״ש משני שננעל בעריכה.';
      end if;
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' and old.locked and new.locked = false then
    raise exception 'לא ניתן להסיר אחמ״ש משני שננעל בעריכה.';
  end if;

  select e.shift_lead_id into v_main from public.events e where e.id = new.event_id;
  if v_main is not null and v_main = new.user_id then
    raise exception 'אחמ״ש ראשי אינו יכול להיות גם משני.';
  end if;

  if not public.has_role(new.user_id, 'shift_lead') then
    raise exception 'אחמ״ש משני חייב להיות משתמש עם תפקיד אחמ״ש.';
  end if;

  return new;
end;
$$;

drop trigger if exists event_secondary_leads_enforce on public.event_secondary_leads;
create trigger event_secondary_leads_enforce
before insert or update or delete on public.event_secondary_leads
for each row execute function public.enforce_event_secondary_lead_row();

create or replace function public.upsert_locked_secondary_lead(p_event_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_main uuid;
begin
  if p_event_id is null or p_user_id is null then
    return;
  end if;
  if not public.has_role(p_user_id, 'shift_lead') then
    return;
  end if;
  select e.shift_lead_id into v_main from public.events e where e.id = p_event_id;
  if v_main is null or v_main = p_user_id then
    return;
  end if;
  insert into public.event_secondary_leads (event_id, user_id, locked)
  values (p_event_id, p_user_id, true)
  on conflict (event_id, user_id) do update
    set locked = true;
end;
$$;

create or replace function public.guard_event_main_lead_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin boolean;
  v_create_transfer boolean;
  v_has_secondaries boolean;
begin
  if old.shift_lead_id is not distinct from new.shift_lead_id then
    return new;
  end if;

  v_admin :=
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'super_admin');
  select exists (
    select 1 from public.event_secondary_leads s where s.event_id = new.id
  ) into v_has_secondaries;
  v_create_transfer :=
    auth.uid() is not null
    and auth.uid() = old.shift_lead_id
    and public.has_role(auth.uid(), 'shift_lead')
    and not v_has_secondaries;
  if not v_admin and not v_create_transfer then
    raise exception 'רק מנהל יכול להחליף אחמ״ש ראשי.';
  end if;
  if not public.has_role(new.shift_lead_id, 'shift_lead') then
    raise exception 'אחמ״ש ראשי חייב להיות משתמש עם תפקיד אחמ״ש.';
  end if;
  return new;
end;
$$;

create or replace function public.sync_event_main_and_auto_secondary()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_field_change boolean;
begin
  if old.shift_lead_id is distinct from new.shift_lead_id then
    delete from public.event_secondary_leads
    where event_id = new.id
      and user_id = new.shift_lead_id;

    insert into public.event_secondary_leads (event_id, user_id, locked)
    values (new.id, old.shift_lead_id, false)
    on conflict (event_id, user_id) do nothing;
  end if;

  v_field_change :=
    old.event_date is distinct from new.event_date
    or old.police_event_id is distinct from new.police_event_id
    or old.district_id is distinct from new.district_id
    or old.patrol_callsign is distinct from new.patrol_callsign
    or old.event_type_id is distinct from new.event_type_id
    or old.road_id is distinct from new.road_id
    or old.location is distinct from new.location
    or old.location_place_id is distinct from new.location_place_id
    or old.location_lat is distinct from new.location_lat
    or old.location_lng is distinct from new.location_lng
    or old.location_pin_source is distinct from new.location_pin_source
    or old.notes is distinct from new.notes
    or old.is_cancelled is distinct from new.is_cancelled
    or old.bus_lane is distinct from new.bus_lane
    or old.status is distinct from new.status;
  -- updated_at-only (crew/autosave) still counts, but a main-only transfer must not lock.
  if not v_field_change
     and old.shift_lead_id is not distinct from new.shift_lead_id
     and old.updated_at is distinct from new.updated_at then
    v_field_change := true;
  end if;

  if v_field_change and auth.uid() is not null then
    perform public.upsert_locked_secondary_lead(new.id, auth.uid());
  end if;

  return new;
end;
$$;

drop trigger if exists events_guard_main_lead on public.events;
create trigger events_guard_main_lead
before update on public.events
for each row execute function public.guard_event_main_lead_change();

drop trigger if exists events_sync_secondary_leads on public.events;
create trigger events_sync_secondary_leads
after update on public.events
for each row execute function public.sync_event_main_and_auto_secondary();

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
