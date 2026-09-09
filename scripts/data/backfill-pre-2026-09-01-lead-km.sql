-- One-off production backfill (NOT a schema migration).
--
-- Goal: events created through 2026-09-01 Asia/Jerusalem should stop showing
-- as חסר ק״מ. The UI treats any null `event_responders.total_km` as missing;
-- `0` counts as filled (see src/lib/eventIncomplete.ts).
--
-- Value: 0 — a placeholder, not a guessed distance. Fuel-refund KM sums stay
-- the same; EVENT COUNTS and profile lifetime_event_count will rise (null KM
-- rows become included). Cancelled / shift-born / no-vehicle rows are included
-- because they also trip the missing-KM stamp today.
--
-- Cutoff: events.created_at < 2026-09-02 00:00:00+03 (end of 1 Sep Israel).
--
-- Side-effect guard: disable only `event_responders_guard_fill_overdue` for the
-- update so we do NOT stamp fill_completable_at. That clock would turn
-- responder inbox cards red and fire 48h/7d overdue fill mail. Client
-- notifyFillReady is not invoked by SQL. Audit + freeze triggers stay on
-- (0 km does not freeze).
--
-- How to run: Supabase SQL editor as postgres, preview first, then apply.
-- Idempotent: only rows with total_km IS NULL are updated.

-- =============================================================================
-- 1) PREVIEW (read-only) — run this first and keep the result
-- =============================================================================

with cutoff as (
  select timestamptz '2026-09-02 00:00:00+03' as at
)
select
  (select count(*) from public.events e, cutoff where e.created_at < cutoff.at)
    as events_before_cutoff,
  count(*) filter (
    where exists (
      select 1
      from public.event_responders er
      where er.event_id = e.id
        and er.total_km is null
    )
  ) as events_with_any_null_km,
  (
    select count(*)
    from public.event_responders er
    join public.events ev on ev.id = er.event_id
    cross join cutoff
    where ev.created_at < cutoff.at
      and er.total_km is null
  ) as assignments_null_km,
  (
    select count(*)
    from public.event_responders er
    join public.events ev on ev.id = er.event_id
    cross join cutoff
    where ev.created_at < cutoff.at
      and er.total_km is null
      and ev.origin = 'shift'
  ) as null_km_shift_born,
  (
    select count(*)
    from public.event_responders er
    join public.events ev on ev.id = er.event_id
    cross join cutoff
    where ev.created_at < cutoff.at
      and er.total_km is null
      and ev.is_cancelled
  ) as null_km_cancelled,
  (
    select count(*)
    from public.event_responders er
    join public.events ev on ev.id = er.event_id
    cross join cutoff
    where ev.created_at < cutoff.at
      and er.total_km is null
      and er.status = 'done'
  ) as null_km_fill_done,
  (
    select count(*)
    from public.event_responders er
    join public.events ev on ev.id = er.event_id
    cross join cutoff
    where ev.created_at < cutoff.at
      and er.total_km is null
      and er.status <> 'done'
  ) as null_km_fill_open,
  (
    select count(*)
    from public.event_responders er
    join public.events ev on ev.id = er.event_id
    cross join cutoff
    where ev.created_at < cutoff.at
      and er.total_km is null
      and coalesce(btrim(er.vehicle_plate), '') = ''
  ) as null_km_no_plate
from public.events e
cross join cutoff
where e.created_at < cutoff.at;

-- =============================================================================
-- 2) APPLY — run only after the preview looks right
-- =============================================================================

begin;

create temporary table backfill_pre_sept_2026_km_ids on commit drop as
select er.id
from public.event_responders as er
join public.events as e on e.id = er.event_id
where e.created_at < timestamptz '2026-09-02 00:00:00+03'
  and er.total_km is null;

alter table public.event_responders
  disable trigger event_responders_guard_fill_overdue;

update public.event_responders as er
set
  total_km = 0,
  updated_at = now()
where er.id in (select id from backfill_pre_sept_2026_km_ids);

alter table public.event_responders
  enable trigger event_responders_guard_fill_overdue;

-- Immediate lifetime snapshot so פרופיל / החזר דלק do not wait for 07:00/19:00.
select public.refresh_profile_lifetime_stats();

-- Verify inside the same transaction (0 remaining null KM before cutoff).
select
  (select count(*) from backfill_pre_sept_2026_km_ids) as rows_updated,
  (
    select count(*)
    from public.event_responders as er
    join public.events as e on e.id = er.event_id
    where e.created_at < timestamptz '2026-09-02 00:00:00+03'
      and er.total_km is null
  ) as remaining_null_km_before_cutoff,
  (
    select count(*)
    from public.event_responders as er
    where er.id in (select id from backfill_pre_sept_2026_km_ids)
      and er.fill_completable_at is not null
  ) as updated_rows_that_already_had_fill_clock,
  (
    select count(*)
    from public.event_responders as er
    where er.id in (select id from backfill_pre_sept_2026_km_ids)
      and er.total_km is distinct from 0
  ) as updated_rows_not_zero;

-- commit;   -- uncomment after the verify select looks right
-- rollback; -- use this instead if remaining_null_km_before_cutoff <> 0
--             -- or updated_rows_not_zero <> 0

-- Rollback later (same session only, before commit drop):
--   alter table public.event_responders disable trigger event_responders_guard_fill_overdue;
--   update public.event_responders set total_km = null, updated_at = now()
--   where id in (select id from backfill_pre_sept_2026_km_ids);
--   alter table public.event_responders enable trigger event_responders_guard_fill_overdue;
