# Yahpaz — Android responder app (אבן דרך)

**Date:** 2026-08-17  
**Status:** Approved in brainstorming  
**Repo (new):** `yahpaz-android` — public, sibling of `yahpaz-ios`  
**Backend:** same Supabase as iOS / [yahpz.com](https://yahpz.com) (`yahpaz-2026`)  
**Mirrors:** native iOS app in `yahpaz-ios`

## Problem

Responders on Android have no native app. The iOS app already covers login, mine inbox, fill, shifts, availability, profile, and live track against the same backend.

## Goal

A dedicated native Android app that behaves like אבן דרך on iOS: Hebrew-only RTL, רשומה Field/Command look, same screens and the same Supabase Auth + RLS. First ship is a sideloadable Debug APK, not Play Store.

## Non-goals

- Play Store / Play Console
- Flutter, React Native, or a WebView of yahpz.com
- Sharing UI code with iOS
- FCM / Android push in this slice (table `device_tokens.platform` is `'ios'` only today)
- Fill-ready or live-track push
- New backend product features
- English UI
- Hive Apple/Google team for publishing

## Decisions

| Topic | Choice |
|---|---|
| Stack | Kotlin + Jetpack Compose, min SDK 26 (Android 8) |
| Package | `com.yahpz.responder` |
| Display name | אבן דרך |
| GitHub | `omrilandman/yahpaz-android`, public |
| Local path | `/Users/omrilandman/CursorProjects/today-i/yahpaz-android` |
| Auth | Email + password, same as iOS |
| RTL | Forced Hebrew (`he`), layout direction RTL |
| Domain | `:domain` JVM module with JUnit — port of `YahpazDomain` behavior, not a copy-paste of Swift |
| UI | `:app` Compose, Supabase Kotlin client |
| Push | Out of this slice. Token upsert + `'android'` platform check is a follow-up with FCM. |
| Distribution | Debug APK + optional GitHub Release / install page later, like iOS IPA |

## Architecture

```
[:app Compose]
    ├─ Auth / session
    ├─ Screens (login, inbox, fill, shifts, availability, profile, live track)
    └─ Supabase (anon key, user JWT)
[:domain]
    └─ fill validation, mine partition, shifts partition, plates, availability, track token
[Supabase]
    └─ same project as iOS and yahpz.com
```

No new Edge Functions for v1. Live-track pings reuse the existing `responder-track` / live location table the iOS app uses.

## Screens (parity with iOS)

Root gates, in order: booting → unsigned live-track token → login → must-change-password (profile only) → main tabs. Signed-in live-track is a full-screen overlay, same as iOS `fullScreenCover`.

| Tab / route | Behavior |
|---|---|
| Login | Email Next / password Go; Hebrew errors |
| האירועים שלי | Pending / logged tabs, shift grouping, fill CTA, event sheet, pull-to-refresh that does **not** treat cancel as load failure |
| השלמת הפרטים | Vehicle, odometers, route (multiline), treatment; draft + complete; same validation copy as domain |
| המשמרות שלי | Pending / future / logged; pull-to-refresh same rule |
| זמינות | זמין / לא זמין + optional return date |
| פרופיל | Name, callsign, lifetime stats, password change, sign out |
| Live track | `yahpaz://track?token=` and `https://yahpz.com` track links; location pings while assigned |

Visual: navy `#1D4E89`, same font files as iOS (IBM Plex Sans Hebrew, IBM Plex Mono, Suez One), Field cards, Command toasts. Material 3 is the engine; do not look like default Material.

## Domain port

Port these behaviors with tests, names can be Kotlin-idiomatic:

- Fill validation + event status from participations
- Mine inbox partition (pending vs logged windows), query match, stamps, empty copy
- Mine shifts partition + Hebrew weekday letter
- Plate format, availability write rules, track-token parse, ping cadence

Do not call the network from `:domain`.

## Data / API

Same tables and shapes as `yahpaz-ios` `YahpazAPI`:

- Session, profile, roles, `active == false` → sign out
- `fetchMyEvents` / `fetchMyShifts` (chunk `in (id)` at 100 if the list is large, matching web)
- Fill load/save + `apply_event_status_from_participations`
- Availability update
- Live location ping

Password reset still redirects to `https://yahpz.com/?set_password=1` (web), not a custom Android intent in v1.

## Errors

- Hebrew, no English fallbacks in UI
- Load failure: empty state + רענון; keep existing list on refresh cancel/error if data is already shown (toast), same as iOS after the pull-to-refresh fix
- Permission denied (location): live track explains and does not crash
- No crash on missing optional nested relations (shift lead, road, etc.)

## Tests and proof

- `:domain:test` covers the ported rules (parity with iOS `swift test` cases)
- `:app:assembleDebug` exit 0
- If an Android device or emulator is available: install Debug APK and launch
- Manual: login, inbox, one fill draft, availability toggle, sign out

## Rollout

1. Create repo + Gradle bootstrap (empty app runs).
2. Domain module + tests (red/green per slice).
3. Auth + root gates.
4. Inbox + fill.
5. Shifts + availability + profile.
6. Live track.
7. Debug APK; GitHub repo public. Install page / Play Store later.

## Follow-up (not this slice)

- Allow `device_tokens.platform = 'android'` and FCM, then תפוצה push to Android
- Play App Signing + store listing
- Install page like `omriland.github.io/yahpaz-ios`

## Out of scope (again)

Play Store, FCM, shared UI with iOS, wrapping yahpz.com.
