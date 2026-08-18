# Android sideload + force update — Implementation Plan

> **For agentic workers:** COMPLETE ALL STEPS. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Signed APK on yahpz.com + hard force-update in the Android app.

**Tech:** Kotlin domain + Compose, Vite/React on op-yh-26, Netlify static files.

---

### Task 1: Domain force-update helper (Android)

**Files:**
- Create: `yahpaz-android/domain/src/main/kotlin/com/yahpz/domain/AppUpdate.kt`
- Create: `yahpaz-android/domain/src/test/kotlin/com/yahpz/domain/AppUpdateTest.kt`

- [ ] `needsForceUpdate(currentVersionCode, minVersionCode)` → true iff current < min
- [ ] `./gradlew :domain:test`

### Task 2: App boot gate + UI

**Files:**
- Modify: `app/build.gradle.kts` (versionCode 2, buildConfig)
- Modify: `AppModel.kt`, `RootScreen.kt`, `YahpazAPI.kt` or new `AppUpdateApi.kt`
- Create: force-update composable (in RootScreen or Components)

- [ ] Fetch `https://yahpz.com/android/version.json` during bootstrap
- [ ] Block UI when forced; CTA opens apkUrl
- [ ] Fail open on network error

### Task 3: Signed release APK + script

**Files:**
- Create: `scripts/build-release-apk.sh`
- Output into `op-yh-26/public/android/`

### Task 4: Website download surfaces

**Files:**
- Create: `src/lib/androidDownload.ts` + test
- Create: `src/pages/AndroidDownloadPage.tsx`
- Modify: `LoginPage.tsx`, `SnykBadge.tsx`, `App.tsx`, styles, `netlify.toml` cache headers
- Create: `public/android/version.json` (+ APK from Task 3)

- [ ] `/android` route, login CTA, footer link
- [ ] `npm test` / typecheck for touched libs
