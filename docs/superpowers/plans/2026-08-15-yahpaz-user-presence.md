# User Presence on משתמשים Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) or superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a green/orange presence disc next to each user on משתמשים from a last-action timestamp, without touching `profiles` or existing user flows.

**Architecture:** Isolated `user_presence` table + `touch_last_active()` / `admin_list_last_active()` RPCs. Client heartbeat (throttled, skip impersonation/hidden) writes own row. Users page reads via a separate RPC and polls every 60s. Pure helpers decide disc status.

**Tech Stack:** Supabase Postgres RPC, Vite + React + TS, Vitest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-15-yahpaz-user-presence-design.md`
- Hebrew UI only: `פעיל עכשיו` / `פעיל לאחרונה`
- Green `--status-done` ≤ 3 min; orange `--status-partial` ≤ 15 min; else nothing
- Never `UPDATE profiles`; never toast on presence failure; never blank the users list
- No heartbeat while impersonating, on login/OTP/password gates, or fill-by-link without session
- Preserve unrelated in-progress `AdminUsersPage` email-validation edits
- Do not commit unless the user asks

## File map

| File | Responsibility |
|---|---|
| `src/lib/userPresence.ts` | Thresholds, `presenceFromLastActive`, `mergeLastActive`, heartbeat helper, RPC wrappers |
| `src/lib/userPresence.test.ts` | Unit tests for status, merge, throttle |
| `supabase/migrations/<timestamp>_user_presence.sql` | Table + RPCs + RLS (no policies) + grants |
| `src/lib/adminUsers.ts` | `last_active_at` on row; isolated presence fetch |
| `src/components/admin/UserPresenceDot.tsx` | Disc + visually-hidden label |
| `src/styles/components.css` | `.user-presence` |
| `src/pages/AdminUsersPage.tsx` | Disc in name/identity; 60s poll |
| `src/lib/usePresenceHeartbeat.ts` | Hook wrapping helper |
| `src/App.tsx` | Enable hook only when main shell is up |
| `design-system-design-instructions/screens/admin.md` | List presence disc |
| `.cursor/memory/MEMORY.md` | One-line fact |

---

### Task 1: Presence status + merge helpers (TDD)

**Files:**
- Create: `src/lib/userPresence.ts`
- Create: `src/lib/userPresence.test.ts`

**Interfaces:**
- Produces:
  - `PRESENCE_NOW_MS = 3 * 60 * 1000`
  - `PRESENCE_RECENT_MS = 15 * 60 * 1000`
  - `PRESENCE_TOUCH_THROTTLE_MS = 60 * 1000`
  - `PresenceStatus = 'now' | 'recent'`
  - `presenceFromLastActive(lastActiveAt, nowMs, { active, invite_pending }): PresenceStatus | null`
  - `mergeLastActive(rows, presenceRows): rows with last_active_at`

- [ ] **Step 1: Write failing tests** in `src/lib/userPresence.test.ts` covering:
  - 0s, 2m59s, 3m00s → `now`
  - 3m01s, 14m59s, 15m00s → `recent`
  - 15m01s → `null`
  - `null` / unparsable timestamp → `null`
  - future timestamp → `now`
  - `invite_pending` / `active: false` → `null` even if fresh
  - `mergeLastActive`: missing → null; match copied; extra ids ignored; order unchanged

- [ ] **Step 2: Run** `npx vitest run src/lib/userPresence.test.ts` — expect FAIL (module missing)

- [ ] **Step 3: Implement** `presenceFromLastActive` + `mergeLastActive` only

- [ ] **Step 4: Re-run tests** — expect PASS

---

### Task 2: Heartbeat throttle helper (TDD)

**Files:**
- Modify: `src/lib/userPresence.ts`
- Modify: `src/lib/userPresence.test.ts`

**Interfaces:**
- Produces:
  - `shouldTouchPresence({ impersonating, hidden, nowMs, lastTouchAtMs, inFlight, throttleMs? }): 'touch' | 'skip'`
  - `createPresenceHeartbeat(opts): { stop(): void }`
    - opts: `isImpersonating`, `isDocumentHidden`, `now`, `touch`, `addEventListener`, `removeEventListener`, optional `throttleMs`

- [ ] **Step 1: Write failing tests**
  - skip when impersonating / hidden / in-flight / inside 60s
  - touch when elapsed ≥ 60s
  - `createPresenceHeartbeat`: pointerdown calls `touch`; second pointerdown inside 60s does not; `visibilitychange` while visible calls `touch`; `touch` rejection does not throw; `stop()` removes listeners

- [ ] **Step 2: Run tests** — expect FAIL

- [ ] **Step 3: Implement** `shouldTouchPresence` + `createPresenceHeartbeat`
  - window events: `pointerdown`, `keydown` (capture)
  - `visibilitychange` on the target the test harness registers (implementation maps it to `document` in the hook)
  - on failure, do not set `lastTouchAtMs`

- [ ] **Step 4: Re-run** — expect PASS

---

### Task 3: Migration + RPCs

**Files:**
- Create via `npx supabase migration new user_presence`

**SQL (verbatim):**

```sql
create table public.user_presence (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  last_active_at timestamptz not null
);

alter table public.user_presence enable row level security;

create or replace function public.touch_last_active()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active is true
  ) then
    return;
  end if;
  insert into public.user_presence (user_id, last_active_at)
  values (auth.uid(), now())
  on conflict (user_id) do update
    set last_active_at = excluded.last_active_at;
end;
$$;

revoke all on function public.touch_last_active() from public;
grant execute on function public.touch_last_active() to authenticated;

create or replace function public.admin_list_last_active()
returns table (user_id uuid, last_active_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select up.user_id, up.last_active_at
  from public.user_presence up
  where public.has_role(auth.uid(), 'admin');
$$;

revoke all on function public.admin_list_last_active() from public;
grant execute on function public.admin_list_last_active() to authenticated;
```

- [ ] **Step 1:** `npx supabase migration new user_presence` then write the SQL
- [ ] **Step 2:** Apply to project `rtvizpsfvtjowbimugns` via Supabase MCP `apply_migration` (or CLI if that is how this repo applies)
- [ ] **Step 3:** Verify with SQL: table exists, RLS on, no policies, both functions granted to `authenticated`

---

### Task 4: Admin fetch + poll wiring

**Files:**
- Modify: `src/lib/userPresence.ts` (add `fetchAdminLastActive`, `touchLastActive`)
- Modify: `src/lib/adminUsers.ts`
- Modify: `src/pages/AdminUsersPage.tsx`

**Interfaces:**
- `fetchAdminLastActive(): Promise<{ user_id: string; last_active_at: string }[]>` — on error return `[]` without throwing
- `touchLastActive(): Promise<void>` — throw if supabase `error` so heartbeat does not throttle on failure
- `AdminUserRow.last_active_at: string | null`
- `fetchAdminUsers` loads presence in a **separate** await after the existing Promise.all; merge via `mergeLastActive`; presence error → all null, list still returns

- [ ] **Step 1:** Add RPC wrappers; extend `AdminUserRow` + `fetchAdminUsers`
- [ ] **Step 2:** On `AdminUsersPage`, after users have loaded, poll `fetchAdminLastActive` every 60s and on `visibilitychange` → visible. `setUsers(current => current ? mergeLastActive(current, rows) : current)`. Do **not** set `users` to `null`. Do not depend the interval on the users array identity (use `users !== null` / `reloadKey` only). Preserve existing email-validation draft changes.

---

### Task 5: UI disc + app heartbeat

**Files:**
- Create: `src/components/admin/UserPresenceDot.tsx`
- Create: `src/lib/usePresenceHeartbeat.ts`
- Modify: `src/styles/components.css`
- Modify: `src/pages/AdminUsersPage.tsx`
- Modify: `src/App.tsx`

**UI:**
- `UserPresenceDot({ status: PresenceStatus })` — disc `aria-hidden`, `title` + `.visually-hidden` with Hebrew label
- CSS: `.user-presence` inline-flex, `flex-shrink: 0`, gap handled by parent `--space-2`; disc `width/height: var(--space-2)`, `border-radius: var(--radius-full)`; `--now` uses `--status-done`; `--recent` uses `--status-partial`
- Desktop `שם מלא` cell: wrap disc + name in `inline-flex` `align-items: center` `gap: var(--space-2)` `min-width: 0`
- Mobile identity button: disc as first child (before avatar)
- Compute `presenceFromLastActive(user.last_active_at, Date.now(), user)` per row

**Heartbeat hook:**
- `usePresenceHeartbeat(enabled: boolean)`
- When enabled, `createPresenceHeartbeat` with `isImpersonating` from stash, `document.hidden`, `Date.now`, `touchLastActive`, window for pointer/key, document for visibilitychange
- In `Gate()`, call **before any early return**, with `enabled: Boolean(session && !passwordSetupReason && loginOtp.state === 'ok')`

- [ ] **Step 1:** Component + CSS
- [ ] **Step 2:** Wire desktop + mobile
- [ ] **Step 3:** Hook + App.tsx

---

### Task 6: Docs + verification

**Files:**
- Modify: `design-system-design-instructions/screens/admin.md` (משתמשים list: presence disc at inline-start of name / mobile identity)
- Modify: `docs/superpowers/specs/2026-08-15-yahpaz-user-presence-design.md` status → approved
- Modify: `.cursor/memory/MEMORY.md` — one factual line under current app state

- [ ] **Step 1:** Docs
- [ ] **Step 2:** `npx vitest run src/lib/userPresence.test.ts`
- [ ] **Step 3:** `npx vitest run` (full suite)
- [ ] **Step 4:** `npx tsc -b --pretty false` (or `npm run build`)
- [ ] **Step 5:** Confirm `AdminUsersPage` email-validation WIP still present

## Spec coverage

| Spec item | Task |
|---|---|
| 3 / 15 min bands + labels | 1, 5 |
| Isolated table + RPCs | 3 |
| Heartbeat throttle / skip impersonation / hidden | 2, 5 |
| Admin-only list + poll without full refetch | 4 |
| No profiles UPDATE | 3 |
| A11y text + tokens | 5 |
| Invite pending / inactive hide | 1, 5 |
| Presence fetch cannot fail users list | 4 |
