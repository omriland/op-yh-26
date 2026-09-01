-- Per-user pins/hides for Android "האירועים הפעילים שלי".

create type public.my_active_event_pref_kind as enum ('pin', 'hide');

create table public.my_active_event_prefs (
  user_id uuid not null references public.profiles (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  kind public.my_active_event_pref_kind not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, event_id)
);

create index my_active_event_prefs_user_idx
  on public.my_active_event_prefs (user_id, kind);

comment on table public.my_active_event_prefs is
  'Android lead board: pin extra events or hide auto-active events.';

create or replace function public.my_active_event_prefs_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger my_active_event_prefs_set_updated_at
before update on public.my_active_event_prefs
for each row
execute function public.my_active_event_prefs_set_updated_at();

create or replace function public.my_active_event_prefs_enforce_hide()
returns trigger
language plpgsql
as $$
declare
  v_lead uuid;
  v_status public.event_status;
  v_cancelled boolean;
begin
  if new.kind is distinct from 'hide' then
    return new;
  end if;
  select e.shift_lead_id, e.status, e.is_cancelled
    into v_lead, v_status, v_cancelled
  from public.events e
  where e.id = new.event_id;
  if found
     and coalesce(v_cancelled, false) = false
     and v_status = 'draft'
     and v_lead = new.user_id then
    raise exception 'לא ניתן להסיר אירוע בהזנה שאתם אחמ״ש שלו.';
  end if;
  return new;
end;
$$;

create trigger my_active_event_prefs_enforce_hide
before insert or update on public.my_active_event_prefs
for each row
execute function public.my_active_event_prefs_enforce_hide();

alter table public.my_active_event_prefs enable row level security;

grant select, insert, update, delete on table public.my_active_event_prefs to authenticated;
grant usage on type public.my_active_event_pref_kind to authenticated;

create policy my_active_event_prefs_select on public.my_active_event_prefs
for select to authenticated
using (user_id = (select auth.uid()));

create policy my_active_event_prefs_insert on public.my_active_event_prefs
for insert to authenticated
with check (user_id = (select auth.uid()));

create policy my_active_event_prefs_update on public.my_active_event_prefs
for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy my_active_event_prefs_delete on public.my_active_event_prefs
for delete to authenticated
using (user_id = (select auth.uid()));
