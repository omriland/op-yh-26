# User presence on משתמשים (last action)

Date: 2026-08-15  
Status: approved

## Problem

Admins on **משתמשים** can see **כניסה אחרונה** (`auth.users.last_sign_in_at`). That is the last **login**, not whether the volunteer is using the app now. A tab left open after morning login looks the same as someone filling an event. There is no activity log, heartbeat, or presence channel today.

## Goal

On the admin users list only, show a small status disc next to each user (inline-start / visual right in RTL):

| Last real action | Disc | Accessible label |
|---|---|---|
| ≤ 3 minutes | filled `--status-done` (green) | `פעיל עכשיו` |
| > 3 and ≤ 15 minutes | filled `--status-partial` (orange) | `פעיל לאחרונה` |
| > 15 minutes, never, or unknown | nothing | — |

“Action” means a pointer, key, or returning to a visible tab — not “JWT still valid” and not “tab exists in the background.”

## Decisions (locked)

| Topic | Choice |
|---|---|
| Signal | Last **action** timestamp, not live “tab open” websockets |
| Storage | Dedicated `user_presence` table — **not** a column on `profiles` |
| Write path | RPC `touch_last_active()` only (own row, upsert) |
| Read path | RPC `admin_list_last_active()` — admin role only, same pattern as `admin_list_last_sign_in` |
| Who sees it | Admins on **משתמשים** only (desktop table + mobile cards) |
| Who is counted | Logged-in users inside the main app shell |
| Throttle | At most one write per user per **60 seconds** |
| Users-page refresh | Poll presence RPC every **60 seconds** while the page is mounted and visible; merge into existing rows — **do not** refetch the full user list |
| Impersonation | **No** heartbeat while `isImpersonating()` — do not mark the target as active |
| Failures | Silent; never toast, never block clicks, never blank the users list |
| כניסה אחרונה | Unchanged |

The “five minutes” example in the request is the middle band. Locked cutovers are **3 minutes** (now) and **15 minutes** (hide).

## Why not the alternatives

- **Reuse כניסה אחרונה / Auth logs:** login time, not clicks. Sessions stay valid for hours.
- **Infer from events / shifts / `updated_at`:** only fires on saves; browsing and reading are invisible; expensive joins.
- **Column on `profiles` + client `update`:** would fire OTP / `must_change_password` triggers on every ping, risk racing admin profile saves, and leak the timestamp to anyone who can `SELECT` a profile (shift-leads included). Isolated table + RPCs avoid that.
- **Supabase Realtime Presence:** true “tab open,” more infra, drops when the phone sleeps, does not match a 15-minute fade.

## Non-goals

- Live websocket / “tab is open right now”
- Presence on any screen other than משתמשים (event lists, responder pickers, profile)
- Sorting or filtering the users list by presence
- A new table column **נוכחות**
- A full action-audit log
- Showing presence for pending invitees (`invite_pending`) or מושבתים (`active = false`)
- Changing last-login copy, OTP, impersonation, invites, or profile save

## Data model

```sql
create table public.user_presence (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  last_active_at timestamptz not null
);

alter table public.user_presence enable row level security;
-- No policies for authenticated/anon → deny all via PostgREST.
-- Writes and admin reads go through SECURITY DEFINER RPCs only.
```

No row until the first successful touch. Deleting a profile cascades. No TTL; a stale timestamp simply maps to “nothing.”

### `touch_last_active()`

- `security definer`, `search_path = public`
- `auth.uid()` required; otherwise no-op
- If `profiles.active` is not true for that id, no-op (deactivated session leftover)
- `insert … on conflict (user_id) do update set last_active_at = now()`
- Does **not** touch `profiles`, `updated_at`, OTP flags, or `must_change_password`
- Grant `execute` to `authenticated`

### `admin_list_last_active()`

- Returns `user_id uuid, last_active_at timestamptz`
- Same admin gate as `admin_list_last_sign_in`: `has_role(auth.uid(), 'admin')`; otherwise empty
- Grant `execute` to `authenticated`

## Client heartbeat

Mount **once** only after `App.tsx` returns `AppShell` (the logged-in main UI). That is already after login, the password-setup `LoginPage` gate, and the login OTP gate — those are earlier returns, so the hook is not mounted there. Do **not** mount on:

- Login / privacy
- Password-must-change gate
- Login OTP gate
- Fill-by-link without a session
- Users-page OTP gate is still inside the shell — heartbeat **does** run there (they are using the app)

Hook rules (`usePresenceHeartbeat`):

1. If no session, or `isImpersonating()`, do nothing.
2. If `document.hidden`, do not write (a background tab is not an action).
3. Listen on `window` (capture): `pointerdown`, `keydown`. Also `visibilitychange` → `visible` counts as one action (coming back to the app).
4. Throttle: if last successful (or in-flight) touch was < 60s ago, skip.
5. Call `touch_last_active()`; ignore errors. Never `await` inside the event handler in a way that delays the click. Fire-and-forget.
6. Tear down listeners on unmount / session loss.

Scroll, mousemove, and interval-while-idle are **not** actions.

## Users page UI

### Placement (RTL)

Disc is the **first** flex child of the name cluster, so it sits at **inline-start** (visual right, next to the user):

- Desktop: in the `שם מלא` cell, before the name text. No new column. Overflow menu and כניסה אחרונה stay as they are.
- Mobile: in `user-card__head` identity row, before the avatar. Do not overlay the avatar (keeps the 40px avatar and ⋮ tap targets unchanged).

### Disc

- Size `--space-2` (8px), filled, `border-radius: var(--radius-full)`, `flex-shrink: 0`
- Gap to the name/avatar: `--space-2`
- Name truncation / wrap stays as today; the disc must not steal width or wrap onto its own line
- Green: `background: var(--status-done)`
- Orange: `background: var(--status-partial)`
- **Design-system exception:** `--radius-full` is documented as avatars-only; this disc is the second consumer. Do not invent a new radius token.
- `aria-hidden` on the disc; Hebrew `title` + visually-hidden text with the label (`פעיל עכשיו` / `פעיל לאחרונה`) so status is never color-only (`08-accessibility.md`).
- Not a button; does not change row-click / card-tap / ⋮ behavior.

### Who gets a disc

Pure function `presenceFromLastActive(lastActiveAt, now, { active, invite_pending })`:

- `invite_pending` or `!active` → `null`
- missing / unparsable timestamp → `null`
- elapsed `< 0` (clock skew) → treat as `now`
- elapsed ≤ 3 min → `now`
- elapsed ≤ 15 min → `recent`
- else → `null`

Constants: `PRESENCE_NOW_MS = 3 * 60 * 1000`, `PRESENCE_RECENT_MS = 15 * 60 * 1000`.

### Loading / refresh

- `fetchAdminUsers` loads presence in a **separate** request, not inside the existing `Promise.all` of roles / vehicles / last-sign-in. If presence fails or returns empty, every row gets `last_active_at: null` and the page still renders. A presence outage must not fail the users list.
- While משתמשים is mounted and `document.visibilityState === 'visible'`, poll **only** `admin_list_last_active` every 60s and on `visibilitychange` → `visible`. Merge timestamps into current rows.
- Poll must **not** set `users` to `null` (no skeleton flash, no lost search query, no closed overflow menu).
- Poll failure: keep last discs.

## Mapping in `fetchAdminUsers`

Add `last_active_at: string | null` on `AdminUserRow`. Do **not** `select` it from `profiles`. Sort stays `compareAdminUsers` (pending → active → מושבת); presence does not affect order.

## Safety — do not change existing behavior

| Surface | Guarantee |
|---|---|
| Profile save / admin user save | Heartbeat never `UPDATE`s `profiles` |
| OTP flags / must-change-password triggers | Not in the write path |
| Super Admin row lock | Not in the write path |
| כניסה אחרונה | Still `admin_list_last_sign_in` only |
| Impersonation | Target does not look active; actor’s own presence pauses until restore |
| Fill-by-link (no session) | No heartbeat |
| Deactivated user with leftover JWT | RPC no-op |
| Users list fetch cost | Presence poll is a small RPC, not a full reload of roles/vehicles |
| Click / form latency | Touch is async, throttled, errors swallowed |
| RLS elsewhere | New table has no open policies; existing profile policies unchanged |
| Mobile card / ⋮ / row click | Disc is non-interactive; layout gap is `--space-2` only |

## Tests (must exist before UI wiring)

`src/lib/userPresence.test.ts` — `presenceFromLastActive`:

- 0s, 2m59s → `now`
- 3m00s → `now` (inclusive)
- 3m01s, 14m59s, 15m00s → `recent`
- 15m01s → `null`
- `null` timestamp → `null`
- future timestamp → `now`
- `invite_pending` / `active: false` → `null` even if timestamp is fresh

`src/lib/userPresenceHeartbeat.test.ts` (or same file) — throttle / skip rules with a fake clock + fake RPC:

- second action inside 60s does not call RPC
- action after 60s does
- `document.hidden` does not call
- `isImpersonating()` does not call
- RPC rejection does not throw to the listener

Pure `mergeLastActive(rows, presenceRows)` (used by `fetchAdminUsers` and the 60s poll), tested for:

- missing presence row → `last_active_at: null`
- matching id copied through
- extra presence ids ignored
- original row order unchanged

No E2E required for v1. Manual check after implement: open משתמשים as admin, click around in another user account, confirm green → orange → gone on the 3 / 15 minute windows (can temporarily shorten constants in a unit test; do not ship a debug query-param).

## Implementation notes

- Update `design-system-design-instructions/screens/admin.md` משתמשים list: presence disc at inline-start of the name / mobile identity row.
- Hebrew-only labels. English column/RPC names are fine.
- Do not add Netlify Functions. Client + existing Supabase RPCs only.

## Out of scope (later, not this spec)

- Presence on other screens
- Filtering “who is on shift right now”
- Admin tooltip with exact last-action clock time
- Realtime push (no 60s poll)
