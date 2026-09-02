-- Optional image/video attachments on user_feedback (max 3).
-- Reuses private bucket user-feedback; paths: {user_id}/{feedback_id}/{attachment_id}.{ext}

alter table public.user_feedback
  add column if not exists attachments jsonb not null default '[]'::jsonb;

alter table public.user_feedback
  drop constraint if exists user_feedback_attachments_shape;

alter table public.user_feedback
  add constraint user_feedback_attachments_shape check (
    jsonb_typeof(attachments) = 'array'
    and jsonb_array_length(attachments) <= 3
  );

create or replace function public.user_feedback_validate_attachments()
returns trigger
language plpgsql
as $$
declare
  item jsonb;
  mime text;
  byte_size int;
  storage_path text;
  file_name text;
begin
  if new.attachments is null then
    new.attachments := '[]'::jsonb;
  end if;

  if jsonb_typeof(new.attachments) <> 'array'
     or jsonb_array_length(new.attachments) > 3 then
    raise exception 'user_feedback_attachments' using errcode = 'P0001';
  end if;

  for item in select value from jsonb_array_elements(new.attachments)
  loop
    storage_path := item->>'path';
    mime := item->>'mime';
    file_name := item->>'name';
    begin
      byte_size := (item->>'size')::int;
    exception
      when others then
        raise exception 'user_feedback_attachments' using errcode = 'P0001';
    end;

    if storage_path is null
       or mime is null
       or file_name is null
       or byte_size is null
       or char_length(storage_path) = 0
       or char_length(file_name) = 0
       or char_length(file_name) > 200
       or byte_size <= 0 then
      raise exception 'user_feedback_attachments' using errcode = 'P0001';
    end if;

    if mime not in (
      'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
      'video/mp4', 'video/webm', 'video/quicktime', 'video/3gpp'
    ) then
      raise exception 'user_feedback_attachments' using errcode = 'P0001';
    end if;

    if mime like 'image/%' and byte_size > 5242880 then
      raise exception 'user_feedback_attachments' using errcode = 'P0001';
    end if;

    if mime like 'video/%' and byte_size > 26214400 then
      raise exception 'user_feedback_attachments' using errcode = 'P0001';
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists user_feedback_validate_attachments on public.user_feedback;
create trigger user_feedback_validate_attachments
before insert on public.user_feedback
for each row
execute function public.user_feedback_validate_attachments();

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
     or new.audio_byte_size is distinct from old.audio_byte_size
     or new.attachments is distinct from old.attachments then
    raise exception 'user_feedback_immutable' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

update storage.buckets
set
  file_size_limit = 26214400,
  allowed_mime_types = array[
    'audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg',
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
    'video/mp4', 'video/webm', 'video/quicktime', 'video/3gpp'
  ]::text[]
where id = 'user-feedback';

drop policy if exists user_feedback_storage_insert on storage.objects;
create policy user_feedback_storage_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'user-feedback'
  and (
    name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webm|m4a|mp4|ogg|mp3)$'
    or name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpe?g|png|webp|gif|heic|heif|mp4|webm|mov|3gp)$'
  )
  and public.user_feedback_path_user_id(name) = auth.uid()
);

drop policy if exists user_feedback_storage_delete on storage.objects;
create policy user_feedback_storage_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'user-feedback'
  and (
    public.has_role(auth.uid(), 'super_admin')
    or (
      public.user_feedback_path_user_id(name) = auth.uid()
      and not exists (
        select 1
        from public.user_feedback f
        where f.audio_storage_path = name
           or exists (
             select 1
             from jsonb_array_elements(f.attachments) as a
             where a->>'path' = name
           )
      )
    )
  )
);
