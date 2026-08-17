-- Live responder location: scoped track token + latest point only.

alter table public.event_responders
  add column if not exists track_token_hash text;

alter table public.event_responders
  add column if not exists track_token_expires_at timestamptz;

alter table public.event_responders
  add column if not exists tracking_sms_sent_at timestamptz;

comment on column public.event_responders.track_token_hash is
  'SHA-256 hex of opaque live-track link token; raw token only in SMS URL.';
comment on column public.event_responders.track_token_expires_at is
  'Track token expiry (typically 7 days from mint).';
comment on column public.event_responders.tracking_sms_sent_at is
  'When the tracking SMS was accepted by Soprano; prevents duplicate sends.';

create index if not exists event_responders_track_token_hash_idx
  on public.event_responders (track_token_hash)
  where track_token_hash is not null;

create table if not exists public.event_responder_live_locations (
  event_responder_id uuid primary key
    references public.event_responders (id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  accuracy_m double precision,
  recorded_at timestamptz not null,
  updated_at timestamptz not null default now(),
  constraint event_responder_live_locations_lat_chk check (lat between -90 and 90),
  constraint event_responder_live_locations_lng_chk check (lng between -180 and 180)
);

comment on table public.event_responder_live_locations is
  'Latest live GPS point per assignment. Deleted when tracking stops.';

alter table public.event_responder_live_locations enable row level security;

revoke all on table public.event_responder_live_locations from anon;
grant select on table public.event_responder_live_locations to authenticated;
revoke insert, update, delete on table public.event_responder_live_locations from authenticated;

drop policy if exists event_responder_live_locations_select_ops
  on public.event_responder_live_locations;

create policy event_responder_live_locations_select_ops
  on public.event_responder_live_locations
  for select to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'shift_lead')
  );

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'event_responder_live_locations'
  ) then
    execute 'alter publication supabase_realtime add table public.event_responder_live_locations';
  end if;
end $$;
