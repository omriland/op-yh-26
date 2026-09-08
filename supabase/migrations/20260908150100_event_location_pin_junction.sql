-- Add 'junction' as a canonical event-pin source (picked from highway_junctions, §ops-map).

alter table public.events
  drop constraint if exists events_location_pin_source_check;

alter table public.events
  add constraint events_location_pin_source_check
  check (
    location_pin_source is null
    or location_pin_source in ('places', 'geocode', 'shift_lead', 'responder', 'junction')
  );

comment on column public.events.location_pin_source is
  'Last writer of the canonical pin: places | geocode | shift_lead | responder | junction. Human/junction sources lock auto-geocode.';
