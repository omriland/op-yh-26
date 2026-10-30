-- Rollback check for the legacy event-report archive. LOCAL database only, after
-- archive.sql (or any replay that applied the migration):
--   scripts/app-review-demo/test/run-local-db.sh \
--     scripts/legacy-archive/test/archive.sql scripts/legacy-archive/test/rollback.sql
-- Not wrapped in a transaction: it runs the real rollback file, which commits.

\set QUIET on
set client_min_messages = notice;

\ir ../rollback-20261030120000.sql
\ir ../rollback-20261030120000.sql
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'legacy')
     or exists (select 1 from pg_proc where proname = 'legacy_report_search') then
    raise exception 'rollback left archive objects behind';
  end if;
  raise notice 'ok - rollback removes the archive and re-runs';
end
$$;

\ir ../../../supabase/migrations/20261030120000_legacy_event_archive.sql
do $$
begin
  if to_regprocedure('public.legacy_report_search(text,text,date)') is null
     or to_regclass('legacy.vol_events') is null then
    raise exception 'migration did not re-apply after the rollback';
  end if;
  raise notice 'ok - migration re-applies after the rollback';
end
$$;
