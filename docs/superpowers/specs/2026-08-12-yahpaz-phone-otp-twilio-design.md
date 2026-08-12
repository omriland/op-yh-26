# Phone OTP (Twilio Verify) — design

Date: 2026-08-12  
Status: approved for implementation

## Problem

Some users should prove possession of their Israeli mobile after password login (new/stale browser) and/or before opening **משתמשים**. Email/password alone is not enough for those accounts. Admins must turn each requirement **on/off per user** from the users table ⋮ menu. The SMS path must be operable by agents/ops via **CLI** (no provider that only has a web console).

## Decisions (locked)

| Topic | Choice |
|---|---|
| Auth model | Password first; SMS OTP is **step-up 2FA**, not phone-only login |
| Provider | **Twilio Verify** (SMS channel) |
| Why not Supabase Phone MFA | Advanced MFA Phone add-on ≈ **$75/mo**; still needs custom 48h device trust + users-page step-up |
| Why not local IL gateways | Cheaper per SMS, but **no CLI/MCP** we can operate — rejected |
| Phone numbers | Israeli only; stored as 10 local digits on `profiles.phone`; send as E.164 `+972…` |
| Admin control | **Two separate per-user toggles** via משתמשים ⋮ menu |
| Login device rule | When login OTP on: new browser **or** same browser after **>48h** → OTP |
| Sensitive page | When users-page OTP on: gate **משתמשים** only; elevation **20 minutes** |
| Defaults | Both flags **off** |
| Impersonation | Skip OTP challenges for impersonation sessions; do not SMS the target |

Related: admin users invite (`2026-08-09-yahpaz-admin-users-invite.md`), mobile users card menu (`2026-08-11-mobile-admin-users-card-design.md`), impersonation (`2026-08-11-yahpaz-super-admin-impersonation-design.md`).

## Architecture

```
Password sign-in (existing)
    → Edge: need login OTP for this device? (header x-yahpaz-otp-device)
         no  → app shell
         yes → OTP UI → Twilio Verify start/check
              → write otp_device_trust + return deviceToken
              → client stores localStorage yahpaz:otp_device (48h)
              → app shell

Navigate to משתמשים
    → Edge: need users-page step-up?
         no  → AdminUsersPage
         yes → OTP UI → Twilio Verify start/check
              → write otp_step_up (20 min)
              → AdminUsersPage

Admin ⋮ → set_otp_flags (requires valid phone to enable)
```

Secrets (Supabase Edge only): `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`.

### Why Twilio Verify (not raw Messaging)

- OTP generation, attempt limits, and expiry handled by Twilio
- Ops via **Twilio CLI** (service create, test verifications, logs)
- Cost ballpark IL: **~$0.05 verification + ~$0.26 SMS ≈ $0.30–0.35** per successful OTP; no $75/mo Supabase add-on

## Data model

### `profiles` flags

```sql
alter table public.profiles
  add column otp_login_enabled boolean not null default false,
  add column otp_users_page_enabled boolean not null default false,
  add column otp_flags_updated_at timestamptz,
  add column otp_flags_updated_by uuid references public.profiles (id);
```

- Client/RLS: authenticated users may **read** their own flags (needed for UX gates); **writes only** via Edge `service_role` (`set_otp_flags`).
- Admins already list users via Edge / admin queries — include flags on admin user rows.

### `otp_device_trust`

```sql
create table public.otp_device_trust (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  device_key_hash text not null,
  trusted_until timestamptz not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (user_id, device_key_hash)
);

create index otp_device_trust_user_until_idx
  on public.otp_device_trust (user_id, trusted_until desc);

alter table public.otp_device_trust enable row level security;
-- No policies for authenticated/anon → deny all via API.
-- Edge service_role only.
```

- Raw `device_key` (32+ random bytes, base64url) lives in client `localStorage` (`yahpaz:otp_device`) and is sent as header `x-yahpaz-otp-device`. DB stores **SHA-256 hash** only.
- TTL **48h** from last successful login OTP (`trusted_until`); refresh on each successful login-device verify.
- First-party httpOnly cookie on `yahpz.com` is out of scope for v1 (Supabase Functions host cannot set it); see client flows.

### `otp_step_up`

```sql
create table public.otp_step_up (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  purpose text not null check (purpose in ('users_page')),
  valid_until timestamptz not null,
  created_at timestamptz not null default now()
);

create index otp_step_up_user_purpose_until_idx
  on public.otp_step_up (user_id, purpose, valid_until desc);

alter table public.otp_step_up enable row level security;
-- No client policies; Edge service_role only.
```

- One active grant per user+purpose: on success, insert new row with `valid_until = now() + interval '20 minutes'` (older rows ignored by query `valid_until > now()`).

### Phone → E.164

Existing UI/validation: exactly **10 digits** (`isValidPhone` / `phoneDigits`).

```
0501234567 → +972501234567   // drop leading 0, prefix +972
```

Reject enable / `otp_start` if phone missing, not 10 digits, or not starting with `05` (Israeli mobile). Landlines out of scope.

## Edge API

Prefer a dedicated function `phone-otp` (keeps `admin-users` smaller). Admin flag writes may live on `admin-users` as `set_otp_flags` **or** on `phone-otp` with the same admin check — pick one in implementation; default **`phone-otp` for all OTP actions** including flags.

| Action | Auth | Behavior |
|---|---|---|
| `set_otp_flags` | admin JWT | Set `otp_login_enabled` and/or `otp_users_page_enabled` for `user_id`. Enabling either requires valid mobile phone. Record `otp_flags_updated_*`. |
| `otp_status` | user JWT | Return `{ loginRequired, usersPageRequired, maskedPhone }` given header `x-yahpaz-otp-device` (login trust) / current step-up (users_page). Impersonation → both required false. |
| `otp_start` | user JWT | Body: `{ purpose: 'login_device' \| 'users_page' }`. Check matching flag; normalize phone; Twilio Verify `verifications.create`; enforce cooldown (~60s) per user+purpose. |
| `otp_verify` | user JWT | Body: `{ purpose, code }`. Twilio Verify `verificationChecks.create`. On success: login → upsert trust + return `deviceToken`; users_page → insert step_up. |

### Impersonation

If impersonation stash/session is active (same detection as existing stop-impersonation UX / audit): `otp_status` returns not required; `otp_start`/`otp_verify` for the target are denied or no-ops. Do not send SMS to the impersonated user.

### Phone change

When admin updates a user's phone (existing edit flow): clear that user's `otp_device_trust` and `otp_step_up` rows so the next challenge uses the new number and cannot ride old elevation.

## Client flows

### Login device OTP

1. `signInWithPassword` succeeds.
2. Call `otp_status` with header `x-yahpaz-otp-device` from `localStorage` key `yahpaz:otp_device` (if any).
3. If `loginRequired` → show OTP gate (full-screen, pre-shell).
4. User requests/sends code → `otp_start` → enters 6 digits → `otp_verify`.
5. On success → store returned `deviceToken` in `localStorage` → proceed to app.

**Device token storage (v1):** Browser calls to `*.supabase.co` functions cannot set a first-party httpOnly cookie on `yahpz.com`. Locked approach:

- Edge returns `{ deviceToken }` (high-entropy) on successful `login_device` verify.
- Client stores it in **`localStorage`** (`yahpaz:otp_device`) and sends `x-yahpaz-otp-device` on `otp_status` / related calls.
- DB stores only the SHA-256 hash. XSS risk acknowledged; mitigated by 48h TTL, per-user flag opt-in, and no broader elevation secrets. Same-origin httpOnly proxy is a future hardening item.

### Users-page step-up

1. Before rendering `AdminUsersPage` (or immediately on navigate to `users`), call `otp_status`.
2. If `usersPageRequired` → OTP gate overlay/page; block table/actions.
3. After verify → render page; cache status client-side until near `valid_until` or re-check on focus/navigation.

### Admin ⋮ menu (`AdminUsersPage` / `buildUserMenuItems`)

Two items (desktop row + mobile card):

- **הפעל OTP בכניסה** / **כבה OTP בכניסה**
- **הפעל OTP לניהול משתמשים** / **כבה OTP לניהול משתמשים**

Rules:

- Enable requires valid phone; otherwise item disabled + toast/hint that phone is missing/invalid.
- Confirm dialog on **enable** only.
- Success/error toasts (Hebrew).
- Visible to `admin` (same as other user admin actions).

## UI copy (Hebrew)

OTP gate (shared):

- Title: **אימות ב-SMS**
- Body: **נשלח קוד ל־{masked phone}** (e.g. `050-***-4567` or last 4: `•••4567` — prefer `050-***-4567` style from 10 digits)
- Input label: **קוד אימות**
- Primary: **אימות**
- Secondary: **שלח שוב** (disabled ~60s after send)
- Errors: invalid code / expired / rate limit / send failure — short Hebrew toasts

Confirm enable (example): **להפעיל אימות SMS בכניסה למשתמש זה?**

## Security

- Twilio credentials never in Vite/`VITE_*`.
- Flag writes and Twilio calls only on Edge with admin/user JWT checks.
- Trust/step-up tables: RLS enabled, no authenticated policies.
- Store hashed device keys only.
- Do not log OTP codes; log Twilio SIDs/status at info level.
- Per-user+purpose start cooldown ~60s in Edge (in addition to Twilio).
- Enabling flags without valid mobile is rejected server-side.

## Ops setup (manual / CLI)

1. Twilio account (already exists).
2. Create Verify Service (friendly name `yahpaz-otp`), SMS channel enabled.
3. Set Edge secrets: Account SID, Auth Token, Verify Service SID.
4. Smoke: enable login OTP on a test user → password login → receive SMS → verify → 48h skip; enable users-page OTP → open משתמשים → OTP → 20 min skip.

Twilio CLI examples (ops): create/list Verify services, start/check verification for a +972 number, inspect debugger logs.

## Out of scope (v1)

- WhatsApp / voice channels
- TOTP authenticator apps
- Captcha / SMS-pumping advanced controls beyond Verify + cooldown
- User self-serve toggle
- SMS invites or phone as primary login
- Same-origin httpOnly cookie proxy (noted as future hardening)
- Admin UI for OTP audit history

## Acceptance

1. Both flags default off; no SMS and no extra gates.
2. Admin can enable/disable each flag per user from ⋮; enable blocked without valid IL mobile.
3. Login OTP on → OTP after password on new browser; after success, same browser skips for 48h; after 48h challenges again.
4. Users-page OTP on → OTP when opening משתמשים; after success, no re-challenge for 20 minutes; other admin views (lists, fuel) unaffected.
5. Flags are independent.
6. Impersonation does not trigger SMS / OTP gates.
7. Phone change clears device trust and step-up for that user.
8. UI Hebrew/RTL; phone input LTR isolate on OTP form.
