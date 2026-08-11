-- One system שלוחה: "תחנה / אחר / משוכפל" (not three separate rows)

drop trigger if exists protect_system_districts on public.districts;

-- Prefer the existing combined-name row; else insert.
update public.districts
set code = 'station_other_duplicated'
where name = 'תחנה / אחר / משוכפל';

insert into public.districts (name, code, active, sort_order)
select
  'תחנה / אחר / משוכפל',
  'station_other_duplicated',
  true,
  coalesce((select max(sort_order) from public.districts), 0) + 1
where not exists (
  select 1 from public.districts where code = 'station_other_duplicated'
);

-- Remove the mistaken three seeded system rows (unused).
delete from public.districts
where code in ('station', 'other', 'duplicated')
   or (name in ('תחנה', 'אחר', 'משוכפל') and code is null);

-- Clear any leftover codes that are no longer valid system codes
-- (safety if delete skipped due to FK — shouldn't happen for unused rows).
update public.districts
set code = null
where code in ('station', 'other', 'duplicated');

create trigger protect_system_districts
  before update or delete on public.districts
  for each row
  execute function public.protect_system_districts();
