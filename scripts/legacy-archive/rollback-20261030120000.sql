-- Rollback for supabase/migrations/20261030120000_legacy_event_archive.sql.
--
-- Drops the admin RPC, the lookup audit log and the whole legacy schema
-- (archive tables and helper functions). Any archive data loaded into legacy.*
-- is deleted with it; export legacy.report_lookup_audit first if it must be kept.
-- The web keeps working: the archive card's lookups then fail with the generic
-- "שגיאה בטעינת הדוח" message; revert the web commit to hide the card.
-- Before running it, take 20261030120000_legacy_event_archive.sql out of the
-- Deploy Edge Functions workflow, or the next run puts the archive back.
-- Re-runnable.

begin;

drop function if exists public.legacy_report_search(text, text, date);
drop table if exists legacy.report_lookup_audit;
drop schema if exists legacy cascade;

commit;
