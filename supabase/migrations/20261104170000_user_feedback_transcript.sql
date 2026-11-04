-- Hebrew transcript of a משוב voice note. Written by the transcribe-feedback
-- edge function (service role). No length cap: a long note must not be rejected.
-- Select stays the existing row policy (owner or super_admin). Update stays
-- super_admin only, so a submitter cannot edit the transcript. The identity
-- lock does not include these columns.

alter table public.user_feedback
  add column if not exists transcript text,
  add column if not exists transcribed_at timestamptz;
