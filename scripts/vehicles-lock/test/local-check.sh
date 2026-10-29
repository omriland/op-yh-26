#!/bin/bash
# LOCAL ONLY. Runs local-check.mjs against a running local `supabase start`
# stack whose DB already has every migration, including
# 20261029200000_vehicles_member_write_error.sql. Refuses any non-local URL.
#
#   ENV_FILE=/tmp/yahpz-vehicles-local/stack.env scripts/vehicles-lock/test/local-check.sh
#
# ENV_FILE is `supabase status -o env` of that stack (API_URL, DB_URL, ANON_KEY,
# SERVICE_ROLE_KEY). The script moves the local launch time to the past for the
# RLS phase and restores it at the end.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
set -a; . "${ENV_FILE:?set ENV_FILE}"; set +a
case "$API_URL|$DB_URL" in
  http://127.0.0.1:*\|postgresql://*@127.0.0.1:*) ;;
  *) echo "Only a local stack (127.0.0.1) is allowed." >&2; exit 1 ;;
esac
export SUPABASE_URL="$API_URL"
PSQL=(psql "$DB_URL" -v ON_ERROR_STOP=1 -q)
LAUNCH_SQL="$(psql "$DB_URL" -Atc "select pg_get_functiondef('public.prelaunch_launch_at'::regproc)")"
restore() { printf '%s\n' "$LAUNCH_SQL" | "${PSQL[@]}"; }
trap restore EXIT
MJS="$HERE/local-check.mjs"

echo "# phase 1: bulk import as admin, during the pre-launch gate (as tomorrow morning)"
node "$MJS" import

echo "# phase 2: after launch (local launch time moved to the past)"
"${PSQL[@]}" -c "create or replace function public.prelaunch_launch_at() returns timestamptz language sql stable as \$\$ select now() - interval '1 day' \$\$"
node "$MJS" rls

echo "# phase 3: rollback restores the old behaviour, then the migration re-applies"
"${PSQL[@]}" -f "$ROOT/scripts/vehicles-lock/rollback-20261029200000.sql"
node "$MJS" rls-rolled-back
"${PSQL[@]}" -1 -f "$ROOT/supabase/migrations/20261029200000_vehicles_member_write_error.sql" 2>/dev/null
node "$MJS" rls

node "$MJS" cleanup
