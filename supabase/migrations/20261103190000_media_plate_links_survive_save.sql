-- A photo's link to a treated vehicle survives the report save.
--
-- Every client (web, email link, shift-born report, Android, iOS) saves a report's
-- treated plates by deleting the rows and inserting them again. event_media_plates
-- cascades on the plate row, so each save silently dropped every photo link on it:
-- on 2026-11-03 only 3 of 98 photos on events with treated plates were still linked.
--
-- Fixed here rather than in the clients so installed apps are covered too. Before a
-- plate row is deleted, its photo links are held by owner (the responder's report or
-- the shared event list) and plate digits. When the same owner inserts the same
-- digits again, the links are restored to the new row. A save does both within
-- seconds; holds older than an hour are discarded, so a car removed for real and
-- added again later comes back unlinked.

create table public.event_media_plate_holds (
  media_id uuid not null references public.event_media (id) on delete cascade,
  event_responder_id uuid references public.event_responders (id) on delete cascade,
  event_id uuid references public.events (id) on delete cascade,
  plate_digits text not null,
  held_at timestamptz not null default now()
);

create unique index event_media_plate_holds_key
  on public.event_media_plate_holds (
    media_id,
    coalesce(event_responder_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(event_id, '00000000-0000-0000-0000-000000000000'::uuid),
    plate_digits
  );

alter table public.event_media_plate_holds enable row level security;
revoke all on table public.event_media_plate_holds from public, anon, authenticated;

create or replace function public.hold_media_plate_links()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(old.plate_digits, '') = '' then
    return old;
  end if;
  insert into public.event_media_plate_holds (media_id, event_responder_id, event_id, plate_digits)
  select mp.media_id, old.event_responder_id, old.event_id, old.plate_digits
  from public.event_media_plates mp
  where mp.treated_plate_id = old.id
  on conflict do nothing;
  return old;
end;
$$;

create or replace function public.restore_media_plate_links()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.event_media_plate_holds where held_at < now() - interval '1 hour';

  if coalesce(new.plate_digits, '') = '' then
    return new;
  end if;

  with restored as (
    delete from public.event_media_plate_holds h
    where h.plate_digits = new.plate_digits
      and h.event_responder_id is not distinct from new.event_responder_id
      and h.event_id is not distinct from new.event_id
    returning h.media_id
  )
  insert into public.event_media_plates (media_id, treated_plate_id)
  select distinct r.media_id, new.id
  from restored r
  join public.event_media m on m.id = r.media_id
  join public.events e on e.id = m.event_id
  where not e.is_cancelled
  on conflict do nothing;

  return new;
end;
$$;

revoke all on function public.hold_media_plate_links() from public, anon, authenticated;
revoke all on function public.restore_media_plate_links() from public, anon, authenticated;

drop trigger if exists event_treated_plates_hold_media_links on public.event_treated_plates;
create trigger event_treated_plates_hold_media_links
  before delete on public.event_treated_plates
  for each row
  execute function public.hold_media_plate_links();

drop trigger if exists event_treated_plates_restore_media_links on public.event_treated_plates;
create trigger event_treated_plates_restore_media_links
  after insert on public.event_treated_plates
  for each row
  execute function public.restore_media_plate_links();
