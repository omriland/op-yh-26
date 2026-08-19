-- Event photos: table + private Storage bucket + RLS.

create type public.event_media_taken_when as enum (
  'before_treatment',
  'during_after_treatment'
);

create table public.event_media (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  uploaded_by uuid not null references public.profiles (id),
  treated_plate_id uuid references public.event_treated_plates (id) on delete set null,
  caption text,
  taken_when public.event_media_taken_when not null,
  storage_path text not null unique,
  mime_type text not null default 'image/jpeg',
  byte_size int not null,
  width int,
  height int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_media_caption_len check (caption is null or char_length(caption) <= 200),
  constraint event_media_byte_size_pos check (byte_size > 0),
  constraint event_media_jpeg_only check (mime_type = 'image/jpeg')
);

create index event_media_event_taken_created_idx
  on public.event_media (event_id, taken_when, created_at);

create or replace function public.event_media_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger event_media_set_updated_at
before update on public.event_media
for each row
execute function public.event_media_set_updated_at();

create or replace function public.event_media_plate_same_event()
returns trigger
language plpgsql
as $$
declare
  plate_event uuid;
begin
  if new.treated_plate_id is null then
    return new;
  end if;

  select coalesce(p.event_id, er.event_id)
    into plate_event
  from public.event_treated_plates p
  left join public.event_responders er on er.id = p.event_responder_id
  where p.id = new.treated_plate_id;

  if plate_event is null or plate_event is distinct from new.event_id then
    raise exception 'plate_not_on_event' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger event_media_plate_same_event
before insert or update of treated_plate_id on public.event_media
for each row
execute function public.event_media_plate_same_event();

create or replace function public.event_media_cap()
returns trigger
language plpgsql
as $$
begin
  if (
    select count(*) from public.event_media m where m.event_id = new.event_id
  ) >= 20 then
    raise exception 'event_media_cap' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger event_media_cap
before insert on public.event_media
for each row
execute function public.event_media_cap();

create or replace function public.event_media_not_cancelled()
returns trigger
language plpgsql
as $$
declare
  cancelled boolean;
  target_event uuid;
begin
  target_event := coalesce(new.event_id, old.event_id);
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

create trigger event_media_not_cancelled
before insert or update or delete on public.event_media
for each row
execute function public.event_media_not_cancelled();

create or replace function public.event_media_immutable_identity()
returns trigger
language plpgsql
as $$
begin
  if new.event_id is distinct from old.event_id
     or new.uploaded_by is distinct from old.uploaded_by
     or new.storage_path is distinct from old.storage_path
     or new.mime_type is distinct from old.mime_type
     or new.byte_size is distinct from old.byte_size
     or new.width is distinct from old.width
     or new.height is distinct from old.height then
    raise exception 'event_media_immutable' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger event_media_immutable_identity
before update on public.event_media
for each row
execute function public.event_media_immutable_identity();

alter table public.event_media enable row level security;

grant select, insert, update, delete on table public.event_media to authenticated;
grant usage on type public.event_media_taken_when to authenticated;

create policy event_media_select on public.event_media
for select to authenticated
using (
  public.has_role(auth.uid(), 'admin')
  or public.has_role(auth.uid(), 'shift_lead')
  or public.is_assigned_to_event(event_id)
);

create policy event_media_insert on public.event_media
for insert to authenticated
with check (
  uploaded_by = auth.uid()
  and public.is_assigned_to_event(event_id)
);

create policy event_media_update on public.event_media
for update to authenticated
using (
  uploaded_by = auth.uid()
  and public.is_assigned_to_event(event_id)
)
with check (
  uploaded_by = auth.uid()
  and public.is_assigned_to_event(event_id)
);

create policy event_media_delete on public.event_media
for delete to authenticated
using (
  uploaded_by = auth.uid()
  and public.is_assigned_to_event(event_id)
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-media', 'event-media', false, 1572864, array['image/jpeg']::text[])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.event_media_path_event_id(object_name text)
returns uuid
language plpgsql
immutable
as $$
declare
  folder text;
begin
  folder := (storage.foldername(object_name))[1];
  if folder is null
     or folder !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  return folder::uuid;
end;
$$;

revoke all on function public.event_media_path_event_id(text) from public;
grant execute on function public.event_media_path_event_id(text) to authenticated;

drop policy if exists event_media_storage_select on storage.objects;
drop policy if exists event_media_storage_insert on storage.objects;
drop policy if exists event_media_storage_delete on storage.objects;

create policy event_media_storage_select
on storage.objects for select to authenticated
using (
  bucket_id = 'event-media'
  and (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'shift_lead')
    or public.is_assigned_to_event(public.event_media_path_event_id(name))
  )
);

create policy event_media_storage_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'event-media'
  and name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
  and public.is_assigned_to_event(public.event_media_path_event_id(name))
  and exists (
    select 1 from public.events e
    where e.id = public.event_media_path_event_id(name)
      and e.is_cancelled is false
  )
);

create policy event_media_storage_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'event-media'
  and public.is_assigned_to_event(public.event_media_path_event_id(name))
  and (
    not exists (
      select 1 from public.event_media m where m.storage_path = name
    )
    or exists (
      select 1 from public.event_media m
      where m.storage_path = name
        and m.uploaded_by = auth.uid()
    )
  )
);
