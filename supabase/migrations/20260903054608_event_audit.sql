-- Who / when / before / after for events + event_responders.
-- Written by AFTER triggers (web, Android, Edge). Clients cannot insert.

create table public.event_audit (
  id uuid primary key default gen_random_uuid(),
  table_name text not null check (table_name in ('events', 'event_responders')),
  row_id uuid not null,
  event_id uuid,
  op text not null check (op in ('INSERT', 'UPDATE', 'DELETE')),
  actor_id uuid,
  changed_at timestamptz not null default now(),
  old_row jsonb,
  new_row jsonb,
  changed_fields text[]
);

create index event_audit_event_changed_idx
  on public.event_audit (event_id, changed_at desc);

create index event_audit_actor_changed_idx
  on public.event_audit (actor_id, changed_at desc);

create index event_audit_table_row_idx
  on public.event_audit (table_name, row_id);

comment on table public.event_audit is
  'Trigger-written audit of events and event_responders. SELECT for admin/super_admin only.';

create or replace function public.event_audit_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_changed text[];
  v_row_id uuid;
  v_event_id uuid;
begin
  if tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    if (v_old - 'updated_at') = (v_new - 'updated_at') then
      return null;
    end if;
    select coalesce(array_agg(k order by k), '{}')
    into v_changed
    from (
      select key as k
      from jsonb_each(v_old - 'updated_at') o
      full join jsonb_each(v_new - 'updated_at') n using (key)
      where o.value is distinct from n.value
    ) d;
    v_row_id := new.id;
    v_event_id := case
      when tg_table_name = 'events' then new.id
      else new.event_id
    end;
  elsif tg_op = 'INSERT' then
    v_new := to_jsonb(new);
    v_row_id := new.id;
    v_event_id := case
      when tg_table_name = 'events' then new.id
      else new.event_id
    end;
  elsif tg_op = 'DELETE' then
    v_old := to_jsonb(old);
    v_row_id := old.id;
    v_event_id := case
      when tg_table_name = 'events' then old.id
      else old.event_id
    end;
  end if;

  insert into public.event_audit (
    table_name,
    row_id,
    event_id,
    op,
    actor_id,
    old_row,
    new_row,
    changed_fields
  ) values (
    tg_table_name,
    v_row_id,
    v_event_id,
    tg_op,
    auth.uid(),
    v_old,
    v_new,
    v_changed
  );

  return null;
end;
$$;

revoke all on function public.event_audit_write() from public;

create trigger event_audit_on_events
  after insert or update or delete on public.events
  for each row execute function public.event_audit_write();

create trigger event_audit_on_event_responders
  after insert or update or delete on public.event_responders
  for each row execute function public.event_audit_write();

alter table public.event_audit enable row level security;

revoke all on table public.event_audit from public;
revoke all on table public.event_audit from anon;
revoke all on table public.event_audit from authenticated;
grant select on table public.event_audit to authenticated;

create policy event_audit_select_admin on public.event_audit
  for select to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'super_admin')
  );
