-- Event cancellation flag (orthogonal to event_status).
-- Keeps real event_type_id for analytics; treated vehicles blocked in client when true.

alter table public.events
  add column if not exists is_cancelled boolean not null default false;

comment on column public.events.is_cancelled is
  'True when the call was cancelled after dispatch; not an event type.';
