-- Rollback check for 20261103180000_account_deletion.sql. LOCAL database only:
--   scripts/app-review-demo/test/run-local-db.sh scripts/delete-account/test/rollback.sql
-- Rollback runs twice (re-runnable), then the migration re-applies cleanly.
-- One transaction, rolled back at the end.

\set QUIET on
\o /dev/null
set client_min_messages = warning;
begin;

\ir ../rollback-20261103180000.sql
\ir ../rollback-20261103180000.sql

do $$
begin
  if to_regprocedure('public.delete_user_account(uuid)') is not null then
    raise exception 'rollback left delete_user_account behind';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_id_fkey' and conrelid = 'public.profiles'::regclass) then
    raise exception 'rollback did not restore profiles_id_fkey';
  end if;
  if pg_get_functiondef('public.event_media_not_cancelled'::regproc) like '%deleting_account%'
     or pg_get_functiondef('public.enforce_shift_identity_edit'::regproc) like '%deleting_account%' then
    raise exception 'rollback left the deletion bypass in a guard';
  end if;
end
$$;

\ir ../../../supabase/migrations/20261103180000_account_deletion.sql

do $$
begin
  if to_regprocedure('public.delete_user_account(uuid)') is null
     or exists (select 1 from pg_constraint where conname = 'profiles_id_fkey' and conrelid = 'public.profiles'::regclass) then
    raise exception 'migration did not re-apply after rollback';
  end if;
  raise warning 'rollback check passed (rollback x2, then migration re-applied)';
end
$$;

rollback;
