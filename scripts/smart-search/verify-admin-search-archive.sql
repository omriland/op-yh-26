-- Verifies supabase/migrations/20261101121000_admin_search_archive.sql against
-- REAL data. Run only with Omri's go-ahead, after the migration:
--
--   supabase db query --linked --project-ref rtvizpsfvtjowbimugns \
--     -f scripts/smart-search/verify-admin-search-archive.sql
--
-- Expected: every row has ok = t.
--
-- Samples (an admin, a non-admin) are picked from real rows as postgres, then
-- every call runs as `authenticated` with that user's JWT claims. The admin
-- calls write legacy.report_lookup_audit rows; the transaction is never
-- committed, so they go when the session ends. `db query --linked` prints
-- only the last statement's rows, so the results SELECT is last and there is
-- no trailing rollback.

begin;

create temp table verify_results (n serial, ok boolean, check_name text) on commit drop;
grant all on verify_results to authenticated;
grant all on sequence verify_results_n_seq to authenticated;

create function pg_temp.ok(p_ok boolean, p_name text) returns void language sql as $$
  insert into verify_results (ok, check_name) values (coalesce(p_ok, false), p_name);
$$;

create function pg_temp.act_as(p_setting text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', current_setting(p_setting), 'role', 'authenticated')::text, true);
$$;

-- Passes when p_sql raises p_state.
create function pg_temp.throws(p_sql text, p_state text, p_name text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    perform pg_temp.ok(sqlstate = p_state, p_name || ' (' || sqlstate || ')');
    return;
  end;
  perform pg_temp.ok(false, p_name || ' (no error)');
end
$$;

-- ---------------------------------------------------------------------------
-- Samples, picked as postgres (no RLS). Empty string when none exists.
-- ---------------------------------------------------------------------------

select set_config('verify.admin', coalesce((
  select ur.user_id::text from public.user_roles ur
  join public.profiles p on p.id = ur.user_id
  where ur.role = 'admin' and not p.is_app_review_demo
  order by ur.user_id limit 1), ''), true);

select set_config('verify.responder', coalesce((
  select p.id::text from public.profiles p
  where not p.is_app_review_demo
    and not exists (select 1 from public.user_roles ur
      where ur.user_id = p.id and ur.role in ('admin', 'super_admin'))
  order by p.id limit 1), ''), true);

select pg_temp.ok(current_setting('verify.admin') <> '', 'sample: an admin exists');
select pg_temp.ok(current_setting('verify.responder') <> '', 'sample: a non-admin exists');

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

select pg_temp.ok(not has_function_privilege('anon', 'public.admin_search_archive(jsonb,int)', 'execute'),
  'grants: anon cannot run admin_search_archive');
select pg_temp.ok(has_function_privilege('authenticated', 'public.admin_search_archive(jsonb,int)', 'execute'),
  'grants: authenticated can run admin_search_archive (the role check is inside)');
select pg_temp.ok(not has_function_privilege('authenticated', 'legacy.archive_event_text(text,text,text,text,text,text,text)', 'execute')
    and not has_function_privilege('authenticated', 'legacy.archive_car_text(text)', 'execute'),
  'grants: authenticated cannot run the prefilter text helpers');

-- ---------------------------------------------------------------------------
-- Non-admin: 42501 (Review Focus 5)
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('verify.responder');
select pg_temp.throws($$select public.admin_search_archive('{"road":"531"}')$$, '42501',
  'non-admin: admin_search_archive raises 42501');
reset role;

-- ---------------------------------------------------------------------------
-- Admin: one call, one audit row
-- ---------------------------------------------------------------------------

select set_config('verify.audit_max', coalesce((select max(id) from legacy.report_lookup_audit), 0)::text, true);

set local role authenticated;
select pg_temp.act_as('verify.admin');
select set_config('verify.result', public.admin_search_archive(
  '{"vehicle_text":"סוזוקי","damaged":true,"date_from":"2026-01-01","date_to":"2026-01-31"}')::text, true);
reset role;

select pg_temp.ok(jsonb_array_length(current_setting('verify.result')::jsonb -> 'rows') > 0
    and (select bool_and(x ->> 'damage' <> '')
      from jsonb_array_elements(current_setting('verify.result')::jsonb -> 'rows') as x),
  'damaged Suzuki in January 2026: '
    || jsonb_array_length(current_setting('verify.result')::jsonb -> 'rows') || ' rows, every damage non-empty');

select pg_temp.ok((
    select count(*) = 1 and bool_and(a.search_kind = 'smart')
      and bool_and(a.result_count = jsonb_array_length(current_setting('verify.result')::jsonb -> 'rows'))
    from legacy.report_lookup_audit a
    where a.id > current_setting('verify.audit_max')::bigint),
  'exactly one new audit row, search_kind smart, with the result count');

select pg_temp.ok(current_setting('verify.result') !~ '\d{9}', 'no value in the result has 9 digits in a row');

-- ---------------------------------------------------------------------------
-- Speed of a dated query: p95 of 20 runs under 1 s.
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('verify.admin');
do $$
declare
  t0 timestamptz;
  ms int[] := '{}';
  p95 int;
begin
  for i in 1..20 loop
    t0 := clock_timestamp();
    perform public.admin_search_archive(
      '{"vehicle_text":"סוזוקי","damaged":true,"date_from":"2026-01-01","date_to":"2026-01-31"}');
    ms := ms || round(extract(epoch from clock_timestamp() - t0) * 1000)::int;
  end loop;
  select percentile_disc(0.95) within group (order by m) into p95 from unnest(ms) as m;
  perform pg_temp.ok(p95 < 1000, 'dated query p95 ' || p95 || ' ms (< 1000)');
end
$$;
reset role;

-- The direct lane sends undated {text} for every plate or number; it took
-- 19 s on the whole archive before the prefilter. Slowest of 5 runs under 1.5 s.
set local role authenticated;
select pg_temp.act_as('verify.admin');
do $$
declare
  t0 timestamptz;
  worst int := 0;
begin
  for i in 1..5 loop
    t0 := clock_timestamp();
    perform public.admin_search_archive('{"text":"531"}');
    worst := greatest(worst, round(extract(epoch from clock_timestamp() - t0) * 1000)::int);
  end loop;
  perform pg_temp.ok(worst < 1500, 'undated text 531, slowest of 5: ' || worst || ' ms (< 1500)');
end
$$;
reset role;

select n, ok, check_name from verify_results order by n;
