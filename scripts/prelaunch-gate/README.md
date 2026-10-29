# Pre-launch gate (until 1.11 00:01)

Until **2026-11-01 00:01 Asia/Jerusalem** (`2026-10-31T22:01:00Z`) every member who is
not an admin or super admin can accept an invite, set a password and sign in, but then
sees only "המערכת תעלה לאוויר ב-1.11" and a logout button. The App Review demo account
(`profiles.is_app_review_demo`) is exempt. Shift leads (אחמ״ש) are gated.

The gate lifts by itself at launch on the **database clock**. Nothing needs to be
deployed or removed at launch.

| Layer | Where | What it does |
|---|---|---|
| Launch instant | `public.prelaunch_launch_at()` and `PRELAUNCH_LAUNCH_AT` in `src/lib/prelaunch.ts` | One value. `prelaunch.test.ts` fails if the two disagree |
| Database | `supabase/migrations/20261029180000_prelaunch_gate.sql` | A restrictive policy on every RLS table and on `storage.objects`. A gated member keeps their own `profiles` row (read and write), `user_roles` (read), `device_tokens` and `ios_devices`. `list_unit_contacts`, `list_unit_map_pins` and `list_shift_lead_profiles` return nothing to them. This is what holds the native iOS and Android apps |
| Edge functions | `supabase/functions/_shared/prelaunch.ts` | `responder-fill` (fill-link load/save) and `responder-api` (partner bots) answer 403 with the gate text. Fails open if the check is missing |
| Web | `src/lib/prelaunch.ts`, `src/lib/usePrelaunchGate.ts`, `src/pages/PrelaunchGatePage.tsx` | After the password step and the OTP step, before every route. Uses the server clock from `prelaunch_gate()` and falls back to the client clock only when the server cannot be reached. Opens without a reload 5 s after launch |

To exempt shift leads as well, add `'shift_lead'` in `public.is_prelaunch_exempt` and in
`EXEMPT_ROLES` in `src/lib/prelaunch.ts`.

## Tests

```bash
npm test                                                   # src/lib/prelaunch.test.ts among others
scripts/app-review-demo/test/run-local-db.sh scripts/prelaunch-gate/test/gate.sql
scripts/prelaunch-gate/test/rollback-check.sh              # re-run + rollback restore the exact schema
```

`gate.sql` sets `prelaunch_launch_at()` to the future and then to the past inside its
transaction, so the results do not depend on today's date.

Dev only: open the local app with `?prelaunch_now=2026-10-31T21:59:00Z` to make the web
gate act as if that were the time. Production builds drop it, and the database keeps
its own clock.

## Rollback

`scripts/prelaunch-gate/rollback-20261029180000.sql`. First take the migration out of the
Deploy Edge Functions workflow, or its next run applies it again. The rollback alone
removes the gate everywhere: the web and the edge functions treat a missing RPC as "no
gate".
