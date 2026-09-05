# iOS UDID Enrollment + Super-Admin Batch Publish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Volunteers enroll an iPhone UDID from `/ios` via Profile Service; a `super_admin` Approves into a queue; an operator Mac script registers devices, rebuilds the Ad Hoc IPA, publishes to `public/ios/`, and emails only that batch a download link.

**Architecture:** Postgres `ios_devices` + `ios_enroll_tokens` with RLS and security-definer RPCs for mint/approve/reject/retire. Edge Function `ios-enroll` (`--no-verify-jwt`) serves `.mobileconfig` and accepts the device PKCS#7 callback. Web `/ios` becomes an auth-aware state machine; ניהול → מכשירי iOS is `super_admin`-only. `yahpaz-ios/scripts/publish-ios-batch.sh` wraps existing `build-adhoc.sh` + `publish-ios.sh`, adds Apple checklist pause + `send-email` + mark `registered`.

**Tech Stack:** Vite + React 19 + TypeScript + vitest, Supabase Postgres/RLS/RPC + Edge (Deno), Resend via existing `send-email`, zsh + xcodebuild on operator Mac.

**Spec:** `docs/superpowers/specs/2026-09-05-yahpaz-ios-udid-enrollment-approval-design.md`  
**Parent:** `docs/superpowers/specs/2026-09-04-yahpaz-ios-adhoc-selfhosted-distribution-design.md`  
**Depends on:** Plan 1 walking skeleton already shipping IPA from `yahpz.com/ios`.

## Global Constraints

- Hebrew-only product UI, full RTL, רשומה design system — no new colors.
- Bundle `com.yahpz.responder`, team `477WWCHXU7` — never Hive `5GXFELD6MM`.
- Approve / console: **`super_admin` only** (not plain `admin`).
- Do **not** raise `version.json` `minBuild` on batch publish (`publish-ios.sh` already preserves it).
- Email **batch recipients only**.
- No Netlify Functions; enrollment is Supabase Edge only.
- Do not commit certs, API keys, `.mobileprovision`, or service-role keys.
- Do not kill/restart the user's `npm run dev` Vite server.
- Typecheck with `npx tsc -p tsconfig.app.json --noEmit` (root `tsc --noEmit` is a no-op).
- Apple device registration in v1: **checklist pause** (print UDIDs); App Store Connect API is a later upgrade.
- Native iOS app UI stays on hold; only `yahpaz-ios/scripts/` changes for publish.
- Per-user active device cap: **2** (`pending` | `approved` | `registered`).
- Device budget: **100** per `membership_year` (Asia/Jerusalem calendar year at insert).

## File map

| Path | Responsibility |
|---|---|
| `supabase/migrations/20260905120000_ios_devices.sql` | Tables, RLS, RPCs |
| `supabase/functions/_shared/iosEnrollPlist.ts` | PKCS#7 → plist XML + attribute parse (vitest-imported) |
| `supabase/functions/ios-enroll/index.ts` | GET profile / POST callback |
| `src/lib/iosDevices.ts` | Types, budget/UI helpers, Supabase client calls |
| `src/lib/iosDevices.test.ts` | Domain + path helpers |
| `src/lib/iosDownload.ts` | Extend path match for `/ios/enrolled` |
| `src/lib/postLoginPath.ts` | sessionStorage return-to `/ios` after login |
| `src/pages/IosDownloadPage.tsx` | Volunteer state machine |
| `src/pages/IosDevicesAdminPage.tsx` | Super-admin console |
| `src/App.tsx`, `src/lib/appRoute.ts`, shell nav | Route `ios_devices` + wire page |
| `yahpaz-ios/scripts/publish-ios-batch.sh` | Batch publish orchestration |
| `.github/workflows/deploy-edge-functions.yml` | Deploy `ios-enroll` with `--no-verify-jwt` |

---

### Task 1: Pure helpers — paths, budget, volunteer UI state

**Files:**
- Modify: `src/lib/iosDownload.ts`
- Create: `src/lib/iosDevices.ts`
- Create: `src/lib/iosDevices.test.ts`
- Create: `src/lib/postLoginPath.ts`
- Create: `src/lib/postLoginPath.test.ts`
- Modify: `src/lib/iosDownload.test.ts`

**Interfaces:**
- Produces:
  - `IOS_ENROLLED_PATH = '/ios/enrolled'`
  - `isIosDownloadPath(pathname)` true for `/ios` and `/ios/enrolled`
  - `IOS_DEVICE_CAP = 100`, `IOS_DEVICES_PER_USER = 2`
  - `type IosDeviceStatus = 'pending' | 'approved' | 'registered' | 'rejected' | 'retired'`
  - `countBudgetUsed(statuses: IosDeviceStatus[]): number` — count rows in `approved`|`registered`
  - `budgetTone(used: number): 'ok' | 'warn' | 'critical'` — warn ≥80, critical ≥95
  - `canEnrollAnotherDevice(activeCount: number): boolean`
  - `volunteerIosScreen(input): 'need_iphone' | 'need_safari' | 'need_login' | 'enroll' | 'pending' | 'approved' | 'install' | 'rejected'`
  - `POST_LOGIN_PATH_KEY`, `stashPostLoginPath`, `takePostLoginPath`

- [ ] **Step 1: Write failing tests for path + budget + screen state**

```ts
// src/lib/iosDevices.test.ts
import { describe, expect, it } from 'vitest'
import {
  budgetTone,
  canEnrollAnotherDevice,
  countBudgetUsed,
  volunteerIosScreen,
} from './iosDevices'
import { isIosDownloadPath } from './iosDownload'

describe('isIosDownloadPath', () => {
  it('matches enrolled callback path', () => {
    expect(isIosDownloadPath('/ios/enrolled')).toBe(true)
    expect(isIosDownloadPath('/ios/enrolled/')).toBe(true)
  })
})

describe('budget', () => {
  it('counts approved and registered only', () => {
    expect(
      countBudgetUsed(['pending', 'approved', 'registered', 'rejected', 'retired']),
    ).toBe(2)
  })
  it('tones at 80 and 95', () => {
    expect(budgetTone(79)).toBe('ok')
    expect(budgetTone(80)).toBe('warn')
    expect(budgetTone(95)).toBe('critical')
  })
  it('caps enroll at 2 active', () => {
    expect(canEnrollAnotherDevice(1)).toBe(true)
    expect(canEnrollAnotherDevice(2)).toBe(false)
  })
})

describe('volunteerIosScreen', () => {
  it('prioritizes device/browser/login before status', () => {
    expect(
      volunteerIosScreen({
        iphone: false,
        safari: false,
        signedIn: false,
        devices: [],
      }),
    ).toBe('need_iphone')
    expect(
      volunteerIosScreen({
        iphone: true,
        safari: false,
        signedIn: true,
        devices: [],
      }),
    ).toBe('need_safari')
    expect(
      volunteerIosScreen({
        iphone: true,
        safari: true,
        signedIn: false,
        devices: [],
      }),
    ).toBe('need_login')
  })
  it('maps best device status', () => {
    expect(
      volunteerIosScreen({
        iphone: true,
        safari: true,
        signedIn: true,
        devices: [{ status: 'pending' }],
      }),
    ).toBe('pending')
    expect(
      volunteerIosScreen({
        iphone: true,
        safari: true,
        signedIn: true,
        devices: [{ status: 'registered' }],
      }),
    ).toBe('install')
    expect(
      volunteerIosScreen({
        iphone: true,
        safari: true,
        signedIn: true,
        devices: [],
      }),
    ).toBe('enroll')
  })
})
```

```ts
// src/lib/postLoginPath.test.ts
import { describe, expect, it, beforeEach } from 'vitest'
import { POST_LOGIN_PATH_KEY, stashPostLoginPath, takePostLoginPath } from './postLoginPath'

beforeEach(() => sessionStorage.clear())

it('round-trips a safe path', () => {
  stashPostLoginPath('/ios')
  expect(sessionStorage.getItem(POST_LOGIN_PATH_KEY)).toBe('/ios')
  expect(takePostLoginPath()).toBe('/ios')
  expect(takePostLoginPath()).toBeNull()
})

it('rejects open redirects', () => {
  stashPostLoginPath('https://evil.example')
  expect(sessionStorage.getItem(POST_LOGIN_PATH_KEY)).toBeNull()
})
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npx vitest run src/lib/iosDevices.test.ts src/lib/postLoginPath.test.ts src/lib/iosDownload.test.ts`

Expected: FAIL (modules/exports missing).

- [ ] **Step 3: Implement helpers**

Update `isIosDownloadPath` in `iosDownload.ts`:

```ts
export const IOS_ENROLLED_PATH = '/ios/enrolled'

export function isIosDownloadPath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '') || '/'
  return path === IOS_DOWNLOAD_PATH || path === IOS_ENROLLED_PATH
}
```

Create `postLoginPath.ts` — allow only paths starting with `/` that are `/ios` or `/ios/enrolled` (normalize trailing slash). Reject `//`, `http:`, etc.

Create `iosDevices.ts` with the types/helpers from the tests. For `volunteerIosScreen`, pick the “best” status among devices with priority: `registered` > `approved` > `pending` > `rejected` (ignore `retired` for primary CTA; if only retired/empty → `enroll` when under cap).

- [ ] **Step 4: Run tests — expect PASS**

Run: `npx vitest run src/lib/iosDevices.test.ts src/lib/postLoginPath.test.ts src/lib/iosDownload.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/iosDownload.ts src/lib/iosDownload.test.ts src/lib/iosDevices.ts src/lib/iosDevices.test.ts src/lib/postLoginPath.ts src/lib/postLoginPath.test.ts
git commit -m "Add iOS enroll path helpers and volunteer screen state."
```

---

### Task 2: Migration — `ios_devices`, tokens, RPCs, RLS

**Files:**
- Create: `supabase/migrations/20260905120000_ios_devices.sql`

**Interfaces:**
- Produces tables `public.ios_devices`, `public.ios_enroll_tokens`
- RPCs (authenticated unless noted):
  - `mint_ios_enroll_token() → text` — inserts token, 30 min TTL, enforces per-user active cap ≤ 2
  - `ios_device_approve(p_id uuid) → void` — `super_admin` only; blocks when budget used ≥ 100 for that row’s `membership_year`
  - `ios_device_reject(p_id uuid, p_reason text default null) → void`
  - `ios_device_retire(p_id uuid) → void`
- RLS: volunteer SELECT own devices; `super_admin` SELECT all; no direct INSERT/UPDATE/DELETE for `authenticated` on either table (writes via RPC + service role)

- [ ] **Step 1: Write the migration**

```sql
-- ios_devices + enroll tokens (Plan 2 Ad Hoc enrollment)

create type public.ios_device_status as enum (
  'pending', 'approved', 'registered', 'rejected', 'retired'
);

create table public.ios_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  udid text not null,
  device_name text,
  product_type text,
  ios_version text,
  status public.ios_device_status not null default 'pending',
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references public.profiles (id),
  registered_at timestamptz,
  rejected_at timestamptz,
  reject_reason text,
  membership_year int not null,
  constraint ios_devices_udid_unique unique (udid),
  constraint ios_devices_udid_len check (char_length(udid) between 25 and 40),
  constraint ios_devices_reject_reason_len check (
    reject_reason is null or char_length(reject_reason) <= 500
  )
);

create index ios_devices_user_status_idx on public.ios_devices (user_id, status);
create index ios_devices_status_year_idx on public.ios_devices (status, membership_year);

create table public.ios_enroll_tokens (
  token text primary key,
  user_id uuid not null references public.profiles (id),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index ios_enroll_tokens_user_idx on public.ios_enroll_tokens (user_id);

alter table public.ios_devices enable row level security;
alter table public.ios_enroll_tokens enable row level security;

grant select on table public.ios_devices to authenticated;
-- no insert/update/delete grants to authenticated
grant usage on type public.ios_device_status to authenticated;

create policy ios_devices_select on public.ios_devices
for select to authenticated
using (
  user_id = auth.uid()
  or public.has_role(auth.uid(), 'super_admin')
);

-- tokens: no client select (Edge/service only)

create or replace function public.ios_membership_year_now()
returns int
language sql
stable
as $$
  select extract(year from (now() at time zone 'Asia/Jerusalem'))::int;
$$;

create or replace function public.ios_budget_used(p_year int)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.ios_devices
  where membership_year = p_year
    and status in ('approved', 'registered');
$$;

create or replace function public.mint_ios_enroll_token()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  active int;
  tok text;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  select count(*)::int into active
  from public.ios_devices
  where user_id = uid
    and status in ('pending', 'approved', 'registered');
  if active >= 2 then
    raise exception 'ios_device_cap' using errcode = 'P0001';
  end if;
  tok := encode(gen_random_bytes(24), 'hex');
  insert into public.ios_enroll_tokens (token, user_id, expires_at)
  values (tok, uid, now() + interval '30 minutes');
  return tok;
end;
$$;

revoke all on function public.mint_ios_enroll_token() from public;
grant execute on function public.mint_ios_enroll_token() to authenticated;

create or replace function public.ios_device_approve(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  row public.ios_devices%rowtype;
  used int;
begin
  if uid is null or not public.has_role(uid, 'super_admin') then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  select * into row from public.ios_devices where id = p_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if row.status is distinct from 'pending' then
    raise exception 'invalid_status' using errcode = 'P0001';
  end if;
  used := public.ios_budget_used(row.membership_year);
  if used >= 100 then
    raise exception 'ios_budget_full' using errcode = 'P0001';
  end if;
  update public.ios_devices
  set status = 'approved',
      approved_at = now(),
      approved_by = uid
  where id = p_id;
end;
$$;

create or replace function public.ios_device_reject(p_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null or not public.has_role(uid, 'super_admin') then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  update public.ios_devices
  set status = 'rejected',
      rejected_at = now(),
      reject_reason = nullif(btrim(p_reason), '')
  where id = p_id
    and status = 'pending';
  if not found then
    raise exception 'not_found_or_invalid' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.ios_device_retire(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null or not public.has_role(uid, 'super_admin') then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  update public.ios_devices
  set status = 'retired'
  where id = p_id
    and status in ('approved', 'registered');
  if not found then
    raise exception 'not_found_or_invalid' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.ios_device_approve(uuid) from public;
revoke all on function public.ios_device_reject(uuid, text) from public;
revoke all on function public.ios_device_retire(uuid) from public;
grant execute on function public.ios_device_approve(uuid) to authenticated;
grant execute on function public.ios_device_reject(uuid, text) to authenticated;
grant execute on function public.ios_device_retire(uuid) to authenticated;
```

Tighten `UPDATE` in reject so `IF NOT FOUND` works (use `GET DIAGNOSTICS` or `RETURNING` — fix if needed when applying). Prefer:

```sql
  with updated as (
    update public.ios_devices
    set ...
    where id = p_id and status = 'pending'
    returning id
  )
  select count(*) into ... from updated;
```

- [ ] **Step 2: Apply migration to the remote project** (operator with Supabase access)

Run via MCP `apply_migration` or `supabase db push` against `rtvizpsfvtjowbimugns`. Do not invent a workaround if apply fails — report and stop.

- [ ] **Step 3: Smoke RPCs as seed admin** (optional SQL)

Confirm `mint_ios_enroll_token` fails when anonymous; succeeds when authenticated under cap.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260905120000_ios_devices.sql
git commit -m "Add ios_devices schema and super-admin enroll RPCs."
```

---

### Task 3: Edge `ios-enroll` + shared plist extract

**Files:**
- Create: `supabase/functions/_shared/iosEnrollPlist.ts`
- Create: `src/lib/iosEnrollPlist.test.ts` (imports shared module like `inviteTtl.test.ts`)
- Create: `supabase/functions/ios-enroll/index.ts`
- Modify: `.github/workflows/deploy-edge-functions.yml`

**Interfaces:**
- Produces:
  - `extractPlistXmlFromPkcs7Body(body: string): string | null`
  - `parseEnrollAttributes(plistXml: string): { udid, product, version, deviceName } | null`
  - Edge routes:
    - `GET /ios-enroll?path=profile&token=` OR path-style if platform allows — **use query `?op=profile|callback`** on a single function URL to avoid path routing ambiguity: `GET ?op=profile&token=`, `POST ?op=callback&token=`
  - Env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `IOS_ENROLL_PUBLIC_BASE` default `https://yahpz.com` for redirect; profile callback URL = `${SUPABASE_URL}/functions/v1/ios-enroll?op=callback&token=`

- [ ] **Step 1: Failing vitest for plist extract**

Use a tiny fixture string containing embedded `<?xml version="1.0"…</plist>` with keys `UDID`, `PRODUCT`, `VERSION`, `DEVICE_NAME` (dict/string pairs as Apple sends). Assert parse returns those fields. Assert extract returns null when no plist span.

- [ ] **Step 2: Implement `_shared/iosEnrollPlist.ts` + tests PASS**

Algorithm (accepted trade-off from spec): find first `<?xml`, then last `</plist>`, slice; parse with a minimal regex/key walker for `<key>UDID</key>\s*<string>([^<]+)</string>` etc. Do not pull in a full plist library.

- [ ] **Step 3: Implement `ios-enroll/index.ts`**

Behavior sketch:

```ts
// GET op=profile&token=
//  - service client: load token row where consumed_at is null and expires_at > now()
//  - return application/x-apple-aspen-config body:
//    PayloadType = Profile Service; PayloadContent URL = callback with token;
//    attributes UDID, PRODUCT, VERSION, DEVICE_NAME
// POST op=callback&token=
//  - read raw body text; extract+parse
//  - if token invalid → 302 https://yahpz.com/ios?enroll=error
//  - if udid exists for other user → 302 …?enroll=dup
//  - enforce per-user active cap
//  - upsert/insert ios_devices pending with membership_year = ios_membership_year_now()
//  - set consumed_at
//  - 302 https://yahpz.com/ios/enrolled
```

CORS: use shared `buildCorsHeaders` / `runWithCors` for browser mint is **not** on this function — mint is RPC. Device POST has no Origin; still handle OPTIONS if needed. Prefer **no CORS requirement** for Apple’s POST.

Unsigned `.mobileconfig` XML example structure — follow Apple Profile Service docs (`PayloadType` = `Profile Service`, `URL`, `DeviceAttributes` array).

- [ ] **Step 4: Wire deploy workflow**

Add to the `--no-verify-jwt` loop alongside `partner-auth`:

```bash
for fn in partner-auth responder-api ios-enroll; do
```

- [ ] **Step 5: Deploy** when `SUPABASE_ACCESS_TOKEN` is available; otherwise note manual deploy required (same as other Edge gaps).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/iosEnrollPlist.ts supabase/functions/ios-enroll/index.ts src/lib/iosEnrollPlist.test.ts .github/workflows/deploy-edge-functions.yml
git commit -m "Add ios-enroll Edge Function for Profile Service UDID capture."
```

---

### Task 4: Client API `iosDevices.ts` data layer

**Files:**
- Modify: `src/lib/iosDevices.ts` (add async API)
- Modify: `src/lib/iosDevices.test.ts` (Hebrew error map unit tests only — no live DB)

**Interfaces:**
- Produces:
  - `listMyIosDevices(): Promise<IosDevice[]>`
  - `listAllIosDevices(): Promise<IosDeviceAdminRow[]>` — relies on RLS (`super_admin` sees all); join profile name/callsign via `profiles` select
  - `mintIosEnrollProfileUrl(): Promise<{ ok: true; url: string } | { ok: false; error: string }>` — RPC then `${VITE_SUPABASE_URL}/functions/v1/ios-enroll?op=profile&token=`
  - `approveIosDevice(id)`, `rejectIosDevice(id)`, `retireIosDevice(id)` → `{ ok, error? }`
  - Map Postgres exceptions `ios_device_cap` / `ios_budget_full` / `forbidden` to Hebrew strings

- [ ] **Step 1: Extend types + API functions** using `supabase` from `src/lib/supabase.ts` (same pattern as `userFeedback.ts`).

Profile URL must use the project functions base from env — never hardcode the anon key into the `.mobileconfig` link; Apple fetches without Authorization. Token alone authenticates.

- [ ] **Step 2: Unit-test error mapper**

```ts
expect(iosDevicesErrorMessage('ios_budget_full')).toBe('הגעתם למכסת 100 המכשירים לשנה זו.')
expect(iosDevicesErrorMessage('ios_device_cap')).toBe('ניתן לרשום עד שני מכשירים למשתמש.')
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/iosDevices.ts src/lib/iosDevices.test.ts
git commit -m "Add ios_devices client API for enroll and approval."
```

---

### Task 5: `/ios` volunteer state machine + post-login return

**Files:**
- Modify: `src/pages/IosDownloadPage.tsx`
- Modify: `src/App.tsx` (pass session / onRequestLogin; consume `takePostLoginPath`)
- Modify: CSS module or existing `ios-download` styles if needed (reuse tokens)

**Interfaces:**
- Consumes: helpers from Tasks 1+4, `useAuth` / props for `signedIn`, `onRequestLogin`
- Produces: Hebrew UI for each `volunteerIosScreen` state; enroll CTA opens profile URL (`window.location` or `<a href>` to functions URL so Safari downloads `.mobileconfig`)

- [ ] **Step 1: Update `IosDownloadPage`**

Props:

```ts
type Props = {
  onBack: () => void
  signedIn: boolean
  onRequestLogin: () => void
  justEnrolled?: boolean // true when path is /ios/enrolled
}
```

Flow:
1. Compute `iphone` / `safari` from UA (existing).
2. If signed in, `listMyIosDevices()` on mount.
3. `screen = volunteerIosScreen(...)`.
4. Copy (Hebrew):
   - `need_login` → «יש להתחבר כדי לרשום את המכשיר» + button → `stashPostLoginPath('/ios'); onRequestLogin()`
   - `enroll` → guide including **הפרופיל יופיע כ־«לא מאומת»** + CTA «רישום מכשיר»
   - `pending` / `approved` / `rejected` / `install` per spec
5. Keep install `itms-services` button only for `install` screen.
6. List multiple devices with status labels when `devices.length > 1`.

- [ ] **Step 2: Wire App**

When rendering ios legal page, pass `signedIn={Boolean(session)}` and `onRequestLogin` that stashes path then `setLegalPage(null)` so LoginPage appears.

After `session` becomes available, if `takePostLoginPath()` is `/ios` or `/ios/enrolled`, call `setLegalPage('ios')` and `history.replace` to that path.

Detect enrolled: `isIosDownloadPath` already true; pass `justEnrolled={normalize(path)==='/ios/enrolled'}`.

- [ ] **Step 3: Manual check on localhost** — signed-out `/ios` shows login CTA; do not kill Vite.

- [ ] **Step 4: Typecheck + vitest slice**

Run: `npx tsc -p tsconfig.app.json --noEmit && npx vitest run src/lib/iosDevices.test.ts src/lib/iosDownload.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/pages/IosDownloadPage.tsx src/App.tsx
git commit -m "Gate /ios enroll behind login and Profile Service CTA."
```

---

### Task 6: Super-admin console `מכשירי iOS`

**Files:**
- Create: `src/pages/IosDevicesAdminPage.tsx`
- Modify: `src/lib/appRoute.ts` — add view `ios_devices` slug `ios-devices`
- Modify: `src/App.tsx` — nav child under סופר־אדמין; render page when `isSuperAdmin`
- Modify: `src/components/shell/AppShell.tsx` — `NAV_ICONS.ios_devices` (e.g. `Smartphone` from lucide)
- Modify: `src/lib/appRoute.test.ts`, `src/lib/mobileNav.test.ts` as needed
- Modify: `src/lib/posthogAppPath.ts` if view list is exhaustive

**Interfaces:**
- Consumes: `listAllIosDevices`, approve/reject/retire, `countBudgetUsed`, `budgetTone`
- Produces: segments ממתינים / מאושרים / רשומים / נדחו־הוצאו; budget header `X / 100`

- [ ] **Step 1: Extend routing**

Add `'ios_devices'` to `AppRouteView`, slug map, `isAllowedAppView` (same as feedback → `isSuperAdmin`), `alsoCurrentFor` on super_admin menu.

- [ ] **Step 2: Build page** following `FeedbackInboxPage` patterns (filters, EmptyState, toast on action, desktop table / mobile cards).

Approve button calls `approveIosDevice`; on `ios_budget_full` show the mapped Hebrew error.

Approved segment shows count caption: `N ממתינים לפרסום` (operator cue to run Mac script). **No** “סמן כרשום” control.

- [ ] **Step 3: Tests for `isAllowedAppView` + path slug**

- [ ] **Step 4: Typecheck + vitest**

Run: `npx tsc -p tsconfig.app.json --noEmit && npx vitest run src/lib/appRoute.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/pages/IosDevicesAdminPage.tsx src/lib/appRoute.ts src/lib/appRoute.test.ts src/App.tsx src/components/shell/AppShell.tsx src/lib/mobileNav.test.ts src/lib/posthogAppPath.ts src/lib/posthogAppPath.test.ts
git commit -m "Add super-admin iOS devices approval console."
```

---

### Task 7: Mac `publish-ios-batch.sh`

**Files:**
- Create: `/Users/omrilandman/CursorProjects/today-i/yahpaz-ios/scripts/publish-ios-batch.sh`
- Optional readme note in `yahpaz-ios/README.md` (only if a distribution section already exists — do not invent a long doc)

**Interfaces:**
- Consumes: env `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (required); optional `YAHPAZ_WEB`; existing `build-adhoc.sh`, `publish-ios.sh`
- Produces: published IPA; emails; DB rows → `registered`

- [ ] **Step 1: Write script**

```zsh
#!/bin/zsh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# 1. Require SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
# 2. GET approved rows via REST:
#    curl -s "$SUPABASE_URL/rest/v1/ios_devices?status=eq.approved&select=id,udid,user_id,device_name"
#    with headers apikey + Authorization: Bearer service role
# 3. If empty → exit 0 with message
# 4. Print UDIDs newline-delimited; prompt "Register these in Apple Developer, then press Enter"
# 5. "$ROOT/scripts/build-adhoc.sh"
# 6. Verify each batch UDID appears in embedded.mobileprovision ProvisionedDevices
#    (reuse security cms -D + PlistBuddy / plutil); missing → exit 1 BEFORE publish
# 7. "$ROOT/scripts/publish-ios.sh"
# 8. For each distinct user_id: POST send-email
#      subject: האפליקציה מוכנה להתקנה באייפון
#      html: short Hebrew + CTA https://yahpz.com/ios
#      idempotency_key: ios-ready-<device-id>-<latestBuild>
#    Collect failures; do not abort mark-registered
# 9. PATCH each device id: status=registered, registered_at=now()
# 10. Print email failures for manual resend
```

Use `Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY` for REST and functions.

Email invoke:

```bash
curl -sS -X POST "$SUPABASE_URL/functions/v1/send-email" \
  -H "Authorization: Bearer $SERVICE" \
  -H "apikey: $SERVICE" \
  -H "Content-Type: application/json" \
  -d "{\"user_id\":\"$UID\",\"subject\":\"...\",\"html\":\"...\",\"idempotency_key\":\"...\"}"
```

- [ ] **Step 2: `chmod +x` the script**

- [ ] **Step 3: Dry-run documentation** — script echoes steps; first real run is manual after Approve of a pilot device.

- [ ] **Step 4: Commit in yahpaz-ios repo**

```bash
cd /Users/omrilandman/CursorProjects/today-i/yahpaz-ios
git add scripts/publish-ios-batch.sh
git commit -m "Add publish-ios-batch.sh for approved UDID rebuild and email."
```

---

### Task 8: Spec status, memory, end-to-end checklist

**Files:**
- Modify: `docs/superpowers/specs/2026-09-05-yahpaz-ios-udid-enrollment-approval-design.md` — Status: Approved / Implementing
- Modify: `.cursor/memory/MEMORY.md` — Plan 2 implementing note (if writable)

- [ ] **Step 1: Manual E2E checklist** (do not claim done until checked)

1. Safari iPhone, signed-in volunteer → רישום מכשיר → install unsigned profile → lands `/ios/enrolled` → status pending in DB  
2. Super-admin console → Approve → status approved; budget increments  
3. Mac: `publish-ios-batch.sh` → portal paste → build → publish → email received  
4. Volunteer `/ios` → התקנת האפליקציה works  
5. Plain `admin` (no super_admin) cannot open `/ios-devices`  
6. Third device enroll blocked with cap message  

- [ ] **Step 2: Commit doc/memory touch in op-yh-26 if changed**

---

## Spec coverage self-review

| Spec requirement | Task |
|---|---|
| Profile Service enroll | 3, 5 |
| `ios_devices` statuses + budget + cap 2 | 1, 2 |
| `super_admin` Approve / Reject / Retire | 2, 4, 6 |
| No web “mark registered” | 6, 7 |
| Semi-auto Mac batch + checklist | 7 |
| Email batch only; no minBuild bump | 7 (+ existing publish-ios.sh) |
| `/ios` state machine + Not Verified copy | 5 |
| Edge `--no-verify-jwt` deploy | 3 |
| Unsigned mobileconfig accepted risk | 3, 5 |

**Open questions left for ops (not blockers):** membership renewal date display; Apple API registration later.

**Placeholders:** none intentional — Apple API deferred by locked decision (checklist).
