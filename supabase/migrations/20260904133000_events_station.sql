-- Optional short station name when שלוחה is the system district תחנה / אחר / משוכפל.
alter table public.events
  add column if not exists station text;

comment on column public.events.station is
  'Optional short station name when שלוחה is station_other_duplicated (תחנה / אחר / משוכפל). Null when unused or empty.';
