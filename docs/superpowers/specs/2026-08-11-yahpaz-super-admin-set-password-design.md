# Super Admin + set password — design

Date: 2026-08-11  
Status: approved for implementation

## Problem

Some ops (starting with setting another user’s password) must not be available to every Admin. We need a higher privilege that cannot be granted from the app UI — only via the database — and a tight admin-panel flow to set a permanent or temporary password, with an optional/required force-change on next login.

## Decisions (locked)

| Topic | Choice |
|---|---|
| Privilege model | Additive `super_admin` role on top of existing roles (Approach A) |
| Storage | Extend `app_role` enum; not a separate boolean |
| Grant/revoke | Database / service role only — never in admin role checkboxes or invite |
| Password modes | Single set-password form; optional checkbox “חייב להחליף סיסמה בכניסה הבאה” (default off) |
| Delivery | No email from this dialog — Super Admin types the password |
| Who can be targeted | Any user in the admin users list (active/inactive, including self) |
| Who sees the action | Callers with `super_admin` only |
| Seed | Grant `super_admin` to עמרי לנדמן (`omriland@gmail.com`) as part of ship |

## Data model

### `app_role`

Add enum value `super_admin`.

Existing roles unchanged: `admin`, `shift_lead`, `responder`.

### `profiles.must_change_password`

```sql
must_change_password boolean not null default false
```

- Set `true` when Super Admin checks “חייב להחליף סיסמה בכניסה הבאה” (via Edge Function / service role).
- Cleared only after the user successfully updates their password via the app’s set-password path.
- **Not client-writable:** a trigger blocks authenticated JWT updates to this column. Clearing goes through a `SECURITY DEFINER` RPC `clear_must_change_password()` that sets session `app.bypass_must_change_guard=on` then sets `false` only for `auth.uid()`, called immediately after a successful `updatePassword`.

### Privilege protection

1. **DB trigger** on `user_roles`: reject insert/update/delete involving `super_admin` for authenticated clients (JWT / `authenticated` role). Allow only when running as `service_role` or a Postgres superuser (SQL editor / migration).
2. **Client defense:** `syncUserRoles` never adds or removes `super_admin` (skips that role in both directions).
3. **UI:** role checkboxes, invite role list, and profile role labels never show `super_admin`.
4. **Invite Edge path:** `ALLOWED_ROLES` stays without `super_admin`.

`has_role(uid, 'super_admin')` is the check for privileged actions. Normal admin RLS continues to use `admin` only — Super Admin does not replace Admin.

## Edge Function: `set_password`

Extend `supabase/functions/admin-users`.

### Request

```ts
{
  action: "set_password",
  user_id: string,
  password: string,
  force_change?: boolean // default false
}
```

### Auth

- Require Bearer JWT.
- Require `has_role(caller.id, 'super_admin')`. Regular `admin` → 403 Hebrew: `אין הרשאה לביצוע פעולה זו.`

### Server steps

1. Validate password with the same strength rules as the app (min 8, uppercase, symbol).
2. `auth.admin.updateUserById(user_id, { password })`.
3. Update `profiles.must_change_password` accordingly.
4. Always revoke all Auth sessions + refresh tokens for that user via `revoke_user_sessions(user_id)` so an already-logged-in device cannot skip the gate.
5. Return `{ ok: true }` (no email, no action link).

Client gate: never expose `session` to the app shell until `must_change_password` / invite / recovery reason is resolved (avoids a SIGNED_IN race that unlocked the app before the set-password screen).

### Errors (Hebrew)

| Case | Message |
|---|---|
| Not Super Admin | אין הרשאה לביצוע פעולה זו. |
| Weak password | Same copy as login strength error |
| Missing user / Auth failure | הגדרת הסיסמה נכשלה. |

## Admin UI

On משתמשים (`AdminUsersPage`), overflow menu (desktop + mobile):

- Item **הגדרת סיסמה** — only if current user has `super_admin`.
- Opens a Dialog:
  - Password + confirm fields (LTR, existing strength helper)
  - Checkbox **חייב להחליף סיסמה בכניסה הבאה** (default off) — when checked, next login forces a new password
  - Primary: **שמירת סיסמה**
- Success toast. Password is only what the Super Admin typed (not emailed).

Inactive users remain eligible; setting a password does **not** reactivate them.

## Force-change gate (login)

Reuse the existing invite/recovery set-password gate on `LoginPage`.

1. Extend `PasswordSetupReason` with `admin_reset`.
2. On sign-in and session bootstrap: if `profiles.must_change_password === true`, arm the gate and block the rest of the app (same as today’s `forceSetPassword`).
3. Copy for `admin_reset`:
   - Eyebrow: **החלפת סיסמה**
   - Title: **בחירת סיסמה חדשה**
   - Body: `מנהל הגדיר עבורכם סיסמה. בחרו סיסמה אישית כדי להמשיך.`
4. On successful `updatePassword`: call `clear_must_change_password()`, clear gate, show existing success confirmation then enter app.
5. Sign-out while gated is allowed; next login re-arms until the password is changed.

“Temporary password works once” means: they log in with the admin-set password → forced to set a new one → Auth password is replaced. Supabase has no native one-login OTP password; we do not invent a custom Auth stack.

## Platform / redirects

This feature does **not** send email links. Tightness checklist during implementation:

- Confirm Supabase Auth Site URL + redirect allow-list still include `https://yahpz.com`, `www`, Netlify app URL, and `http://localhost:5173` (existing invite/recovery).
- Redeploy Edge Function `admin-users` after code change.
- No new Netlify env vars.
- Mobile and web both use normal email/password sign-in; force-change is profile-gated, so it works regardless of entry URL once the session exists.

## Testing

- Unit: `syncUserRoles` skips `super_admin`; force-change reason mapping; password strength reused server-side if extracted.
- Manual:
  - Super Admin sees **הגדרת סיסמה**; regular Admin does not.
  - Permanent without force-change → normal login.
  - With force-change checked → gate after login; after change, app unlocks.
  - Invite/recovery links still land on set-password correctly (regression).
  - Editing a user’s roles as Admin does not strip `super_admin` from Omri’s account.

## Out of scope (v1)

- Email “send reset link” from this dialog
- Audit log of who set whose password
- Granting/revoking Super Admin from the app
- Super Admin badge in the users list
- Replacing all `admin` checks with `super_admin`

## Seed (ship with feature)

```sql
insert into public.user_roles (user_id, role)
select id, 'super_admin'::public.app_role
from public.profiles
where email = 'omriland@gmail.com'
on conflict (user_id, role) do nothing;
```

Run in the feature migration (or immediately after) so Omri has the role when the UI ships.
