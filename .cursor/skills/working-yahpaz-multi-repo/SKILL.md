---
name: working-yahpaz-multi-repo
description: Use when working on אבן דרך, Yahpaz, yahpaz-android, yahpz.com, op-yh-26, responder fill/inbox/shifts, or a feature that might touch the Android app or web.
---

# Working on Yahpaz (multi-repo)

One backend, **active clients: web + Android**. A change in one client does **not** apply to the other.

## iOS on hold (mandatory)

**Do not edit `yahpaz-ios`.** Native iOS is paused until the user explicitly lifts the hold.

- Do not open, patch, commit, test, or “keep parity” in `/Users/omrilandman/CursorProjects/today-i/yahpaz-ios`
- Do not add iOS tasks to plans/specs unless the user asks to resume iOS
- Existing iOS code may lag web/Android — that is expected while on hold

## Repos

| Client | Path | GitHub | Status |
|---|---|---|---|
| Android (Compose) | `/Users/omrilandman/CursorProjects/today-i/yahpaz-android` | `omriland/yahpaz-android` | **Active** |
| Web + Edge + specs | `/Users/omrilandman/CursorProjects/today-i/op-yh-26` | existing yahpz web repo | **Active** |
| iOS (SwiftUI) | `/Users/omrilandman/CursorProjects/today-i/yahpaz-ios` | `omriland/yahpaz-ios` | **On hold — do not touch** |

GitHub user is **`omriland`**, not `omrilandman`. Bundle/package: `com.yahpz.responder`. Display name: אבן דרך. Hebrew-only RTL. Field/Command look (`#1D4E89`).

Backend: Supabase `yahpaz-2026` (`https://rtvizpsfvtjowbimugns.supabase.co`). Same Auth, RLS, tables, edge functions for all clients.

Cursor workspace may still be multi-root with iOS listed — **ignore that folder** unless the user lifts the hold.

## Route the work

If the user names a platform, only that repo (and never iOS while on hold).

If they say “the app”, “responders”, or a product feature without a platform:

1. Default responder UX to **Android** (`yahpaz-android`) for phone work.
2. Touch **web/edge/DB once** if the API or admin UI must change (`op-yh-26`).
3. Do **not** port to iOS while the hold is active.
4. Ask only when the feature is clearly one-sided (e.g. FCM vs web-only admin).

| Kind of change | Where |
|---|---|
| Validation, pending/logged split, plates, availability rules | Port in Android `:domain` (+ web helpers when web uses them). Not a shared library. **Skip iOS.** |
| Screen copy, layout, navigation | Each active UI separately (web / Compose) |
| New column, RPC, RLS, edge function | `op-yh-26` + migration; then Android if it consumes it |
| Admin / תפוצה / unit broadcast | Web (`op-yh-26`) unless the phone must show or send something new |
| Push | Android FCM as needed; iOS APNs deferred with the hold |

## Do not

- Touch `yahpaz-ios` while the hold is active.
- Ship a phone feature on iOS “for parity” during the hold.
- Publish under Hive team `5GXFELD6MM`.
- Treat `today-i` Electron AGENTS.md as the Yahpaz spec.

## Verify

- Android: `./gradlew :domain:test` and `:app:assembleDebug`. Pixel install: USB debugging + `adb install -r app/build/outputs/apk/debug/app-debug.apk`.
- Web: existing test script in `op-yh-26` when that repo changes.
- iOS: skip while on hold.
