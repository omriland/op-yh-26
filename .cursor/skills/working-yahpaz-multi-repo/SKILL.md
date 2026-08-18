---
name: working-yahpaz-multi-repo
description: Use when working on אבן דרך, Yahpaz, yahpaz-ios, yahpaz-android, yahpz.com, op-yh-26, responder fill/inbox/shifts, or a feature that might touch iOS and Android.
---

# Working on Yahpaz (multi-repo)

Two native apps, one backend. A change in one app does **not** apply to the other.

## Repos

| Client | Path | GitHub |
|---|---|---|
| iOS (SwiftUI) | `/Users/omrilandman/CursorProjects/today-i/yahpaz-ios` | `omriland/yahpaz-ios` |
| Android (Compose) | `/Users/omrilandman/CursorProjects/today-i/yahpaz-android` | `omriland/yahpaz-android` |
| Web + Edge + specs | `/Users/omrilandman/CursorProjects/today-i/op-yh-26` | existing yahpz web repo |

GitHub user is **`omriland`**, not `omrilandman`. Bundle/package: `com.yahpz.responder`. Display name: אבן דרך. Hebrew-only RTL. Field/Command look (`#1D4E89`).

Backend: Supabase `yahpaz-2026` (`https://rtvizpsfvtjowbimugns.supabase.co`). Same Auth, RLS, tables, edge functions for all clients.

Cursor workspace is often **multi-root: iOS + Android**. Edit the repo that owns the file. Do not assume the open folder is the only client.

## Route the work

If the user names a platform, only that repo.

If they say “the app”, “responders”, or a product feature without a platform:

1. Say it is two codebases.
2. Default to **both iOS and Android** for responder UX (parity).
3. Touch **web/edge/DB once** if the API or admin UI must change.
4. Ask only when the feature is clearly one-sided (e.g. APNs vs FCM, Play vs TestFlight).

| Kind of change | Where |
|---|---|
| Validation, pending/logged split, plates, availability rules | Port in **both** `YahpazDomain` (iOS) and `:domain` (Android). Keep tests in parity. Not a shared library. |
| Screen copy, layout, navigation | Each UI separately (SwiftUI / Compose) |
| New column, RPC, RLS, edge function | `op-yh-26` + migration; then both apps if they consume it |
| Admin / תפוצה / unit broadcast | Web (`op-yh-26`) unless the phone must show or send something new |
| Push | iOS APNs is separate from Android FCM (FCM was out of the first Android slice) |

## Do not

- Ship a responder feature on one phone OS and call it done.
- Copy-paste Swift into Kotlin (or the reverse) without matching tests and Hebrew copy.
- Publish under Hive team `5GXFELD6MM`. iOS signing is personal team.
- Treat `today-i` Electron AGENTS.md as the Yahpaz spec.

## Verify

- iOS: `swift test` (domain) + install to the connected iPhone when UI changed.
- Android: `./gradlew :domain:test` and `:app:assembleDebug`. Pixel install: USB debugging + `adb install -r app/build/outputs/apk/debug/app-debug.apk`.
- Web: existing test script in `op-yh-26` when that repo changes.
