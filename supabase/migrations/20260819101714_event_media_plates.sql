-- Many treated plates per event photo.

create table public.event_media_plates (
  media_id uuid not null references public.event_media (id) on delete cascade,
  treated_plate_id uuid not null references public.event_treated_plates (id) on delete cascade,
  primary key (media_id, treated_plate_id)
);

create index event_media_plates_plate_idx
  on public.event_media_plates (treated_plate_id);

insert into public.event_media_plates (media_id, treated_plate_id)
select id, treated_plate_id
from public.event_media
where treated_plate_id is not null
on conflict do nothing;

drop trigger if exists event_media_plate_same_event on public.event_media;
drop function if exists public.event_media_plate_same_event();

alter table public.event_media drop column if exists treated_plate_id;

create or replace function public.event_media_plates_same_event()
returns trigger
language plpgsql
as $$
declare
  media_event uuid;
  plate_event uuid;
begin
  select m.event_id into media_event from public.event_media m where m.id = new.media_id;
  select coalesce(p.event_id, er.event_id)
    into plate_event
  from public.event_treated_plates p
  left join public.event_responders er on er.id = p.event_responder_id
  where p.id = new.treated_plate_id;

  if media_event is null or plate_event is null or plate_event is distinct from media_event then
    raise exception 'plate_not_on_event' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger event_media_plates_same_event
before insert or update on public.event_media_plates
for each row
execute function public.event_media_plates_same_event();

create or replace function public.event_media_plates_not_cancelled()
returns trigger
language plpgsql
as $$
declare
  cancelled boolean;
  target_event uuid;
begin
  select m.event_id into target_event
  from public.event_media m
  where m.id = coalesce(new.media_id, old.media_id);

  select e.is_cancelled into cancelled from public.events e where e.id = target_event;
  if cancelled then
    raise exception 'event_cancelled' using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger event_media_plates_not_cancelled
before insert or update or delete on public.event_media_plates
for each row
execute function public.event_media_plates_not_cancelled();

alter table public.event_media_plates enable row level security;
grant select, insert, delete on table public.event_media_plates to authenticated;

create policy event_media_plates_select on public.event_media_plates
for select to authenticated
using (
  exists (
    select 1 from public.event_media m
    where m.id = event_media_plates.media_id
      and (
        public.has_role(auth.uid(), 'admin')
        or public.has_role(auth.uid(), 'shift_lead')
        or public.is_assigned_to_event(m.event_id)
      )
  )
);

create policy event_media_plates_insert on public.event_media_plates
for insert to authenticated
with check (
  exists (
    select 1 from public.event_media m
    where m.id = media_id
      and m.uploaded_by = auth.uid()
      and public.is_assigned_to_event(m.event_id)
  )
);

create policy event_media_plates_delete on public.event_media_plates
for delete to authenticated
using (
  exists (
    select 1 from public.event_media m
    where m.id = media_id
      and m.uploaded_by = auth.uid()
      and public.is_assigned_to_event(m.event_id)
  )
);
