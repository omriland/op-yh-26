-- Store full wall-clock datetimes (Asia/Jerusalem semantics in the app).
alter table public.event_responders
  add column if not exists started_at timestamp without time zone,
  add column if not exists ended_at timestamp without time zone;

update public.event_responders er
set
  started_at = case
    when er.start_time is null then null
    else (e.event_date + er.start_time)
  end,
  ended_at = case
    when er.end_time is null then null
    when er.start_time is not null and er.end_time < er.start_time
      then ((e.event_date + 1) + er.end_time)
    else (e.event_date + er.end_time)
  end
from public.events e
where e.id = er.event_id
  and (er.start_time is not null or er.end_time is not null);

alter table public.event_responders
  drop column if exists start_time,
  drop column if exists end_time;

comment on column public.event_responders.started_at is 'Lead-owned start wall time; date = event_date';
comment on column public.event_responders.ended_at is 'Lead-owned end wall time; same day or next day if end clock < start';
