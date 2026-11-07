-- The משוב board: a card's place in its column, one internal note, and the
-- record that its submitter was texted.
--
-- A side table, so user_feedback, its triggers and its policies stay exactly as
-- deployed: the current inbox and the Android client are unaffected. One row
-- per card, created the first time a manager moves a card or writes a note, or
-- when the user-feedback edge function texts the submitter. A card with no row
-- sorts by created_at.
--
-- Super admins only, for every operation: a submitter can read their own
-- user_feedback rows but never the note written about them. Rows go with their
-- feedback (on delete cascade), so delete_user_account needs no change.
--
-- SMS at most once per feedback, ever. Only the edge function (service role,
-- auth.uid() is null) writes the sms_* columns:
--   sms_sending_at  claimed just before sending; cleared if the send fails.
--                   A claim that is never cleared (a crash mid-send) blocks any
--                   further SMS for that item: maybe-sent counts as sent.
--   sms_sent_at     set only after Soprano accepted the message.
--   sms_sent_inferred  true for feedback already טופל before this table
--                   existed: the old flow texted on every טופל, but kept no record.

create table if not exists public.user_feedback_board (
  feedback_id uuid primary key references public.user_feedback (id) on delete cascade,
  position double precision,
  note text,
  sms_sending_at timestamptz,
  sms_sent_at timestamptz,
  sms_sent_inferred boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  constraint user_feedback_board_note_len check (note is null or char_length(note) <= 2000)
);

create or replace function public.user_feedback_board_stamp()
returns trigger
language plpgsql
as $$
begin
  -- A signed-in manager may move cards and write notes, never touch the SMS record.
  if auth.uid() is not null and (
    (tg_op = 'INSERT' and (
      new.sms_sending_at is not null or new.sms_sent_at is not null or new.sms_sent_inferred
    ))
    or (tg_op = 'UPDATE' and (
      new.sms_sending_at is distinct from old.sms_sending_at
      or new.sms_sent_at is distinct from old.sms_sent_at
      or new.sms_sent_inferred is distinct from old.sms_sent_inferred
    ))
  ) then
    raise exception 'user_feedback_board_sms_server_only' using errcode = 'P0001';
  end if;
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

-- Submitted feedback already טופל was texted by the old flow (it texted on every
-- move to טופל and recorded nothing), so it counts as texted. Existing board
-- rows are left alone, which keeps a re-run from overriding a real record.
insert into public.user_feedback_board (feedback_id, sms_sent_at, sms_sent_inferred)
select f.id, f.updated_at, true
from public.user_feedback f
where f.status = 'fixed'
  and f.title is null
on conflict (feedback_id) do nothing;
