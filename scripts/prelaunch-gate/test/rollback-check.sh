#!/bin/bash
# Checks on a throwaway LOCAL Postgres that the pre-launch gate migration is
# re-runnable and that its rollback restores the exact schema. Never connects
# to a hosted database. Needs postgresql@17 (`brew install postgresql@17`).
#
#   scripts/prelaunch-gate/test/rollback-check.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
PG_BIN="${PG_BIN:-/opt/homebrew/opt/postgresql@17/bin}"
PORT="${PORT:-54398}"
MINE=20261029180000_prelaunch_gate.sql
ROLLBACK="$ROOT/scripts/prelaunch-gate/rollback-20261029180000.sql"

WORK="$(mktemp -d "${TMPDIR:-/tmp}/prelaunch-rollback.XXXXXX")"
DATA="$WORK/pg"
trap '"$PG_BIN/pg_ctl" -D "$DATA" -m fast stop >/dev/null 2>&1 || true; rm -rf "$WORK"' EXIT
"$PG_BIN/initdb" -D "$DATA" -U postgres --auth=trust -E UTF8 --locale=C >/dev/null
"$PG_BIN/pg_ctl" -D "$DATA" -o "-p $PORT -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" -l "$WORK/log" -w start >/dev/null
URL="postgresql://postgres@127.0.0.1:$PORT/postgres"
PSQL=("$PG_BIN/psql" "$URL" -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -c 'alter database postgres set search_path = "$user", public, extensions'
PGOPTIONS='-c client_min_messages=error' "${PSQL[@]}" -f "$ROOT/scripts/app-review-demo/test/supabase-shim.sql" >/dev/null

apply() {
  sed -E '/create extension if not exists pg_(cron|net);/d' "$1" \
    | PGOPTIONS='-c client_min_messages=warning' "${PSQL[@]}" -1 >/dev/null
}
# pg_dump 17.6+ writes a random \restrict key per dump.
dump() { "$PG_BIN/pg_dump" -s "$URL" | grep -Ev '^.(un)?restrict ' > "$1"; }
run_test() { "${PSQL[@]}" -f "$1" 2>&1 | grep -E 'checks passed|not ok|ERROR'; }

# Same replay order as run-local-db.sh, without the gate.
LATE=20260819101714_event_media_plates.sql
AFTER=20260819120000_event_media.sql
for f in $(ls "$ROOT/supabase/migrations" | sort); do
  [ "$f" = "$LATE" ] || [ "$f" = "$MINE" ] && continue
  apply "$ROOT/supabase/migrations/$f"
  if [ "$f" = "$AFTER" ]; then apply "$ROOT/supabase/migrations/$LATE"; fi
done
dump "$WORK/before.sql"

apply "$ROOT/supabase/migrations/$MINE"
dump "$WORK/gate-1.sql"
apply "$ROOT/supabase/migrations/$MINE"
dump "$WORK/gate-2.sql"
cmp -s "$WORK/gate-1.sql" "$WORK/gate-2.sql" || { echo "FAIL: a second run changed the schema"; exit 1; }
echo "ok - migration re-runs without changing the schema"
run_test "$ROOT/scripts/prelaunch-gate/test/gate.sql"

"${PSQL[@]}" -f "$ROLLBACK" >/dev/null
dump "$WORK/after-rollback.sql"
cmp -s "$WORK/before.sql" "$WORK/after-rollback.sql" || {
  echo "FAIL: schema after rollback differs"; diff "$WORK/before.sql" "$WORK/after-rollback.sql" | head -40; exit 1;
}
echo "ok - schema after rollback is identical to before the migration"

apply "$ROOT/supabase/migrations/$MINE"
echo "ok - migration applies again after rollback"
run_test "$ROOT/scripts/prelaunch-gate/test/gate.sql"
run_test "$ROOT/scripts/app-review-demo/test/isolation.sql"
