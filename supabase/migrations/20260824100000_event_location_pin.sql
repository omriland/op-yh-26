-- Canonical event map pin, independent of location text.
-- shift_lead: cockpit drag. responder: reserved for native arrival (no client/RLS in this slice).

alter table public.events
  add column if not exists location_pin_source text,
  add column if not exists location_pinned_at timestamptz,
  add column if not exists location_pinned_by uuid references auth.users (id) on delete set null;

alter table public.events
  drop constraint if exists events_location_pin_source_check;

alter table public.events
  add constraint events_location_pin_source_check
  check (
    location_pin_source is null
    or location_pin_source in ('places', 'geocode', 'shift_lead', 'responder')
  );

comment on column public.events.location_lat is
  'Canonical map pin latitude. Independent of location text.';

comment on column public.events.location_lng is
  'Canonical map pin longitude. Independent of location text.';

comment on column public.events.location_pin_source is
  'Last writer of the canonical pin: places | geocode | shift_lead | responder. Human sources (shift_lead, responder) lock auto-geocode.';
