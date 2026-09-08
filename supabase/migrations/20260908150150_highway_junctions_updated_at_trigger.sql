-- highway_junctions.updated_at was declared but never maintained on UPDATE.
-- Follow the same pattern as my_active_event_prefs/event_media: a BEFORE
-- UPDATE trigger, so it can't silently go stale regardless of write path.

create or replace function public.highway_junctions_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger highway_junctions_set_updated_at
before update on public.highway_junctions
for each row
execute function public.highway_junctions_set_updated_at();
