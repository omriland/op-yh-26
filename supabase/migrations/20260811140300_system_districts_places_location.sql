-- System שלוחות (locked) + Google Places fields on events

alter table public.districts
  add column if not exists code text;

create unique index if not exists districts_code_unique
  on public.districts (code)
  where code is not null;

alter table public.events
  add column if not exists location_place_id text,
  add column if not exists location_lat double precision,
  add column if not exists location_lng double precision;

-- One system שלוחה (combined name). Follow-up migration may repair older envs.
update public.districts
set code = 'station_other_duplicated'
where name = 'תחנה / אחר / משוכפל' and code is null;

insert into public.districts (name, code, active, sort_order)
select
  'תחנה / אחר / משוכפל',
  'station_other_duplicated',
  true,
  coalesce((select max(sort_order) from public.districts), 0) + 1
where not exists (
  select 1 from public.districts where code = 'station_other_duplicated'
);

create or replace function public.protect_system_districts()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.code is not null then
      raise exception 'system districts cannot be deleted';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if old.code is not null then
      if new.code is distinct from old.code then
        raise exception 'system district code cannot change';
      end if;
      if new.name is distinct from old.name then
        raise exception 'system districts cannot be renamed';
      end if;
      if new.active is distinct from old.active then
        raise exception 'system districts cannot change active';
      end if;
    end if;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists protect_system_districts on public.districts;
create trigger protect_system_districts
  before update or delete on public.districts
  for each row
  execute function public.protect_system_districts();
