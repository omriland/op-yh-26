# Phone OTP (Twilio Verify) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add password-first SMS step-up OTP via Twilio Verify, with two per-user admin toggles (login device 48h trust + משתמשים 20-minute elevation).

**Architecture:** New Edge Function `phone-otp` owns Twilio Verify start/check, flag writes, trust/step-up tables. Client gates login (pre-shell) and AdminUsersPage; device token in `localStorage` (`yahpaz:otp_device`) sent as `x-yahpaz-otp-device`.

**Tech Stack:** Supabase Edge (Deno), Twilio Verify REST API, React + Vitest, Postgres RLS.

**Spec:** `docs/superpowers/specs/2026-08-12-yahpaz-phone-otp-twilio-design.md`

## Global Constraints

- Hebrew-only UI, full RTL; phone fields LTR isolate
- Israeli mobile only: 10 digits starting `05` → E.164 `+972…` (drop leading 0)
- No Supabase Phone MFA add-on; no Netlify Functions for OTP
- Twilio secrets only in Edge env (never `VITE_*`)
- Impersonation: skip OTP / do not SMS target
- Both flags default off

## File map

| Path | Responsibility |
|---|---|
| `supabase/migrations/20260812120000_phone_otp.sql` | Flags, tables, RLS, column guard trigger, phone-change clear |
| `src/lib/phoneE164.ts` (+ `.test.ts`) | `toE164IlMobile`, `isValidIlMobile`, `maskIlMobile`, `hashDeviceToken` helpers used by client (E.164/mask); hash only needed server-side but pure hash helper can stay Edge-local |
| `src/lib/otpDeviceToken.ts` (+ `.test.ts`) | localStorage read/write/clear `yahpaz:otp_device` |
| `src/lib/phoneOtp.ts` (+ `.test.ts` for pure bits) | Client API: `fetchOtpStatus`, `startOtp`, `verifyOtp`, `setOtpFlags` |
| `supabase/functions/phone-otp/index.ts` | Edge actions |
| `src/components/otp/OtpGate.tsx` | Shared OTP UI |
| `src/App.tsx` / auth gate | Login-device OTP after session, before shell |
| `src/pages/AdminUsersPage.tsx` | ⋮ toggles + users-page gate |
| `src/lib/adminUsers.ts` | Select OTP flags; clear trust on phone change via Edge or migration trigger |
| `.cursor/memory/MEMORY.md` | Mark implemented when done |

---

### Task 1: Phone helpers + device token storage

**Files:**
- Create: `src/lib/phoneE164.ts`, `src/lib/phoneE164.test.ts`
- Create: `src/lib/otpDeviceToken.ts`, `src/lib/otpDeviceToken.test.ts`

**Interfaces:**
- Produces:
  - `toE164IlMobile(raw: string | null | undefined): string | null`
  - `isValidIlMobile(raw: string | null | undefined): boolean`
  - `maskIlMobile(raw: string | null | undefined): string | null` → e.g. `050-***-4567`
  - `readOtpDeviceToken(): string | null`
  - `writeOtpDeviceToken(token: string): void`
  - `clearOtpDeviceToken(): void`
  - Storage key constant `OTP_DEVICE_STORAGE_KEY = 'yahpaz:otp_device'`

- [ ] **Step 1: Write failing tests** for E.164 / mask / valid mobile and device token storage (mock `localStorage`).

```ts
// phoneE164.test.ts — expect toE164IlMobile('0501234567') === '+972501234567'
// expect toE164IlMobile('0512345678') === '+972512345678'
// expect toE164IlMobile('0412345678') === null
// expect maskIlMobile('0501234567') === '050-***-4567'
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npm test -- src/lib/phoneE164.test.ts src/lib/otpDeviceToken.test.ts`

- [ ] **Step 3: Implement helpers**

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit** `feat(otp): add IL phone E.164 helpers and device token storage`

---

### Task 2: Migration — flags, trust, step-up, guards

**Files:**
- Create: `supabase/migrations/20260812120000_phone_otp.sql`

**Produces:** schema from spec + trigger blocking client UPDATEs to `otp_login_enabled` / `otp_users_page_enabled` / `otp_flags_updated_*` (unless `auth.role() = 'service_role'`) + trigger on `profiles.phone` UPDATE that deletes from `otp_device_trust` and `otp_step_up` for that user when phone digits change.

- [ ] **Step 1: Write migration SQL** matching spec tables/indexes/RLS (no client policies on trust/step-up).

- [ ] **Step 2: Commit** `feat(otp): add phone OTP schema and flag guards`

---

### Task 3: Edge Function `phone-otp`

**Files:**
- Create: `supabase/functions/phone-otp/index.ts`

**Interfaces (JSON body `action`):**
- `set_otp_flags` — admin; `{ user_id, otp_login_enabled?, otp_users_page_enabled? }`
- `otp_status` — auth user; reads `x-yahpaz-otp-device`; returns `{ loginRequired, usersPageRequired, maskedPhone }`
- `otp_start` — `{ purpose: 'login_device' | 'users_page' }`
- `otp_verify` — `{ purpose, code }` → on login success `{ deviceToken }`

Patterns: mirror `admin-users` CORS/`json`/Bearer/`has_role`. CORS allow-headers must include `x-yahpaz-otp-device`.

Twilio Verify:
- Start: `POST https://verify.twilio.com/v2/Services/{Sid}/Verifications` with `To` + `Channel=sms` (Basic auth AccountSid:AuthToken)
- Check: `.../VerificationCheck` with `To` + `Code`

Cooldown: in-memory Map or DB lookup of last start; reject with Hebrew if < 60s.

Impersonation: if `Authorization` user has active impersonation — Edge cannot see sessionStorage. Spec: client skips calling OTP when `isImpersonating()`; Edge additionally treats `otp_status` as not required always for simplicity on server for flags-off, and client never starts OTP while impersonating. Document: **client is source of truth for skip during impersonation** (Edge has no stash). Optional: pass header `x-yahpaz-impersonating: 1` from client when stash present — Edge then forces `loginRequired/usersPageRequired = false` and denies start/verify. **Do that.**

Phone change clear: handled by DB trigger (Task 2).

- [ ] **Step 1: Implement Edge function**
- [ ] **Step 2: Commit** `feat(otp): add phone-otp Edge Function`

---

### Task 4: Client `phoneOtp` API

**Files:**
- Create: `src/lib/phoneOtp.ts`
- Modify: `src/lib/adminUsers.ts` — select `otp_login_enabled`, `otp_users_page_enabled` on `AdminUserRow`; export `setOtpFlags` wrapper or use `phoneOtp.setOtpFlags`

**Interfaces:**
```ts
export type OtpPurpose = 'login_device' | 'users_page'
export type OtpStatus = {
  loginRequired: boolean
  usersPageRequired: boolean
  maskedPhone: string | null
}
export function fetchOtpStatus(): Promise<OtpStatus | { error: string }>
export function startOtp(purpose: OtpPurpose): Promise<{ ok: true } | { ok: false; error: string }>
export function verifyOtp(purpose: OtpPurpose, code: string): Promise<{ ok: true; deviceToken?: string } | { ok: false; error: string }>
export function setOtpFlags(input: {
  userId: string
  otpLoginEnabled?: boolean
  otpUsersPageEnabled?: boolean
}): Promise<{ ok: true } | { ok: false; error: string }>
```

Invoke with headers: device token + impersonating flag when stash present.

- [ ] **Step 1: Implement client API**
- [ ] **Step 2: Extend `AdminUserRow` + `fetchAdminUsers` select**
- [ ] **Step 3: Commit** `feat(otp): add phoneOtp client API and admin flag fields`

---

### Task 5: Shared `OtpGate` UI

**Files:**
- Create: `src/components/otp/OtpGate.tsx`

Hebrew copy from spec. Props: `maskedPhone`, `onVerified: () => void`, `purpose: OtpPurpose`, optional `onCancel` (users-page can navigate away).

- [ ] **Step 1: Implement OtpGate** (design-system TextField/Button/toast patterns)
- [ ] **Step 2: Commit** `feat(otp): add shared OtpGate component`

---

### Task 6: Login-device gate in App

**Files:**
- Modify: `src/App.tsx` (Gate)
- Possibly thin hook `src/lib/useLoginOtpGate.ts`

After session exists and password-setup cleared: if not impersonating, `fetchOtpStatus()`; if `loginRequired`, render `<OtpGate purpose="login_device" />` instead of shell; on verify store `deviceToken` and continue.

- [ ] **Step 1: Wire gate**
- [ ] **Step 2: Commit** `feat(otp): gate app shell on login device OTP`

---

### Task 7: Admin users ⋮ toggles + users-page gate

**Files:**
- Modify: `src/pages/AdminUsersPage.tsx`

- Two menu items with enable confirm dialog
- On mount / navigate: if not impersonating and `usersPageRequired`, show OtpGate overlay before table
- Disable enable actions when `!isValidIlMobile(user.phone)`

- [ ] **Step 1: Menu toggles + confirms + toasts**
- [ ] **Step 2: Users-page OTP gate**
- [ ] **Step 3: Commit** `feat(otp): admin toggles and users-page OTP gate`

---

### Task 8: MEMORY + verify + smoke notes

- [ ] Update `.cursor/memory/MEMORY.md` — phone OTP implemented; secrets needed
- [ ] `npm test` + `npm run build` + `npm run lint`
- [ ] Commit + push + update PR
- [ ] Document ops: set Edge secrets + create Twilio Verify service (manual for human)

---

## Self-review vs spec

| Spec item | Task |
|---|---|
| Two per-user toggles | 7 |
| Login 48h device trust | 2, 3, 6 |
| Users page 20 min | 2, 3, 7 |
| Twilio Verify | 3 |
| +972 normalization | 1, 3 |
| Impersonation skip | 3, 4, 6, 7 |
| Phone change clears trust | 2 |
| Flag write guard | 2 |
| Hebrew OTP UI | 5 |
| No $75 Phone MFA | architecture |
