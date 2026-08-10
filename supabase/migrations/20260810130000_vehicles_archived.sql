-- Soft-archive vehicles that are referenced by event history so plates stay readable.
alter table public.vehicles
  add column if not exists archived boolean not null default false;

comment on column public.vehicles.archived is
  'When true, vehicle stays on the profile for history but cannot be assigned to new events.';
