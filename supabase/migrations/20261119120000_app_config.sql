-- Remote config for the phone apps: texts, colors and feature flags that change
-- without a new build. iOS reads it at launch (yahpaz-ios App/API/RemoteConfigStore.swift);
-- Android does not read it yet.
--
-- Edited by hand in the Supabase table editor. One row per override:
--   kind 'text'   key = the Hebrew string exactly as the app shows it today,
--                 value = the replacement, as a JSON string. Fixed texts only: a text
--                 built from data (a name, a count) is matched on its final wording.
--   kind 'color'  key = a theme token such as 'field.accent' or 'command.page',
--                 value = '"#1D4E89"'.
--   kind 'flag'   key = 'tab.<view>' (mine, my_shifts, contacts, events, shifts, map,
--                 reports, users), 'feature.feedback' or 'feature.plateScan',
--                 value = false to hide, true to show. Every flag is on when no row exists.
-- platform 'all' applies to every client, 'ios' / 'android' to one. A row with a bad
-- value is ignored by the app and the built-in value is used.
--
-- The app applies changes at its next cold start, not mid-session.
--
-- Readable before login (the login screen uses these texts and colors), so nothing
-- secret belongs here. No client can write: there is no insert/update/delete policy.

create table if not exists public.app_config (
  id bigint generated always as identity primary key,
  platform text not null default 'all' check (platform in ('all', 'ios', 'android')),
  kind text not null check (kind in ('text', 'color', 'flag')),
  key text not null check (char_length(key) between 1 and 500),
  value jsonb not null,
  note text,
  updated_at timestamptz not null default now(),
  constraint app_config_unique_key unique (platform, kind, key),
  constraint app_config_value_type check (
    (kind in ('text', 'color') and jsonb_typeof(value) = 'string')
    or (kind = 'flag' and jsonb_typeof(value) = 'boolean')
  ),
  constraint app_config_color_hex check (
    kind <> 'color' or (value #>> '{}') ~ '^#[0-9A-Fa-f]{6}$'
  )
);

create or replace function public.app_config_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists app_config_touch on public.app_config;
create trigger app_config_touch
  before update on public.app_config
  for each row execute function public.app_config_touch();

alter table public.app_config enable row level security;

drop policy if exists app_config_read on public.app_config;
create policy app_config_read on public.app_config
  for select to anon, authenticated
  using (true);

grant select on public.app_config to anon, authenticated;
