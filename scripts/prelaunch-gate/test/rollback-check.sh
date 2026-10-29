#!/bin/bash
# Checks on a throwaway LOCAL Postgres that the pre-launch gate migrations
# (20261029180000, 20261029190000) are re-runnable and that each rollback
# restores the exact schema. Never connects
# to a hosted database. Needs postgresql@17 (`brew install postgresql@17`).
#
#   scripts/prelaunch-gate/test/rollback-check.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
PG_BIN="${PG_BIN:-/opt/homebrew/opt/postgresql@17/bin}"
PORT="${PORT:-54398}"
MINE=20261029180000_prelaunch_gate.sql
NATIVE=20261029190000_prelaunch_native_block.sql
ROLLBACK="$ROOT/scripts/prelaunch-gate/rollback-20261029180000.sql"
ROLLBACK_NATIVE="$ROOT/scripts/prelaunch-gate/rollback-20261029190000.sql"

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

# Same replay order as run-local-db.sh, without the two gate migrations.
LATE=20260819101714_event_media_plates.sql
AFTER=20260819120000_event_media.sql
for f in $(ls "$ROOT/supabase/migrations" | sort); do
  [ "$f" = "$LATE" ] || [ "$f" = "$MINE" ] || [ "$f" = "$NATIVE" ] && continue
  apply "$ROOT/supabase/migrations/$f"
  if [ "$f" = "$AFTER" ]; then apply "$ROOT/supabase/migrations/$LATE"; fi
done
dump "$WORK/before.sql"

same() { cmp -s "$1" "$2" || { echo "FAIL: $3"; diff "$1" "$2" | head -40; exit 1; }; echo "ok - $3"; }

# 20261029180000 alone.
apply "$ROOT/supabase/migrations/$MINE"
dump "$WORK/gate-1.sql"
apply "$ROOT/supabase/migrations/$MINE"
dump "$WORK/gate-2.sql"
same "$WORK/gate-1.sql" "$WORK/gate-2.sql" "20261029180000 re-runs without changing the schema"
"${PSQL[@]}" -f "$ROLLBACK" >/dev/null
dump "$WORK/after-rollback.sql"
same "$WORK/before.sql" "$WORK/after-rollback.sql" "rollback-20261029180000 restores the schema from before"

# Then 20261029190000 on top.
apply "$ROOT/supabase/migrations/$MINE"
dump "$WORK/gate-only.sql"
apply "$ROOT/supabase/migrations/$NATIVE"
dump "$WORK/native-1.sql"
apply "$ROOT/supabase/migrations/$MINE"
apply "$ROOT/supabase/migrations/$NATIVE"
dump "$WORK/native-2.sql"
same "$WORK/native-1.sql" "$WORK/native-2.sql" "the workflow order (180000 then 190000) re-runs without changing the schema"
run_test "$ROOT/scripts/prelaunch-gate/test/gate.sql"
"${PSQL[@]}" -f "$ROLLBACK_NATIVE" >/dev/null
dump "$WORK/after-native-rollback.sql"
same "$WORK/gate-only.sql" "$WORK/after-native-rollback.sql" "rollback-20261029190000 restores the schema of 20261029180000 alone"
apply "$ROOT/supabase/migrations/$NATIVE"
"${PSQL[@]}" -f "$ROLLBACK" >/dev/null
dump "$WORK/after-full-rollback.sql"
same "$WORK/before.sql" "$WORK/after-full-rollback.sql" "rollback-20261029180000 after both restores the schema from before"

apply "$ROOT/supabase/migrations/$MINE"
apply "$ROOT/supabase/migrations/$NATIVE"
echo "ok - both migrations apply again after rollback"
run_test "$ROOT/scripts/prelaunch-gate/test/gate.sql"
run_test "$ROOT/scripts/app-review-demo/test/isolation.sql"
