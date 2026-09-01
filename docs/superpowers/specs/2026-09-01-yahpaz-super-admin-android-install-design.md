# Super Admin — Android install + version on משתמשים

**Date:** 2026-09-01  
**Status:** Approved  
**Repos:** `op-yh-26` (schema + web), `yahpaz-android` (heartbeat)

## Problem

Super Admin cannot tell who has installed אבן דרך on Android or which build they last ran. `device_tokens` is iOS/APNs only. The Android app does not report version today.

## Decisions

| Topic | Choice |
|---|---|
| Where | Android mark next to the name on **משתמשים** (desktop table + mobile card). No extra column, no dedicated page, no report |
| Who sees it | `super_admin` only, and **not** while impersonating |
| Who counts as installed | User has signed in on Android at least once (`last_android_seen_at` is not null) |
| Which device | Last device that opened the app (overwrite) |
| Latest | `last_android_version_code` equals `latestVersionCode` in `/android/version.json` |
| Hover | Latest: `{versionName} · עדכני`. Else: `{versionName}` only |
| Storage | Three columns on `profiles`, not `device_tokens`, not a sessions table |

## Schema

On `public.profiles`:

- `last_android_seen_at timestamptz`
- `last_android_version_code integer`
- `last_android_version_name text`

All nullable. “Has Android” = `last_android_seen_at is not null`.

Clients cannot `UPDATE` these columns. Add a `BEFORE UPDATE` trigger (same pattern as lifetime stats) that restores the old values unless `current_setting('yahpaz.reporting_android_session', true) = '1'`. The RPC sets that GUC for the statement.

`SELECT` stays on existing profiles RLS (admins already load the unit). The **icon is UI-gated**; do not invent column-level RLS. Regular admins may receive the three fields in `fetchAdminUsers` JSON — they must not render them.

## Heartbeat (Android)

`report_android_session(p_version_code integer, p_version_name text)` — `security definer`, `grant execute to authenticated`.

- `auth.uid()` required; else Hebrew `יש להתחבר מחדש.`
- `p_version_code` must be a positive integer; `p_version_name` trimmed, 1–32 chars
- Sets the three columns on `profiles` where `id = auth.uid()`, with the GUC so the protect trigger allows it
- Last write wins (one row per user)

Call after a real signed-in session exists (password/OTP login **and** cold-start restore). On process foreground (`ON_START`), call again if at least **15 minutes** since the last successful report in that process (in-memory throttle). Fail **silent**: no toast, login continues.

Pass `BuildConfig.VERSION_CODE` and `BuildConfig.VERSION_NAME`. Web never writes these columns. iOS stays out of scope (hold).

## Web UI

Reuse `HoverTip` `mode="always"` `theme="field"` (same family as `EventFrozenMark`).

Placement: after `UserPresenceDot`, before `full_name` (table cell and mobile card head).

Mark: small Android robot SVG (not Lucide `Smartphone`, not a Play badge), ~16px, `--text-muted`. Decorative; `aria-label` = hover string.

Show only when:

1. `roles.includes('super_admin')`
2. not impersonating
3. `last_android_seen_at` is not null

Inactive / invite-complete users still show the mark if they have a stamp. No search, filter, or CSV on version.

`fetchAdminUsers` adds the three columns. Super Admin loads `/android/version.json` once per משתמשים mount (same origin). Compare integer `versionCode` only.

Hover copy helper (pure, unit-tested):

| Condition | Tip |
|---|---|
| Has stamp + json loaded + codes equal | `{name} · עדכני` |
| Has stamp + otherwise | `{name}` (`version_name`, else String of `version_code`) |
| No stamp | no mark |

If `version.json` fails or is missing `latestVersionCode`, never append **עדכני**.

## Errors

| Case | Behavior |
|---|---|
| Heartbeat network / RPC fail | Silent on Android |
| Unauthenticated RPC | Exception `יש להתחבר מחדש.` |
| Direct `UPDATE` of the three columns | Trigger reverts; save of other profile fields still works |
| `version.json` fail | Icon + version name; no **עדכני** |
| Impersonation | Hide mark even if the actor is Super Admin |

## Tests

- Hover helper: latest, older, json fail, missing name
- Super-admin visibility helper: show iff super_admin, not impersonating, stamp present
- SQL: RPC stamps own row; unauthenticated fails; `UPDATE profiles` cannot change the three columns
- Android: report payload uses `VERSION_CODE` / `VERSION_NAME` (domain or API unit test)

No extra e2e.

## Out of scope

- iOS / APNs / FCM
- Multi-device list
- Nagging or auto-force from this UI (force-update stays `version.json` + in-app block)
- Filters, CSV, reports catalog
- Showing the mark to regular admins

## Implementation notes

- Update `design-system-design-instructions/screens/admin.md` משתמשים list: Super Admin Android mark + hover copy
- Ship web + Android together: icons stay empty until a build that heartbeats is installed
