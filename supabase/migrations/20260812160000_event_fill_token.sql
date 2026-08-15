-- Scoped fill tokens + fill-ready email marker on participations.
alter table public.event_responders
  add column if not exists fill_token_hash text;

alter table public.event_responders
  add column if not exists fill_token_expires_at timestamptz;

alter table public.event_responders
  add column if not exists fill_ready_emailed_at timestamptz;

comment on column public.event_responders.fill_token_hash is
  'SHA-256 hex of opaque fill link token; raw token only in email URL.';
comment on column public.event_responders.fill_token_expires_at is
  'Fill token expiry (typically 7 days from mint).';
comment on column public.event_responders.fill_ready_emailed_at is
  'When fill-ready email was successfully sent; prevents duplicate sends.';

create index if not exists event_responders_fill_token_hash_idx
  on public.event_responders (fill_token_hash)
  where fill_token_hash is not null;
