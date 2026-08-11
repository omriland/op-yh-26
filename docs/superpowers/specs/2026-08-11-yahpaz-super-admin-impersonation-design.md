# Super Admin impersonation (“צפייה כמשתמש”) — design

Date: 2026-08-11  
Status: approved for implementation

## Problem

Super Admins need to experience the product exactly as another volunteer (roles, RLS, nav, writes) for support and QA. A UI-only “view as” mode cannot work: Yahpaz authorization is JWT + Postgres RLS (`auth.uid()`, `has_role`). Impersonation must swap to a **real Auth session** for the target user, with a safe way back and an audit trail.

## Decisions (locked)

| Topic | Choice |
|---|---|
| Access while swapped | **Full** — same writes as the target (Approach A) |
| Eligible targets | **Active** users only; **not** self; **not** users who have `super_admin` |
| Entry points | Avatar menu + משתמשים overflow (**B**) |
| Mechanism | Edge mint session + client stash/restore of Super Admin tokens (Approach 1) |
| Audit | Table `impersonation_audit`; **no** admin UI in v1 |
| Sign-out while impersonating | Full sign-out + clear stash (does **not** auto-restore actor) |
| Privilege while swapped | Target JWT has no `super_admin` → Super Admin Edge actions already fail |

Related: `docs/superpowers/specs/2026-08-11-yahpaz-super-admin-set-password-design.md`

## Architecture

```
Super Admin JWT
    → Edge impersonate (validate + mint target session + audit started)
    → Client stashes actor session in sessionStorage
    → setSession(target) → full app as target (RLS)
    → “חזרה לחשבון שלי”
    → setSession(stashed actor) → clear stash → Edge stop_impersonation (audit stopped)
```

### Why not alternatives

- **UI-only pretend profile:** RLS still sees Super Admin — wrong data/permissions.
- **Magic-link email / new tab:** poor restore UX; risk of leaving links around.
- **Custom JWT / RLS `acting_as`:** every policy must change; high miss risk — rejected.

## Data model

### `impersonation_audit`

```sql
create table public.impersonation_audit (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references public.profiles (id),
  target_user_id uuid references public.profiles (id),
  action text not null check (action in ('started', 'stopped', 'denied')),
  reason text,
  created_at timestamptz not null default now()
);

create index impersonation_audit_actor_created_idx
  on public.impersonation_audit (actor_user_id, created_at desc);

alter table public.impersonation_audit enable row level security;
-- No policies for authenticated/anon → deny all via API.
-- Inserts only via service_role (Edge Function).
```

- `target_user_id` nullable on `denied` if target was missing.
- `reason` short **machine** code for denials: `not_super_admin` | `missing` | `inactive` | `self` | `is_super_admin` | `mint_failed`.

### Client stash (not DB)

`sessionStorage` key `yahpaz:impersonation`:

```ts
type ImpersonationStash = {
  actorAccessToken: string
  actorRefreshToken: string
  actorUserId: string
  targetUserId: string
  targetFullName: string
  targetCallsign: string
  startedAt: string // ISO
}
```

- Cleared on: successful restore, sign-out, failed restore (then force login).
- Presence of stash = “impersonating” for UI (banner, hide start actions).

## Edge API

Extend `supabase/functions/admin-users` (same CORS/Bearer pattern as `set_password`).

### `impersonate`

**Request**

```ts
{
  action: "impersonate",
  target_user_id: string
}
```

**Auth / validation (order)**

1. Valid Bearer → user.
2. `has_role(caller.id, 'super_admin')` else 403 + audit `denied` / `not_super_admin`.
3. Load target profile + roles.
4. Reject with 403 + audit `denied` if:
   - target missing → `missing`
   - `!target.active` → `inactive`
   - `target.id === caller.id` → `self`
   - target has role `super_admin` → `is_super_admin`
5. Mint session for target (server-side only):
   - Preferred: `auth.admin.generateLink({ type: 'magiclink', email: target.email })` then Admin/client with service role `verifyOtp({ type: 'magiclink', token_hash: properties.hashed_token, email })` (or current GoTrue-supported equivalent that yields `access_token` + `refresh_token` without sending email).
   - **Must not** call Resend or leave an actionable inbox email.
6. Audit `started` (`actor_user_id`, `target_user_id`).
7. Response 200:

```ts
{
  ok: true,
  access_token: string,
  refresh_token: string,
  target: { id: string, full_name: string, callsign: string }
}
```

**Errors (Hebrew examples)**

| Case | Message |
|---|---|
| Not Super Admin | אין הרשאה לביצוע פעולה זו. |
| Inactive / self / super_admin / missing | לא ניתן לצפות כמשתמש זה. |
| Mint failure | פתיחת הצפייה נכשלה. נסו שוב. |

### `stop_impersonation`

**Request** (after client has restored actor session, or with actor tokens before clear — implementer uses **restored actor Bearer**):

```ts
{
  action: "stop_impersonation",
  target_user_id: string
}
```

**Rules**

1. Bearer must be Super Admin (`has_role`).
2. Audit `stopped` with `actor_user_id = caller.id`, `target_user_id`.
3. Does not revoke target sessions (optional later); v1 only audits.
4. Client is responsible for `setSession(actor)` **before or after** this call; if audit fails, still restore UX and toast soft warning — do not strand the Super Admin without a session.

## Client behavior

### Start

1. Confirm eligibility in UI (same rules as server — defense in depth).
2. `invoke('admin-users', { impersonate })`.
3. Read current session; write `yahpaz:impersonation` stash.
4. `supabase.auth.setSession({ access_token, refresh_token })`.
5. Auth bootstrap reloads profile/roles as target; navigate to role home (same fallback as post-login).
6. Show banner.

### Banner (while stash present)

- Text: `צופה כ־{full_name} · או״ק {callsign}`
- Action: **חזרה לחשבון שלי**
- Visible on list/admin/shell chrome; keep visible on immersive forms if feasible (prefer always-on slim bar under app bar so support never forgets).

### Stop (restore)

1. Read stash; if missing → toast + login.
2. `setSession` with actor tokens (if this fails → clear stash → login).
3. Clear stash (only after successful actor `setSession`).
4. Call `stop_impersonation` with actor JWT (failure → soft toast only; actor session already restored).
5. Toast: `חזרתם לחשבון שלכם.`
6. Navigate to admin home (`users` or role fallback).

### Sign-out while impersonating

- `signOut()` + **clear stash** (no silent restore). Spec: safer than auto-restoring actor on every logout.

### Interaction with password gate

- If target has `must_change_password`, existing `admin_reset` gate applies after switch (S11). Super Admin completes or exits via sign-out.
- Impersonation start does **not** clear the target’s `must_change_password` flag.

### Privileged UI while impersonating

- Hide: **צפייה כמשתמש**, **הגדרת סיסמה**, any future Super Admin-only chrome (detect via `!roles.includes('super_admin')` or stash presence).
- Show: **חזרה לחשבון שלי** in avatar menu + banner.

## UI entry points

### Avatar menu (`AppShell`)

When `roles.includes('super_admin')` and **not** impersonating:

- Menu item **צפייה כמשתמש** → search dialog (name / או״ק / email).
- Results: active users, exclude self and `super_admin` holders.
- Primary: **המשך כ־{שם}**.

When impersonating:

- Header shows target name/callsign.
- Item **חזרה לחשבון שלי**.
- No start impersonation item.

### משתמשים (`AdminUsersPage`)

Overflow **צפייה כמשתמש זה** when Super Admin, not impersonating, and row is eligible (active, not self, not super_admin).

## Security checkpoints (ship gate)

Implementer must verify each before claiming done. Record evidence (manual notes or tests) in the PR / plan checklist.

| ID | Checkpoint | Pass criteria |
|---|---|---|
| **S1** | Only Super Admin can `impersonate` | Regular `admin` JWT → 403 + audit `denied` |
| **S2** | Target restrictions | Self / inactive / `super_admin` / missing → 403 + `denied` with distinct `reason` |
| **S3** | No start as non–Super-Admin JWT | After swap, calling `impersonate` again → 403 |
| **S4** | Nested start blocked in UI | With stash set, start actions hidden |
| **S5** | Super Admin ops unavailable as target | e.g. `set_password` → 403 |
| **S6** | No service_role leakage | Response contains only user session tokens + public target fields |
| **S7** | Audit not client-writable | Authenticated `insert` into `impersonation_audit` fails |
| **S8** | Sign-out clears stash | After logout while impersonating, `sessionStorage` key absent; next visit is login (not actor) |
| **S9** | Restore is not privilege escalation | Editing stash `targetUserId` cannot grant Super Admin; only `setSession` of stored actor tokens; new starts always re-validated on Edge |
| **S10** | No email sent | Impersonate path does not invoke Resend / Auth mailer |
| **S11** | Password force-change honored | Target with `must_change_password` hits set-password gate after switch |
| **S12** | Threat model accepted | Stash in `sessionStorage` is same XSS class as normal Supabase session; document in README/spec only |

### Additional security notes

- **Do not** put actor refresh tokens in `localStorage` (prefer `sessionStorage` so a closed tab drops the stash).
- **Do not** log access/refresh tokens in Edge `console` or audit rows.
- Rate-limit is optional v1; if abuse appears, add per-actor cooldown later.
- JWT access tokens remain valid until expiry even after stop (stateless); stopping does not need to revoke the target session in v1. (Revoke-on-stop can be a follow-up using `revoke_user_sessions` for the **target** only if desired — **not** the actor.)

## Error handling & edge cases

| Situation | Behavior |
|---|---|
| Stash missing on restore | Toast; stay on login / current; clear impersonation UI flags |
| Actor refresh expired | `setSession` fails → clear stash → login as Super Admin |
| Target banned/inactive mid-session | Existing auth inactive handling signs them out; stash remains until sign-out/clear — on sign-out clear stash |
| Double-click start | Disable button while request in flight |
| Tab duplicate | Each tab has own `sessionStorage`; document that multi-tab impersonation is unsupported |

## Testing

- **Unit:** eligibility helper `canImpersonateTarget(actor, target, targetRoles)`.
- **Manual:** S1–S5, S8, S11; start from avatar + from users menu; restore; sign-out while swapped; regression invite/recovery/set-password as Super Admin when **not** impersonating.

## Out of scope (v1)

- Read-only impersonation
- Audit viewer UI
- Auto time-limit / idle timeout for impersonation
- Revoking target session on stop
- Impersonating inactive users
- Impersonating other Super Admins
- Mobile-only alternate IA (same banner + menus)

## Design-system note

Update `design-system-design-instructions/screens/admin.md` (and shell/app-bar notes if present) with: Super Admin avatar item **צפייה כמשתמש**, users overflow **צפייה כמשתמש זה**, and impersonation banner copy — when implementing.

## Open implementation detail (non-blocking for spec approval)

Exact GoTrue mint path (`generateLink` + `verifyOtp` vs future Admin session API) must be confirmed against the project’s `@supabase/supabase-js` / Auth version during implementation. Requirement is fixed: **server-side session mint, no user-facing email**.
