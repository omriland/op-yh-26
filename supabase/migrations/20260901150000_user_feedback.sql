-- In-app feedback: typed and/or recorded notes. Super-admin inbox.

create type public.user_feedback_kind as enum ('bug', 'suggestion');
create type public.user_feedback_status as enum ('open', 'fixed', 'wont_do');

create table public.user_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  kind public.user_feedback_kind not null,
  body text,
  page_path text,
  status public.user_feedback_status not null default 'open',
  audio_storage_path text unique,
  audio_mime_type text,
  audio_byte_size int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_feedback_body_len check (body is null or char_length(body) <= 2000),
  constraint user_feedback_page_path_len check (page_path is null or char_length(page_path) <= 200),
  constraint user_feedback_has_content check (
    (body is not null and char_length(btrim(body)) > 0)
    or audio_storage_path is not null
  ),
  constraint user_feedback_audio_consistent check (
    (
      audio_storage_path is null
      and audio_mime_type is null
      and audio_byte_size is null
    )
    or (
      audio_storage_path is not null
      and audio_mime_type in ('audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg')
      and audio_byte_size > 0
      and audio_byte_size <= 5242880
    )
  )
);

create index user_feedback_status_created_idx
  on public.user_feedback (status, created_at desc);

create index user_feedback_user_created_idx
  on public.user_feedback (user_id, created_at desc);

create or replace function public.user_feedback_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger user_feedback_set_updated_at
before update on public.user_feedback
for each row
execute function public.user_feedback_set_updated_at();

create or replace function public.user_feedback_lock_identity()
returns trigger
language plpgsql
as $$
begin
  if new.user_id is distinct from old.user_id
     or new.kind is distinct from old.kind
     or new.body is distinct from old.body
     or new.page_path is distinct from old.page_path
     or new.audio_storage_path is distinct from old.audio_storage_path
     or new.audio_mime_type is distinct from old.audio_mime_type
     or new.audio_byte_size is distinct from old.audio_byte_size then
    raise exception 'user_feedback_immutable' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger user_feedback_lock_identity
before update on public.user_feedback
for each row
execute function public.user_feedback_lock_identity();

alter table public.user_feedback enable row level security;

grant select, insert, update, delete on table public.user_feedback to authenticated;
grant usage on type public.user_feedback_kind to authenticated;
grant usage on type public.user_feedback_status to authenticated;

create policy user_feedback_select on public.user_feedback
for select to authenticated
using (
  user_id = auth.uid()
  or public.has_role(auth.uid(), 'super_admin')
);

create policy user_feedback_insert on public.user_feedback
for insert to authenticated
with check (
  user_id = auth.uid()
  and status = 'open'
);

create policy user_feedback_update on public.user_feedback
for update to authenticated
using (public.has_role(auth.uid(), 'super_admin'))
with check (public.has_role(auth.uid(), 'super_admin'));

create policy user_feedback_delete on public.user_feedback
for delete to authenticated
using (public.has_role(auth.uid(), 'super_admin'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'user-feedback',
  'user-feedback',
  false,
  5242880,
  array['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.user_feedback_path_user_id(object_name text)
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

revoke all on function public.user_feedback_path_user_id(text) from public;
grant execute on function public.user_feedback_path_user_id(text) to authenticated;

drop policy if exists user_feedback_storage_select on storage.objects;
drop policy if exists user_feedback_storage_insert on storage.objects;
drop policy if exists user_feedback_storage_delete on storage.objects;

create policy user_feedback_storage_select
on storage.objects for select to authenticated
using (
  bucket_id = 'user-feedback'
  and (
    public.user_feedback_path_user_id(name) = auth.uid()
    or public.has_role(auth.uid(), 'super_admin')
  )
);

create policy user_feedback_storage_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'user-feedback'
  and name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webm|m4a|mp4|ogg|mp3)$'
  and public.user_feedback_path_user_id(name) = auth.uid()
);

create policy user_feedback_storage_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'user-feedback'
  and (
    public.has_role(auth.uid(), 'super_admin')
    or (
      public.user_feedback_path_user_id(name) = auth.uid()
      and not exists (
        select 1 from public.user_feedback f where f.audio_storage_path = name
      )
    )
  )
);
