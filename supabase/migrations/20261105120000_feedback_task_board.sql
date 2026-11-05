-- The משוב inbox becomes a small task board for the super admins.
--
-- Adds an in_progress status, an assignee (a super admin), and tasks a super
-- admin opens directly: a title, an optional body, no kind, no recording.
-- Existing rows keep their status and stay unassigned.
--
-- Submitters still insert only open, unassigned, untitled feedback. Only a
-- super admin may set status, assignee or title, or insert a task. Select is
-- unchanged: a submitter reads their own rows, a task belongs to the super
-- admin who opened it.
--
-- in_progress is not referenced below, so it may be added in this transaction.

alter type public.user_feedback_status add value if not exists 'in_progress' after 'open';

alter table public.user_feedback
  add column if not exists title text,
  add column if not exists assignee_id uuid references public.profiles (id) on delete set null;

alter table public.user_feedback
  alter column kind drop not null;

alter table public.user_feedback
  drop constraint if exists user_feedback_title_len,
  drop constraint if exists user_feedback_kind_or_title,
  drop constraint if exists user_feedback_has_content;

alter table public.user_feedback
  add constraint user_feedback_title_len check (
    title is null or (char_length(btrim(title)) > 0 and char_length(title) <= 120)
  ),
  add constraint user_feedback_kind_or_title check (kind is not null or title is not null),
  add constraint user_feedback_has_content check (
    (body is not null and char_length(btrim(body)) > 0)
    or audio_storage_path is not null
    or title is not null
  );

create index if not exists user_feedback_assignee_idx
  on public.user_feedback (assignee_id)
  where assignee_id is not null;

drop policy if exists user_feedback_insert on public.user_feedback;
create policy user_feedback_insert on public.user_feedback
for insert to authenticated
with check (
  user_id = auth.uid()
  and (
    (status = 'open' and assignee_id is null and title is null and kind is not null)
    or (
      public.has_role(auth.uid(), 'super_admin')
      and (assignee_id is null or public.has_role(assignee_id, 'super_admin'))
    )
  )
);

drop policy if exists user_feedback_update on public.user_feedback;
create policy user_feedback_update on public.user_feedback
for update to authenticated
using (public.has_role(auth.uid(), 'super_admin'))
with check (
  public.has_role(auth.uid(), 'super_admin')
  and (assignee_id is null or public.has_role(assignee_id, 'super_admin'))
);

-- The people a task can be assigned to. Empty for anyone but a super admin.
create or replace function public.feedback_assignees()
returns table (
  id uuid,
  full_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.full_name
  from public.profiles p
  where public.has_role(auth.uid(), 'super_admin')
    and public.has_role(p.id, 'super_admin')
    and p.active
  order by p.full_name;
$$;

revoke all on function public.feedback_assignees() from public;
grant execute on function public.feedback_assignees() to authenticated;
