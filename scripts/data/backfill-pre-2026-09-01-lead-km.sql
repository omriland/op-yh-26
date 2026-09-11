-- One-off production backfill (NOT a schema migration).
-- Run in the Supabase SQL editor as postgres. Preview first, then apply.
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
-- (0 km does not freeze). Do not use session_replication_role = replica.
--
-- If this session dies after DISABLE and before ENABLE without a rollback,
-- real KM entry would stop starting the overdue clock. The apply block
-- asserts the trigger is back on before COMMIT.
--
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
  ) as null_km_no_plate,
  (
    select count(*)
    from public.event_responders er
    join public.events ev on ev.id = er.event_id
    cross join cutoff
    where ev.created_at < cutoff.at
      and er.total_km is null
      and er.fill_completable_at is not null
  ) as null_km_already_have_fill_clock,
  (
    select count(*)
    from public.event_responders er
    join public.events ev on ev.id = er.event_id
    where ev.created_at >= timestamptz '2026-09-02 00:00:00+03'
      and er.total_km is null
  ) as post_cutoff_null_km
from public.events e
cross join cutoff
where e.created_at < cutoff.at;

-- =============================================================================
-- 2) APPLY — one transaction; assertions ROLLBACK on failure
-- =============================================================================

begin;

create temporary table backfill_pre_sept_2026_km_ids on commit drop as
select
  er.id,
  er.fill_completable_at,
  er.fill_ready_emailed_at,
  er.overdue_48h_emailed_at,
  er.overdue_7d_emailed_at
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
from backfill_pre_sept_2026_km_ids as t
where er.id = t.id
  and er.total_km is null;

alter table public.event_responders
  enable trigger event_responders_guard_fill_overdue;

do $$
declare
  leftover_null integer;
  not_zero integer;
  clock_changed integer;
  trigger_state text;
begin
  select count(*)
    into leftover_null
  from public.event_responders as er
  join public.events as e on e.id = er.event_id
  where e.created_at < timestamptz '2026-09-02 00:00:00+03'
    and er.total_km is null;

  if leftover_null <> 0 then
    raise exception 'remaining_null_km_before_cutoff = %; rolling back', leftover_null;
  end if;

  select count(*)
    into not_zero
  from public.event_responders as er
  join backfill_pre_sept_2026_km_ids as t on t.id = er.id
  where er.total_km is distinct from 0;

  if not_zero <> 0 then
    raise exception 'updated_rows_not_zero = %; rolling back', not_zero;
  end if;

  select count(*)
    into clock_changed
  from public.event_responders as er
  join backfill_pre_sept_2026_km_ids as t on t.id = er.id
  where er.fill_completable_at is distinct from t.fill_completable_at
     or er.fill_ready_emailed_at is distinct from t.fill_ready_emailed_at
     or er.overdue_48h_emailed_at is distinct from t.overdue_48h_emailed_at
     or er.overdue_7d_emailed_at is distinct from t.overdue_7d_emailed_at;

  if clock_changed <> 0 then
    raise exception 'overdue/fill-ready columns changed on % rows; rolling back', clock_changed;
  end if;

  select tgenabled
    into trigger_state
  from pg_trigger
  where tgrelid = 'public.event_responders'::regclass
    and tgname = 'event_responders_guard_fill_overdue';

  if trigger_state is distinct from 'O' then
    raise exception 'overdue trigger not re-enabled (tgenabled=%); rolling back', trigger_state;
  end if;
end
$$;

select public.refresh_profile_lifetime_stats();

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
    join public.events as e on e.id = er.event_id
    where e.created_at >= timestamptz '2026-09-02 00:00:00+03'
      and er.total_km is null
  ) as post_cutoff_null_km,
  (
    select count(*)
    from public.event_responders as er
    join backfill_pre_sept_2026_km_ids as t on t.id = er.id
    where er.fill_completable_at is not null
      and t.fill_completable_at is null
  ) as newly_stamped_fill_clock,
  (
    select tgenabled
    from pg_trigger
    where tgrelid = 'public.event_responders'::regclass
      and tgname = 'event_responders_guard_fill_overdue'
  ) as overdue_trigger_enabled;

commit;
