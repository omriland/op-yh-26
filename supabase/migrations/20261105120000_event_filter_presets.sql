-- Saved views (תצוגות) for the unit אירועים list: a name plus the filter set.
-- Each user sees and edits only their own rows. Until this is applied the web
-- client keeps presets in localStorage (src/lib/eventFilterPresets.ts).

create table public.event_filter_presets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null,
  view jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_filter_presets_name_length check (char_length(btrim(name)) between 1 and 40),
  constraint event_filter_presets_view_object check (jsonb_typeof(view) = 'object')
);

create unique index event_filter_presets_user_name_uidx
  on public.event_filter_presets (user_id, lower(btrim(name)));

comment on table public.event_filter_presets is
  'Per-user saved filter views for the web unit events list.';

create or replace function public.event_filter_presets_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger event_filter_presets_set_updated_at
before update on public.event_filter_presets
for each row
execute function public.event_filter_presets_set_updated_at();

alter table public.event_filter_presets enable row level security;

grant select, insert, update, delete on table public.event_filter_presets to authenticated;

create policy event_filter_presets_select on public.event_filter_presets
for select to authenticated
using (user_id = (select auth.uid()));

create policy event_filter_presets_insert on public.event_filter_presets
for insert to authenticated
with check (user_id = (select auth.uid()));

create policy event_filter_presets_update on public.event_filter_presets
for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy event_filter_presets_delete on public.event_filter_presets
for delete to authenticated
using (user_id = (select auth.uid()));
