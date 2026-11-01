-- event_responders_self_update read public.events directly. events_select
-- reads public.event_responders directly. Postgres expands both while
-- planning an UPDATE, raises 42P17 (infinite recursion), and the form shows
-- the generic connection error. Inserts are unaffected, so creating an
-- event and coming back to fill the volunteer row is what fails.
--
-- A security definer lookup keeps the events read out of the policy
-- expander. Same shape as is_event_id_edit_unlocked.

create or replace function public.event_is_open_for_responder_edit(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select e.status is distinct from 'done'
      from public.events e
      where e.id = p_event_id
    ),
    false
  );
$$;

revoke all on function public.event_is_open_for_responder_edit(uuid) from public;
grant execute on function public.event_is_open_for_responder_edit(uuid) to authenticated;

drop policy if exists event_responders_self_update on public.event_responders;

create policy event_responders_self_update on public.event_responders
  for update to authenticated
  using (
    responder_id = auth.uid()
    and status is distinct from 'done'
    and public.event_is_open_for_responder_edit(event_id)
  )
  with check (
    responder_id = auth.uid()
  );
