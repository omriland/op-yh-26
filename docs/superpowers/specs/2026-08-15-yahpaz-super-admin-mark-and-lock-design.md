# Super Admin mark + regular-admin lock

**Date:** 2026-08-15  
**Status:** Implemented

## Problem

`super_admin` is DB-only and hidden from role chips, so עמרי and מוטי look like ordinary admins in משתמשים. Regular admins can still edit, deactivate, delete, and toggle OTP on those rows via the UI and via RLS.

## Decisions

| Topic | Choice |
|---|---|
| Mark | Highest-role chip in the `תפקיד` column: `מנהל־על` — not a stamp, not a name caption |
| Who sees the mark | Anyone on `משתמשים` (admins) |
| Who may mutate a Super Admin row | Caller with `super_admin` only |
| Super Admin → other Super Admin | Allowed (peer edit / deactivate / delete / OTP / set password) |
| Impersonate Super Admin | Still forbidden (existing rule) |
| Self-service | A Super Admin may still update their own profile/vehicles via `auth.uid()` |
| Grant/revoke `super_admin` | Still DB-only; no checkbox |

## Mark

The `תפקיד` column (and the mobile card chip row) shows **one** highest-role chip: `מנהל־על` · `מנהל` · `אחמ״ש` · `כונן`.

Edit checkboxes stay `מנהל` / `אחמ״ש` / `כונן` only. Checking a higher role implies and greys out the lower ones. Profile role labels stay unchanged.

## Lock

A Super Admin row is locked for a regular admin. “Edit” means every mutation, not only the dialog:

- Open / save עריכת משתמש (name, callsign, phone, roles, vehicles)
- Row-click / card-tap that currently opens that dialog
- OTP flags
- Resend / copy invite
- Deactivate / reactivate
- Delete

UI: omit those overflow items. If the menu would be empty, hide `⋮`. Row/card must not open the editor.

Server (must match; UI is not enough):

1. Helper `public.super_admin_row_locked(target_id uuid) returns boolean` — `true` when the JWT caller is not `super_admin` and the target has `super_admin`. `auth.uid() is null` (SQL editor / service role) → `false`.
2. Tighten RLS **USING + WITH CHECK** on `profiles` update, `user_roles` write, `vehicles` write: existing admin/own rules **and** `not super_admin_row_locked(target)`.
3. Edge `admin-users`: `deactivate` / `reactivate` / `delete` / `resend_invite` / `copy_invite_link` → 403 if locked.
4. Edge `phone-otp` `set_otp_flags` → 403 if locked.

Hebrew 403 / save error: `לא ניתן לערוך מנהל־על.`

`set_password` stays Super-Admin-only (already). Impersonation of a Super Admin stays denied (already).

## Out of scope

- Granting or revoking Super Admin from the app
- Read-only user dialog for regular admins
- Badge, icon, stamp, or accent color
- Showing `מנהל־על` on the profile screen
