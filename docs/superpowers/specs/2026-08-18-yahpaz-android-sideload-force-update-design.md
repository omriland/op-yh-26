# Yahpaz — Android sideload + force update

**Date:** 2026-08-18  
**Status:** Approved  
**Repos:** `yahpaz-android`, `op-yh-26` (yahpz.com)  
**Out of scope:** Play Store, iOS force-update, soft/optional update, UA gate on the APK bytes

## Goal

Distribute אבן דרך for Android as a signed release APK from yahpz.com, with:

1. In-app **hard force update** when `versionCode < minVersionCode`
2. Website download surfaces for Android mobile browsers (login CTA, `/android`, footer)

## Version contract

Static file: `https://yahpz.com/android/version.json`

```json
{
  "minVersionCode": 2,
  "latestVersionCode": 2,
  "latestVersionName": "0.1.1",
  "apkUrl": "https://yahpz.com/android/yahpaz.apk",
  "messageHe": "יש גרסה חדשה של האפליקציה. יש להוריד ולהתקין כדי להמשיך."
}
```

Compare integer `versionCode` only. Bump `minVersionCode` together with a new APK when enforcing.

## Android app

- `versionCode = 2`, `versionName = "0.1.1"`, signed release
- On boot: GET `version.json` (≈5s timeout). Fail open if network/parse fails.
- If outdated: full-screen block (no dismiss) + CTA opens `apkUrl`
- Domain helper `needsForceUpdate(current, min)` with unit test

## Website

- `public/android/yahpaz.apk` + `public/android/version.json`
- `isAndroidMobile(ua)` — Android UA and not obvious desktop-only
- Login: Android → download banner/CTA
- Route `/android`: download + install steps on Android; else “פתח מדפדפן באנדרואיד”
- Footer (login + signed-in security badge): link to `/android`
- Direct APK URL works if known (no UA 403)

## Release

`yahpaz-android/scripts/build-release-apk.sh` → signed APK → copy into `op-yh-26/public/android/` + refresh `version.json`
