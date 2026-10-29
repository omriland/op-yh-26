#!/bin/bash
# Replays supabase/migrations into a throwaway LOCAL Postgres and runs the
# App Review demo isolation test. Never connects to a hosted database.
#
#   scripts/app-review-demo/test/run-local-db.sh            # Homebrew Postgres, temp cluster
#   DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
#     scripts/app-review-demo/test/run-local-db.sh          # a running `supabase start` stack
#   scripts/app-review-demo/test/run-local-db.sh a.sql b.sql   # run these test files instead
#
# Needs postgresql@17 (`brew install postgresql@17`) for the first form.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
HERE="$ROOT/scripts/app-review-demo/test"
PG_BIN="${PG_BIN:-/opt/homebrew/opt/postgresql@17/bin}"

case "${DB_URL:-}" in
  ""|*@127.0.0.1:*|*@localhost:*) ;;
  *) echo "DB_URL must point at 127.0.0.1 or localhost." >&2; exit 1 ;;
esac

if [ -z "${DB_URL:-}" ]; then
  PORT="${PORT:-54399}"
  DATA="$(mktemp -d "${TMPDIR:-/tmp}/app-review-demo-pg.XXXXXX")"
  trap '"$PG_BIN/pg_ctl" -D "$DATA" -m fast stop >/dev/null 2>&1 || true; rm -rf "$DATA"' EXIT
  "$PG_BIN/initdb" -D "$DATA" -U postgres --auth=trust -E UTF8 --locale=C >/dev/null
  "$PG_BIN/pg_ctl" -D "$DATA" -o "-p $PORT -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" -l "$DATA/log" -w start >/dev/null
  DB_URL="postgresql://postgres@127.0.0.1:$PORT/postgres"
  PSQL=("$PG_BIN/psql" "$DB_URL" -v ON_ERROR_STOP=1 -q)
  "${PSQL[@]}" -c 'alter database postgres set search_path = "$user", public, extensions'
  PGOPTIONS='-c client_min_messages=error' "${PSQL[@]}" -f "$HERE/supabase-shim.sql" >/dev/null
  # pg_cron and pg_net are stubbed by the shim.
  STRIP='/create extension if not exists pg_(cron|net);/d'
else
  PSQL=("${PG_BIN}/psql" "$DB_URL" -v ON_ERROR_STOP=1 -q)
  STRIP=''
fi

# The repo's file order does not replay from scratch: event_media_plates
# references event_media, which a later file creates.
LATE=20260819101714_event_media_plates.sql
AFTER=20260819120000_event_media.sql
apply() {
  sed -E "$STRIP" "$ROOT/supabase/migrations/$1" \
    | PGOPTIONS='-c client_min_messages=warning' "${PSQL[@]}" -1 >/dev/null
}
if [ -z "${SKIP_MIGRATIONS:-}" ]; then
  count=0
  for f in $(ls "$ROOT/supabase/migrations" | sort); do
    [ "$f" = "$LATE" ] && continue
    apply "$f"; count=$((count + 1))
    if [ "$f" = "$AFTER" ]; then apply "$LATE"; count=$((count + 1)); fi
  done
  echo "Applied $count migrations."
fi

for test in "${@:-$HERE/isolation.sql}"; do
  "${PSQL[@]}" -f "$test"
done
