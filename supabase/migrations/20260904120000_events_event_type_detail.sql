-- Optional short text when סוג אירוע is אחר.
alter table public.events
  add column if not exists event_type_detail text;

comment on column public.events.event_type_detail is
  'Optional short text when event_type name is אחר. Null when unused or empty.';
