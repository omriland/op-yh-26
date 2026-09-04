# Yahpaz — Android OTA updates (sideload, no Play Store)

**Date:** 2026-09-03  
**Status:** Implemented (pending on-device verification and a signed release)  
**Repos:** `yahpaz-android` (primary), `op-yh-26` / yahpz.com (manifest + APK hosting)  
**Builds on:** `2026-08-18-yahpaz-android-sideload-force-update-design.md`, `2026-09-01-yahpaz-super-admin-android-install-design.md`

## Problem

אבן דרך for Android is deliberately **not** on the Play Store. Distribution today is a signed APK on `yahpz.com` plus an in-app **force-update gate** that opens `apkUrl` in the browser. Volunteers still must:

1. Download the APK manually  
2. Find the file  
3. Tap through the system installer  
4. Often re-enable “install unknown apps” for Chrome/Files  

That is friction every release. We need **over-the-air (OTA) updates**: the installed app detects a newer build, downloads it itself, and hands it to the system installer — without leaving the app for a browser download page.

## Honest platform constraint

On consumer Android (non–device-owner / non-MDM), **silent install without a user confirmation is not allowed**. Even “true OTA” still shows the system Install sheet once. The win vs today is: no browser, no hunting for the APK, progress in-app, checksum verification, and one clear Hebrew CTA.

Out of scope for that reason: silent background install, Play Feature Delivery, Play in-app updates API.

## Goal

1. **First install** still via `/android` on yahpz.com (unchanged).  
2. **Subsequent releases** update the existing `com.yahpz.responder` install via in-app download + `PackageInstaller`.  
3. Keep **hard force** when `versionCode < minVersionCode`.  
4. Add **soft update** when `minVersionCode ≤ versionCode < latestVersionCode` (nag, dismissible).  
5. Same signing key forever — Android only updates packages signed with the same cert.

## Approaches considered

| # | Approach | Pros | Cons |
|---|---|---|---|
| **A** | **In-app APK OTA** — extend `version.json`, download APK inside the app, verify SHA-256, `PackageInstaller` session | Full Hebrew UX; uses existing Netlify hosting; no new vendor; works offline-after-download; matches current ops | One user Install tap; must ship `REQUEST_INSTALL_PACKAGES`; need checksum + progress UI |
| B | Firebase App Distribution / third-party OTA (AppCenter, etc.) | Hosted CDN, tester lists | Extra account; English-leaning UX; poor fit for Hebrew field volunteers; still often opens browser; not “our” brand |
| C | Play Store unlisted / internal track | Google update plumbing | Contradicts “kept off Play Store”; Play Console, review surface, Google account policy |
| D | MDM / device owner silent install | True silent updates | Requires company-owned / enrolled devices — not volunteer phones |

**Recommendation: Approach A.** Extend the existing sideload contract; do not introduce Play or a third-party distribution product.

## Version contract (extended)

Static file (unchanged path): `https://yahpz.com/android/version.json`

```json
{
  "minVersionCode": 24,
  "latestVersionCode": 25,
  "latestVersionName": "0.3.14",
  "apkUrl": "https://yahpz.com/android/yahpaz-0.3.14.apk",
  "apkSha256": "abcdef0123456789…64 hex chars…",
  "apkSizeBytes": 18432000,
  "messageHe": "יש גרסה חדשה של האפליקציה. מומלץ לעדכן."
}
```

| Field | Role |
|---|---|
| `minVersionCode` | Hard floor. Below → blocking force update |
| `latestVersionCode` / `latestVersionName` | Soft + Super Admin “עדכני” stamp (already used) |
| `apkUrl` | HTTPS APK on yahpz.com (`/android/*.apk`) |
| `apkSha256` | **Required for in-app OTA.** Hex SHA-256 of the APK bytes. Reject install if mismatch |
| `apkSizeBytes` | Optional; progress UI + sanity check before download |
| `messageHe` | Optional Hebrew body on update screens |

**Rules:**

- Compare **integer `versionCode` only** (same as today).  
- Bump `latestVersionCode` on every published APK.  
- Bump `minVersionCode` only when old clients must stop (breaking API, critical bug). Soft updates do not require raising min.  
- Clients that only understand the old manifest (no `apkSha256`) keep today’s “open URL” behavior until they get one OTA-capable build — see **Bootstrap build** below.  
- Netlify: keep `Cache-Control: no-store` on `version.json`; short cache on APKs is fine.

## Update modes

```
current < min          → FORCE (blocking)
min ≤ current < latest → SOFT (banner / dialog, dismissible for session)
current ≥ latest       → none
fetch / parse fail     → fail open (no gate); log silently
```

### FORCE

- Full-screen block (existing pattern). No dismiss.  
- Primary CTA: **עדכון עכשיו** → in-app download → verify → system Install sheet.  
- Secondary (optional): **הורדה מהאתר** → opens `apkUrl` (escape hatch if PackageInstaller fails).  
- Copy default: `יש גרסה חדשה של האפליקציה. יש לעדכן כדי להמשיך.` Override with `messageHe` when non-empty.

### SOFT

- Non-blocking: dialog or top banner after boot (not mid–fill form).  
- Primary: **עדכון** (same download path).  
- Dismiss: **מאוחר יותר** — remember for this process / until next cold start (no persistent “never”).  
- Do not interrupt responder fill or live track; defer soft prompt until those overlays close.

## Android architecture

```
Boot / ON_START
    → GET version.json (≈5s timeout, fail open)
    → decide NONE | SOFT | FORCE
    → if SOFT|FORCE and user taps update:
         DownloadManager / OkHttp → app cache file
         SHA-256 == apkSha256
         PackageInstaller session (MODE_FULL_INSTALL)
         commit → system confirmation UI
         on success: app process replaced by new version
```

### Permissions / manifest

- `REQUEST_INSTALL_PACKAGES` (Android 8+).  
- Before starting install: if `canRequestPackageInstalls()` is false, show Hebrew steps to allow installs **for אבן דרך** (Settings intent `ACTION_MANAGE_UNKNOWN_APP_SOURCES`), then resume. Do **not** send users to Chrome’s install permission.  
- No `WRITE_EXTERNAL_STORAGE` needed if downloading to app-private cache.

### Integrity

1. Download to `context.cacheDir` (or `filesDir/updates`), unique name per `latestVersionCode`.  
2. Compute SHA-256; compare to `apkSha256` (case-insensitive hex). Mismatch → delete file, Hebrew error `הקובץ פגום. נסו שוב.`  
3. Optional: if `apkSizeBytes` present and downloaded size ≠ that value → same error.  
4. Only then create `PackageInstaller` session from the file stream.

### Signing

- Release APKs must always be signed with the **same upload/release keystore** used for the first sideloaded install. A key change forces uninstall + fresh install from `/android`.  
- Document keystore backup in Android ops notes (not in git). Document: never rotate casually.

### Network / UX

- Show determinate progress when `apkSizeBytes` known; otherwise indeterminate + downloaded MB.  
- Cancel download on user cancel (soft) or back (force keeps screen, allows retry).  
- Cellular: allow download (field volunteers); no Wi‑Fi-only gate in v1.  
- Resume: v1 may restart download on failure (simpler); ranged resume is a follow-up if APKs grow large.

### Heartbeat

Existing `report_android_session` continues unchanged. After a successful OTA, next cold start / foreground reports the new `VERSION_CODE`, so Super Admin **עדכני** updates without web changes.

## Website / ops (`op-yh-26`)

| Surface | Change |
|---|---|
| `version.json` | Add `apkSha256` (+ optional `apkSizeBytes`) on every release |
| `build-release-apk.sh` (Android repo) | After sign: `sha256sum` → write fields into `version.json`; copy versioned APK into `public/android/` |
| `/android` page | Keep first-install instructions; add one line that updates happen **inside the app** after install |
| Force-update open-URL path | Remains as escape hatch + for pre-OTA clients |
| Super Admin mark | No change (already compares `latestVersionCode`) |

No new Supabase tables or Edge Functions for v1. Manifest stays static on Netlify.

## Bootstrap build (chicken-and-egg)

Devices already on the “open URL” force-update build cannot in-app OTA until they install **one** OTA-capable APK.

**Ops sequence:**

1. Ship OTA-capable build as `latest` + raise `minVersionCode` to that build’s code (or leave soft for one release if willing to nag via old CTA).  
2. Volunteers update once via today’s browser flow (or `/android`).  
3. All later releases use in-app OTA only.

Recommend: one forced browser-based bump to the OTA client, then never rely on browser for updates again.

## Errors (Hebrew)

| Case | Behavior |
|---|---|
| `version.json` fail | Fail open; no update UI |
| Download network fail | `ההורדה נכשלה. בדקו את החיבור ונסו שוב.` + retry |
| SHA / size mismatch | `הקובץ פגום. נסו שוב.` + delete partial |
| Install permission denied | Guide to enable unknown apps for אבן דרך; retry |
| PackageInstaller fail / user cancels Install sheet | Soft: dismiss; Force: stay on block with retry |
| Missing `apkSha256` on manifest | Do not in-app install; fall back to opening `apkUrl` (safe for old ops) |

## Testing

**Domain (`yahpaz-android` `:domain`):**

- `needsForceUpdate(current, min)`  
- `needsSoftUpdate(current, min, latest)` — soft only when `current >= min && current < latest`  
- SHA-256 hex compare helper  

**App (instrumented / manual on device):**

- Soft prompt when behind latest  
- Force block when below min  
- Successful install over previous release (same signing key)  
- Tampered APK rejected  
- Deny install permission → settings path → success  
- Fail open offline at boot  

**Web:**

- Release script writes `apkSha256`  
- `androidDownload` types accept new optional fields (ignore unknown extras already OK)  
- `/android` copy mentions in-app updates  

## Out of scope

- Play Store / Play in-app updates  
- iOS (hold)  
- Silent MDM install  
- Delta / differential APKs  
- Staged rollout percentages (all clients see same `version.json`)  
- Push-triggered “update available” (can add later via FCM once Android push exists)  
- Changing Super Admin UI beyond existing עדכני mark  

## Implementation

Website (`op-yh-26`, this repo):

- `public/android/version.json` now carries `apkSha256` + `apkSizeBytes`
- `npm run android:checksum` regenerates them from the APK `apkUrl` points at; `--check` fails when stale
- `supportsInAppUpdate()` in `src/lib/androidDownload.ts`
- `/android` page states that later updates happen inside the app

Android (`yahpaz-android`): delivered as `docs/superpowers/patches/2026-09-03-yahpaz-android-ota.patch`
because this agent cannot push to that repository. See `docs/superpowers/patches/README.md`.

## Success criteria

1. Volunteer with OTA-capable build sees soft or force UI inside the app, taps once, confirms system Install, and runs the new `versionCode` without opening Chrome.  
2. Corrupt or wrong APK never installs.  
3. First-time users still install from `yahpz.com/android`.  
4. Super Admin continues to see version stamps after OTA.  
5. Ops release = build APK + update `version.json` (codes + sha256 + url) + deploy web `public/android/`.
