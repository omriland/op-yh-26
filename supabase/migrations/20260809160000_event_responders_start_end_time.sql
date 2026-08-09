alter table public.event_responders
  add column if not exists start_time time,
  add column if not exists end_time time;

comment on column public.event_responders.start_time is 'Lead-owned: זמן התחלה (time of day on event_date)';
comment on column public.event_responders.end_time is 'Lead-owned: זמן סיום (time of day on event_date)';
