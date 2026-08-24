-- Backfill shifts.status from the record itself.
--
-- `saveShiftForm` wrote the literal 'draft' on insert and never wrote status on
-- update, so every existing row is 'draft' regardless of whether the shift was
-- fully logged. The client now derives status on save (see deriveShiftStatus in
-- src/lib/shiftForm.ts), but a lazy transition would leave the unit list telling
-- leads that hundreds of closed shifts are still drafts until each one is touched.
--
-- The rule mirrors the client derivation exactly:
--   both odometer readings present            -> closed
--   otherwise, at least one responder assigned -> in_progress
--   otherwise                                  -> draft
--
-- Idempotent: re-running only rewrites rows whose derived status differs.

update public.shifts as s
set status = derived.status
from (
  select
    s2.id,
    case
      when s2.odometer_start is not null and s2.odometer_end is not null
        then 'closed'::public.shift_status
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
  'Derived on save from the odometer readings and crew assignment: closed when both readings exist, in_progress when a crew is assigned, otherwise draft. Backfilled 2026-08-21.';
