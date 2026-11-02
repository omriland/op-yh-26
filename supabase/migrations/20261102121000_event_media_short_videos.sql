-- Event media accepts short videos next to photos.
--
-- Photos stay compressed JPEGs up to 1.5 MB. Videos are stored as uploaded:
-- MP4, QuickTime (iPhone .mov) or WebM, up to 25 MB, which keeps them short.
-- The 20-item cap per event (event_media_cap) counts photos and videos together.
--
-- The bucket limit is per file, not per type, so it rises to 25 MB; the table
-- check below is what holds photos to 1.5 MB.

alter table public.event_media drop constraint if exists event_media_jpeg_only;
alter table public.event_media drop constraint if exists event_media_type_and_size;
alter table public.event_media add constraint event_media_type_and_size check (
  (mime_type = 'image/jpeg' and byte_size <= 1572864)
  or (mime_type in ('video/mp4', 'video/quicktime', 'video/webm') and byte_size <= 26214400)
);

update storage.buckets
set file_size_limit = 26214400,
    allowed_mime_types = array['image/jpeg', 'video/mp4', 'video/quicktime', 'video/webm']::text[]
where id = 'event-media';

drop policy if exists event_media_storage_insert on storage.objects;

create policy event_media_storage_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'event-media'
  and name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|mp4|mov|webm)$'
  and public.is_assigned_to_event(public.event_media_path_event_id(name))
  and exists (
    select 1 from public.events e
    where e.id = public.event_media_path_event_id(name)
      and e.is_cancelled is false
  )
);
