-- העשרות: comments on an event, with an optional "העשרת זהב" mark.
--
-- Anyone who can see an event (admin, shift lead, or assigned to it) can read
-- and add enrichments, at any time. There is no client edit or delete: the only
-- later change is the gold mark, set through set_event_enrichment_gold. A
-- deleted event takes its enrichments with it (on delete cascade).
--
-- Authors: account deletion anonymizes the profile row instead of removing it,
-- so author_id stays valid. author_id is still "on delete set null" so a real
-- profile delete never loses other people's history. Responders cannot read
-- every profile, so names come from list_event_enrichments (security definer),
-- which hides the name and callsign of a deleted account.
--
-- Re-runnable: the Deploy Edge Functions workflow applies it on every run, last,
-- after 20261124120000 (the final replay step). It only adds objects no earlier
-- replay touches, and depends on the demo helpers from 20261029120000.

create table if not exists public.event_enrichments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  author_id uuid default auth.uid() references public.profiles (id) on delete set null,
  body text not null,
  is_gold boolean not null default false,
  gold_marked_by uuid references public.profiles (id) on delete set null,
  gold_marked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint event_enrichments_body_not_blank check (length(btrim(body)) > 0)
);

create index if not exists event_enrichments_event_created_idx
  on public.event_enrichments (event_id, created_at);

alter table public.event_enrichments enable row level security;

-- Explicit grants: a client may only supply event_id and body. id, author_id,
-- is_gold and created_at always come from the column defaults, so nobody can
-- forge the date and time. Gold changes go through set_event_enrichment_gold.
revoke all on table public.event_enrichments from public, anon, authenticated;
grant select on table public.event_enrichments to authenticated;
grant insert (event_id, body) on table public.event_enrichments to authenticated;

-- Same audience as event_media_select: admin, shift lead, or assigned.
create or replace function public.can_see_event_enrichments(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'shift_lead')
    or public.is_assigned_to_event(p_event_id);
$$;

revoke all on function public.can_see_event_enrichments(uuid) from public, anon;
grant execute on function public.can_see_event_enrichments(uuid) to authenticated, service_role;

drop policy if exists event_enrichments_select on public.event_enrichments;
create policy event_enrichments_select on public.event_enrichments
  for select to authenticated
  using (public.can_see_event_enrichments(event_id));

drop policy if exists event_enrichments_insert on public.event_enrichments;
create policy event_enrichments_insert on public.event_enrichments
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and is_gold = false
    and gold_marked_by is null
    and gold_marked_at is null
    and public.can_see_event_enrichments(event_id)
  );

-- Demo accounts see and write demo events' rows only, real accounts real rows
-- only (same shape as event_media_app_review_demo_scope).
drop policy if exists event_enrichments_app_review_demo_scope on public.event_enrichments;
create policy event_enrichments_app_review_demo_scope on public.event_enrichments
  as restrictive for all to authenticated
  using (
    coalesce(event_id = any ((select public.app_review_demo_event_ids())::uuid[]), false)
      = (select public.is_app_review_demo_caller())
  )
  with check (
    coalesce(event_id = any ((select public.app_review_demo_event_ids())::uuid[]), false)
      = (select public.is_app_review_demo_caller())
  );

-- ---------------------------------------------------------------------------
-- Reading with author names. Security definer, so it checks the audience and
-- the demo scope itself.
-- ---------------------------------------------------------------------------

create or replace function public.list_event_enrichments(p_event_id uuid)
returns table (
  id uuid,
  event_id uuid,
  author_id uuid,
  author_name text,
  author_callsign text,
  body text,
  is_gold boolean,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.can_see_event_enrichments(p_event_id) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if coalesce(p_event_id = any (public.app_review_demo_event_ids()), false)
     is distinct from public.is_app_review_demo_caller() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  return query
  select
    en.id,
    en.event_id,
    en.author_id,
    case when p.deleted_at is null then p.full_name end,
    case when p.deleted_at is null then p.callsign end,
    en.body,
    en.is_gold,
    en.created_at
  from public.event_enrichments en
  left join public.profiles p on p.id = en.author_id
  where en.event_id = p_event_id
  order by en.created_at, en.id;
end;
$$;

revoke all on function public.list_event_enrichments(uuid) from public, anon;
grant execute on function public.list_event_enrichments(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Gold mark: anyone who can see the event may mark or unmark any enrichment.
-- ---------------------------------------------------------------------------

create or replace function public.set_event_enrichment_gold(
  p_enrichment_id uuid,
  p_gold boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_event uuid;
begin
  if auth.uid() is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select en.event_id into target_event
  from public.event_enrichments en
  where en.id = p_enrichment_id;

  if target_event is null or not public.can_see_event_enrichments(target_event) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if coalesce(target_event = any (public.app_review_demo_event_ids()), false)
     is distinct from public.is_app_review_demo_caller() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  update public.event_enrichments
  set is_gold = coalesce(p_gold, false),
      gold_marked_by = case when coalesce(p_gold, false) then auth.uid() end,
      gold_marked_at = case when coalesce(p_gold, false) then now() end
  where id = p_enrichment_id;
end;
$$;

revoke all on function public.set_event_enrichment_gold(uuid, boolean) from public, anon;
grant execute on function public.set_event_enrichment_gold(uuid, boolean) to authenticated;
