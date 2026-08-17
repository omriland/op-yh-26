# Yahpaz — Unit broadcast push (תפוצה → APNs)

**Date:** 2026-08-17  
**Status:** Approved in brainstorming  
**Repos:** `op-yh-26` (web + Edge + DB) and `yahpaz-ios` (אבן דרך)  
**Extends:** `2026-08-15-yahpaz-unit-broadcast-design.md`

## Problem

Admins send תפוצה לכלל היחידה by email and SMS. Responders who installed אבן דרך still only hear about it if they read mail or the SMS. There is no remote notification path.

## Goal

When an admin sends a unit broadcast, every eligible audience member who has registered an iOS device token also receives the same text as a push notification. Email and SMS stay unchanged. Push is an extra pipe, not a new channel chip.

## Non-goals

- Fill-ready, live-track, or any other push type
- A Push / Push+email channel chip
- Prefer-push-and-skip-SMS/email
- Firebase, OneSignal, or other vendors
- In-app inbox, templates, scheduled send, per-recipient delivery log
- Android

## Decisions

| Topic | Choice |
|---|---|
| Channel UI | Unchanged: `אימייל` · `SMS` · `SMS + אימייל` (`email` / `sms` / `both`) |
| Who gets push | Same eligible audience as today (`profiles.active`, not `invite_pending`, matches `all` / `admins` / `shift_leads`), **and** at least one row in `device_tokens` |
| Additive | Email/SMS still send to everyone they send to today. Push does not replace them. |
| App-only recipient | Audience member with a token but no email/phone for the selected channel still gets push. They count as a recipient. |
| `canSend` | True if anyone will be reached by email, SMS, **or** push |
| Notification title | Email subject when the channel includes email and subject is non-empty; otherwise `אבן דרך` |
| Notification body | Broadcast body (max 2000, same as SMS/email body) |
| Tap | Opens the app. No deep link, no in-app inbox. |
| Vendor | Direct APNs HTTP/2 from Edge Function `unit-broadcast`. No extra SaaS. |
| Apple gate | Live APNs delivery requires paid Developer Program **Active**, Push capability on `com.yahpz.responder`, and an APNs auth key in Supabase secrets. Until then, token registration can ship; send skips push when secrets are missing and does **not** fail the broadcast. |

## Architecture

```
[Admin web תפוצה] --send--> [Edge unit-broadcast]
                                ├─ Resend email (existing)
                                ├─ Soprano SMS (existing)
                                └─ APNs, for user_ids in audience ∩ device_tokens

[אבן דרך] --login--> request permission
                  --> upsert device_tokens
         --logout--> delete this device token
```

## Data

### `device_tokens`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `user_id` | uuid not null → `profiles.id` on delete cascade | |
| `token` | text not null unique | APNs device token, hex |
| `platform` | text not null | `'ios'` only in this slice |
| `environment` | text not null | `'sandbox'` or `'production'` |
| `updated_at` | timestamptz not null | bumped on upsert |

- One user may have many devices.
- Same token re-login as a different user: upsert `user_id` onto that token row.
- RLS: authenticated user may `select` / `insert` / `update` / `delete` **own** rows (`user_id = auth.uid()`). Service role reads all for send.
- No admin UI for tokens.

### `unit_broadcasts` additions

| Column | Type | Notes |
|---|---|---|
| `push_count` | integer not null default 0 | unique audience users we attempted to notify |
| `push_failed_count` | integer not null default 0 | users for whom every device send failed |

Count **users** with ≥1 token for `push_count` (matches “N עם האפליקציה”), not raw device rows. If a user has two phones, both devices are sent; `push_count` is still 1 user. `push_failed_count` is users for whom **every** device send failed. Partial: one phone ok → user counts as sent, not failed.

## iOS (`yahpaz-ios`)

- Add Push Notifications entitlement (`aps-environment`). Debug/development builds register `sandbox`; Release/TestFlight/App Store register `production`.
- After `isSignedIn` (not on the login screen, not during password-change gate): request `UNUserNotificationCenter` authorization once per install (system dialog). Copy: **אבן דרך שולח התראות על תפוצה מהיחידה.**
- If denied: do nothing, no in-app nag, login continues.
- If allowed: register for remote notifications; on token, upsert `device_tokens`. Token save failure does not block login or show a toast.
- On `signOut`: delete this device’s token row, then sign out.
- Tap a notification: default app launch (existing root). No extra routing.
- Permission / token work can land before Apple membership is Active; the capability may only apply on the paid team. Do not switch signing to Hive (`5GXFELD6MM`).

## Web + Edge (`op-yh-26`)

### Preview / confirm / toast / history

`BroadcastCandidate` gains `hasApp: boolean` (user has ≥1 `device_tokens` row). Own-row RLS on tokens means the admin client cannot count other users’ tokens. Add `user_ids_with_device_tokens()` → `setof uuid`, `security definer`, `grant execute to authenticated`. Returns ids only when `has_role(auth.uid(), 'admin')`; otherwise no rows. Never returns token strings. `fetchBroadcastCandidates` intersects those ids with loaded profiles so `previewUnitBroadcast` stays the confirm-copy source of truth.

`previewUnitBroadcast`:

- `pushCount` = eligible audience members with `hasApp`
- A user is a recipient if they would get email, SMS, **or** push
- `canSend` if `recipientCount > 0`
- Confirm / caption: keep current skip lines; add `N עם האפליקציה` when `pushCount > 0` (not a skip)
- Result toast: add `N התראות נשלחו` when `pushCount > 0`; add `N התראות נכשלו` when `pushFailedCount > 0` (separate from email/SMS `failed_count`)
- History row: show push counts when > 0. Channel label stays email/SMS/both.

### Send (`unit-broadcast`)

1. Resolve audience from DB (unchanged).
2. Load tokens for those `user_id`s via service role.
3. Send email/SMS as today.
4. If APNs secrets missing: skip push, `push_count = 0`, `push_failed_count = 0`, do not add to `failed_count`.
5. Else send one APNs request per token (sandbox host vs production host per token `environment`). Payload: `aps.alert.title`, `aps.alert.body`, `aps.sound = default`. Hebrew text as stored.
6. `410` / `BadDeviceToken` / `Unregistered`: delete that token row, count toward that user’s device failure.
7. Push errors do not roll back email/SMS. `failed_count` remains email+SMS failures only (avoid mixing pipes in the existing “נכשלו” number). Push has its own `push_failed_count` in the log and toast.
8. Insert `unit_broadcasts` with the new columns.

### Secrets

| Name | Value |
|---|---|
| `APNS_KEY_P8` | Auth key contents (`.p8`) |
| `APNS_KEY_ID` | 10-char key id |
| `APNS_TEAM_ID` | Paid team id (not Hive) |
| `APNS_BUNDLE_ID` | `com.yahpz.responder` |

JWT ES256, `iss` = team id, `kid` = key id, topic = bundle id.

## Errors

| Case | Behavior |
|---|---|
| Permission denied | Silent. No token. |
| Token upsert fails | Silent. Login continues. |
| APNs secrets missing / membership pending | Skip push. Email/SMS still send. Not a failed broadcast. |
| Invalid token | Delete row. Continue other devices. |
| One user’s both devices fail | `push_failed_count` +1 for that user |
| Impersonation | Unchanged: cannot send |

## Tests

- `previewUnitBroadcast` / confirm / result copy: push counts; app-only recipient makes `canSend` true on SMS-only when `hasApp`; zero tokens omits the app clause.
- `user_ids_with_device_tokens`: admin gets user ids; non-admin gets no rows; never returns token strings.
- Edge: missing secrets → skip push, email/SMS still attempted (mocked); invalid APNs response deletes token; push fail does not increment `failed_count`.
- iOS: no YahpazDomain unit test required (permission/token are app-target). Manual: Debug install on Omri’s iPhone after Apple Active + sandbox send.

## Rollout

1. Migration + preview function + web copy tests (safe with zero tokens).
2. iOS permission + upsert (may wait on Push capability until membership Active).
3. APNs helper in `unit-broadcast` (no-op without secrets).
4. When membership is Active: enable capability, create key, set secrets, send a תפוצה to a device on the Debug build (sandbox).

## Out of scope (again)

Fill-ready push, live-track push, Android, channel-chip changes, skipping SMS when push succeeds.
