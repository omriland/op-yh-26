-- The משוב inbox becomes a small task board for the super admins.
--
-- Adds an in_progress status, an assignee (a super admin), and tasks a super
-- admin opens directly: a title, an optional body, no kind, no recording.
-- Existing rows keep their status and stay unassigned.
--
-- Submitters still insert only open, unassigned, untitled feedback. Only a
-- super admin may set status, assignee or title, or insert a task, and every
-- insert starts open. A task's title and body stay editable; submitted
-- feedback stays locked. Select is unchanged: a submitter reads their own
-- rows, a task belongs to the super admin who opened it.
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
  and status = 'open'
  and (
    (assignee_id is null and title is null and kind is not null)
    or public.has_role(auth.uid(), 'super_admin')
  )
);

-- Unchanged from 20260901150000; restated so the board's write rule reads in one place.
drop policy if exists user_feedback_update on public.user_feedback;
create policy user_feedback_update on public.user_feedback
for update to authenticated
using (public.has_role(auth.uid(), 'super_admin'))
with check (public.has_role(auth.uid(), 'super_admin'));

-- Checked only when the assignee changes, so a row assigned to someone who
-- later lost the role can still change status.
create or replace function public.user_feedback_check_assignee()
returns trigger
language plpgsql
as $$
begin
  if new.assignee_id is not null
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id)
     and not public.has_role(new.assignee_id, 'super_admin') then
    raise exception 'user_feedback_assignee' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists user_feedback_check_assignee on public.user_feedback;
create trigger user_feedback_check_assignee
before insert or update of assignee_id on public.user_feedback
for each row
execute function public.user_feedback_check_assignee();

-- Last defined in 20260902130000. A task (old.title set) may change its title
-- and body; submitted feedback stays as the volunteer sent it.
create or replace function public.user_feedback_lock_identity()
returns trigger
language plpgsql
as $$
begin
  if new.user_id is distinct from old.user_id
     or new.kind is distinct from old.kind
     or new.page_path is distinct from old.page_path
     or new.audio_storage_path is distinct from old.audio_storage_path
     or new.audio_mime_type is distinct from old.audio_mime_type
     or new.audio_byte_size is distinct from old.audio_byte_size
     or new.attachments is distinct from old.attachments
     or (old.title is null and new.title is not null)
     or (old.title is not null and new.title is null)
     or (old.title is null and new.body is distinct from old.body) then
    raise exception 'user_feedback_immutable' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- Active super admins (assignable) plus anyone still holding a row who no
-- longer qualifies, so the inbox can name them. Empty for anyone but a super admin.
create or replace function public.feedback_assignees()
returns table (
  id uuid,
  full_name text,
  assignable boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.full_name, (p.active and public.has_role(p.id, 'super_admin')) as assignable
  from public.profiles p
  where public.has_role(auth.uid(), 'super_admin')
    and (
      (p.active and public.has_role(p.id, 'super_admin'))
      or exists (select 1 from public.user_feedback f where f.assignee_id = p.id)
    )
  order by p.full_name;
$$;

revoke all on function public.feedback_assignees() from public;
grant execute on function public.feedback_assignees() to authenticated;
