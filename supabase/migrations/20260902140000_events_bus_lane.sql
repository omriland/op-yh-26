-- Event-level נת״צ (נתיב תחבורה ציבורית) flag.

alter table public.events
  add column if not exists bus_lane boolean not null default false;

comment on column public.events.bus_lane is
  'When true, the event took place in a bus / public-transit lane (נת״צ).';
