-- Correct shifts.status for future-dated shifts.
--
-- 20260821060000_shift_status_backfill.sql derived `in_progress` from crew assignment
-- alone, so a shift scheduled for a future date with responders already assigned was
-- marked `in_progress` and rendered the stamp `במשמרת` — a claim that someone is on
-- shift right now. A shift that has not started cannot carry that label, however
-- fully crewed it already is.
--
-- That migration is left untouched because it has already been applied; this one
-- corrects the rows it got wrong. The client rule now matches (deriveShiftStatus in
-- src/lib/shiftForm.ts gates in_progress on the shift not being in the future).
--
-- Corrected rule:
--   both odometer readings present  -> closed   (readings are the completion signal)
--   shift_date in the future        -> draft    (scheduled, not started)
--   at least one responder assigned -> in_progress
--   otherwise                       -> draft
--
-- Dates are compared in Asia/Jerusalem, the clock the application derives "today"
-- from, so a shift does not flip status at UTC midnight.
--
-- Idempotent: only rewrites rows whose derived status differs.

update public.shifts as s
set status = derived.status
from (
  select
    s2.id,
    case
      when s2.odometer_start is not null and s2.odometer_end is not null
        then 'closed'::public.shift_status
      when s2.shift_date > (now() at time zone 'Asia/Jerusalem')::date
        then 'draft'::public.shift_status
      when exists (
        select 1
        from public.shift_responders sr
        where sr.shift_id = s2.id
      )
        then 'in_progress'::public.shift_status
      else 'draft'::public.shift_status
    end as status
  from public.shifts s2
) as derived
where derived.id = s.id
  and s.status is distinct from derived.status;

comment on column public.shifts.status is
  'Derived on save: closed when both odometer readings exist; draft when the shift date is still in the future; in_progress when a crew is assigned to a shift that has started; otherwise draft. Mirrors deriveShiftStatus in src/lib/shiftForm.ts.';
