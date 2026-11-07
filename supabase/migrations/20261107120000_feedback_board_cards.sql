-- The משוב board: a card's place in its column and one internal note.
--
-- A side table, so user_feedback, its triggers and its policies stay exactly as
-- deployed: the current inbox, the edge functions and the Android client are
-- unaffected. One row per card, created the first time a manager moves a card
-- or writes a note. A card with no row sorts by created_at.
--
-- Super admins only, for every operation: a submitter can read their own
-- user_feedback rows but never the note written about them. Rows go with their
-- feedback (on delete cascade), so delete_user_account needs no change.

create table if not exists public.user_feedback_board (
  feedback_id uuid primary key references public.user_feedback (id) on delete cascade,
  position double precision,
  note text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  constraint user_feedback_board_note_len check (note is null or char_length(note) <= 2000)
);

create or replace function public.user_feedback_board_stamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists user_feedback_board_stamp on public.user_feedback_board;
create trigger user_feedback_board_stamp
before insert or update on public.user_feedback_board
for each row
execute function public.user_feedback_board_stamp();

alter table public.user_feedback_board enable row level security;

grant select, insert, update, delete on table public.user_feedback_board to authenticated;

drop policy if exists user_feedback_board_manage on public.user_feedback_board;
create policy user_feedback_board_manage on public.user_feedback_board
for all to authenticated
using (public.has_role(auth.uid(), 'super_admin'))
with check (public.has_role(auth.uid(), 'super_admin'));
