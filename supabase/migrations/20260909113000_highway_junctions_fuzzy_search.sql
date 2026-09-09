-- Preserve exact/prefix priority while allowing small spelling errors.
-- The web client also performs cached fuzzy matching immediately, so this
-- migration is not required for localhost testing against the current remote.

create extension if not exists pg_trgm with schema extensions;

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
set search_path = public, extensions
as $$
  with params as (
    select btrim(q) as query
  ),
  scored as (
    select
      j.id,
      j.name_he,
      j.name_en,
      j.roads,
      j.lat,
      j.lng,
      p.query,
      greatest(
        similarity(j.name_he, p.query),
        similarity(coalesce(j.name_en, ''), p.query),
        coalesce((select max(similarity(alias, p.query)) from unnest(j.aliases_he) alias), 0),
        coalesce((select max(similarity(alias, p.query)) from unnest(j.aliases_en) alias), 0)
      ) as fuzzy_score
    from public.highway_junctions j
    cross join params p
    where (
      public.has_role(auth.uid(), 'admin')
      or public.has_role(auth.uid(), 'shift_lead')
      or public.has_role(auth.uid(), 'super_admin')
    )
      and length(p.query) > 0
  )
  select s.id, s.name_he, s.name_en, s.roads, s.lat, s.lng
  from scored s
  where
    s.name_he ilike '%' || s.query || '%'
    or s.name_en ilike '%' || s.query || '%'
    or exists (
      select 1 from public.highway_junctions j2, unnest(j2.aliases_he) alias
      where j2.id = s.id and alias ilike '%' || s.query || '%'
    )
    or exists (
      select 1 from public.highway_junctions j2, unnest(j2.aliases_en) alias
      where j2.id = s.id and alias ilike '%' || s.query || '%'
    )
    or s.fuzzy_score >= 0.28
  order by
    case
      when s.name_he = s.query then 0
      when s.name_he ilike s.query || '%' then 1
      when s.name_he ilike '%' || s.query || '%' then 2
      else 3
    end,
    s.fuzzy_score desc,
    s.name_he
  limit 15;
$$;

revoke all on function public.search_highway_junctions(text) from public;
grant execute on function public.search_highway_junctions(text) to authenticated;
