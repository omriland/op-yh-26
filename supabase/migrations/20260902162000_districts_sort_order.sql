-- districts.sort_order already exists (init). Compact to 1..n in the current
-- display order (sort_order, name, id) so dropdowns stay stable on first migrate.
-- Writes remain admin-only via districts_admin_write RLS.

update public.districts
set sort_order = sort_order + 1000000;

with ordered as (
  select
    id,
    row_number() over (order by sort_order, name, id)::int as next_order
  from public.districts
)
update public.districts as d
set sort_order = ordered.next_order
from ordered
where d.id = ordered.id;
