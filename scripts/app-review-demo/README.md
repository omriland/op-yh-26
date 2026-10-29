# App Review demo account

Scripts that create and remove the account Apple's App Review signs in with. The
account sees demo data only, and nothing it does reaches a real member. The
isolation rules live in the database (migration
`supabase/migrations/20261029120000_app_review_demo_isolation.sql`); the full audit
is in `docs/app-review-demo.md`.

**Do not run against production without Omri's OK.** The migration must be live
first; the scripts check for it and refuse otherwise.

## What it creates

| Item | Value |
|---|---|
| Demo account (signs in) | `app-review-demo@yahpz.com`, "App Review דמו", או״ק `דמו-1`. Responder only, no phone, login OTP off, `must_change_password` off, flagged `profiles.is_app_review_demo` |
| Demo lead (never signs in) | `app-review-demo-lead@yahpz.com`, "אחמ״ש דמו". Banned, no password, flagged, responder role. It is the אחמ״ש of the demo events and the only entry in the demo account's contacts and map |
| Demo events (today, Asia/Jerusalem) | 4127, 4128, 4129. Notes and location say `דמו - App Review`; אוק - כינוי `אביב`, אוק - מס 511/512; שלוחה תל אביב (or the system שלוחה with תחנה "תל אביב" when no such שלוחה exists). 4127 and 4128 wait for the demo account's report, 4129 is already reported |
| Demo shift | Today, morning, demo lead, the demo account assigned |
| Demo vehicle | Plate `00-000-01`, "רכב דמו - App Review", default |
| Demo map pin | מחלף גלילות (a public interchange, not a home), label `דמו - App Review` |

No email, SMS or push is sent: users are created with `auth.admin.createUser`
(`email_confirm: true`), never invited, and the demo account has no phone or push
token.

The password is generated at run time and written only to a file outside the repo
(default `~/.yahpz-secrets/app-review-demo.env`, mode 600; `--target local` uses
`app-review-demo.local.env`). It is never printed. It is set last, after the account is
flagged, so a half-finished run never leaves a usable unflagged login. Re-running
keeps the existing password unless the file is missing or `--rotate-password` is
passed.

## Running

Every run needs `SUPABASE_SERVICE_ROLE_KEY` in the environment (the scripts never
print it). Production also needs both `--confirm-production` and
`APP_REVIEW_DEMO_ALLOW=1`, and only talks to `https://rtvizpsfvtjowbimugns.supabase.co`.
`--target local` only talks to `127.0.0.1` / `localhost`.

```bash
# Look first: read-only, prints the plan
APP_REVIEW_DEMO_ALLOW=1 SUPABASE_SERVICE_ROLE_KEY=… \
  node scripts/app-review-demo/create-app-review-demo.mjs --target production --confirm-production --dry-run

# Create or refresh (idempotent: replaces the demo events and shift, keeps the password)
APP_REVIEW_DEMO_ALLOW=1 SUPABASE_SERVICE_ROLE_KEY=… \
  node scripts/app-review-demo/create-app-review-demo.mjs --target production --confirm-production

# Then copy APP_REVIEW_DEMO_EMAIL / APP_REVIEW_DEMO_PASSWORD from
# ~/.yahpz-secrets/app-review-demo.env into App Store Connect > App Review Information.

# After review: prints the reviewer's feedback, then deletes the demo events, shift,
# uploaded files, feedback, both accounts and the password file
APP_REVIEW_DEMO_ALLOW=1 SUPABASE_SERVICE_ROLE_KEY=… \
  node scripts/app-review-demo/remove-app-review-demo.mjs --target production --confirm-production
```

Both scripts refuse to touch an account with one of the demo emails that is not
flagged as a demo account, and every delete is filtered on `is_demo` or on the two
flagged demo accounts.

## Tests

```bash
npm test                                         # includes lib.test.mjs (gates, plan, dry run)
scripts/app-review-demo/test/run-local-db.sh     # database isolation, no Docker needed
```

`run-local-db.sh` builds a throwaway Postgres 17 cluster (`brew install postgresql@17`),
loads `test/supabase-shim.sql` (roles, `auth.uid()`, storage, inert cron/net/vault
stubs), replays every migration and runs `test/isolation.sql` (59 checks: real users
see real rows, the demo account sees demo rows for every table and RPC, the guards
hold). To use an empty local Supabase database instead (`supabase start` with
`[db.migrations] enabled = false`, because the repo's migrations do not replay in file
order): `DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres scripts/app-review-demo/test/run-local-db.sh`.
