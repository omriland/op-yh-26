-- One-time-seeded reference list of named highway junctions/interchanges.
-- Seeded once from saariko/RoadsKMs (see the seed migration) — NOT synced afterward.
-- All later changes (aliases, corrections, missing junctions) go through the
-- super-admin HighwayJunctionsPage directly into this table.

create table public.highway_junctions (
  id uuid primary key default gen_random_uuid(),
  name_he text not null,
  name_en text,
  aliases_he text[] not null default '{}',
  aliases_en text[] not null default '{}',
  roads text,
  lat double precision not null,
  lng double precision not null,
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

create unique index highway_junctions_name_he_idx on public.highway_junctions (name_he);

comment on table public.highway_junctions is
  'Named highway junctions/interchanges, seeded once from saariko/RoadsKMs. Not synced after the seed — managed entirely in-app from then on.';
comment on column public.highway_junctions.aliases_he is
  'Alternate Hebrew names the same junction is known by. Matched by search_highway_junctions but never shown as the result label.';
comment on column public.highway_junctions.roads is
  'Free-text intersecting roads, informational only (e.g. "34/35") — not a FK to public.roads.';

alter table public.highway_junctions enable row level security;

create policy highway_junctions_select_ops
  on public.highway_junctions
  for select to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'shift_lead')
    or public.has_role(auth.uid(), 'super_admin')
  );

create policy highway_junctions_super_admin_write
  on public.highway_junctions
  for all to authenticated
  using (public.has_role(auth.uid(), 'super_admin'))
  with check (public.has_role(auth.uid(), 'super_admin'));

-- Fuzzy junction search: canonical name/id only, never a raw alias string.
-- Mirrors list_unit_map_pins()'s security-definer + in-function auth gate.
create or replace function public.search_highway_junctions(q text)
returns table (
  id uuid,
  name_he text,
  name_en text,
  roads text,
  lat double precision,
  lng double precision
)
language sql
stable
security definer
set search_path = public
as $$
  select j.id, j.name_he, j.name_en, j.roads, j.lat, j.lng
  from public.highway_junctions j
  where (
      public.has_role(auth.uid(), 'admin')
      or public.has_role(auth.uid(), 'shift_lead')
      or public.has_role(auth.uid(), 'super_admin')
    )
    and length(btrim(q)) > 0
    and (
      j.name_he ilike '%' || btrim(q) || '%'
      or j.name_en ilike '%' || btrim(q) || '%'
      or exists (select 1 from unnest(j.aliases_he) a where a ilike '%' || btrim(q) || '%')
      or exists (select 1 from unnest(j.aliases_en) a where a ilike '%' || btrim(q) || '%')
    )
  order by j.name_he
  limit 15;
$$;

revoke all on function public.search_highway_junctions(text) from public;
grant execute on function public.search_highway_junctions(text) to authenticated;
