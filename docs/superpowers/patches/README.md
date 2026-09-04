# Cross-repo patches

Changes that belong to a sibling repository but were produced from `op-yh-26`.
Apply them in the target repo, review, then commit there — nothing here is
consumed by the website build.

## `2026-09-03-yahpaz-android-ota.patch` → `yahpaz-android`

In-app OTA updates (design: `../specs/2026-09-03-yahpaz-android-ota-updates-design.md`).

```bash
cd /Users/omrilandman/CursorProjects/today-i/yahpaz-android
git checkout -b android-ota-updates
git am /path/to/op-yh-26/docs/superpowers/patches/2026-09-03-yahpaz-android-ota.patch
```

Verified against `omriland/yahpaz-android@main` (`9545bd1`) with `git apply --check`.

Building a signed release APK requires the keystore behind the published builds
(`CN=Yahpaz`, cert SHA-256 `b35ec91aca13ab524f0382e548f1a3d4ef66076271c77c6d8e1135e4bb373045`).
Android rejects an update signed with any other key, so this must run on a
machine that has it. To host 0.3.14 for manual install without prompting anyone:

```bash
cd yahpaz-android
./gradlew :app:assembleRelease
KEEP_MANIFEST=1 WEB_BRANCH=cursor/android-ota-updates-plan-9eb4 \
  scripts/publish-apk-to-website.sh
```

Contents:

| File | Change |
|---|---|
| `domain/…/AppUpdate.kt` | `UpdateMode`, `decideUpdateMode`, `sha256Matches`, `canInstallInApp`, progress copy helpers |
| `domain/…/AppUpdateTest.kt` | 10 unit tests covering the above |
| `app/…/ApkUpdate.kt` | Download to app cache, SHA-256 + size verification, `PackageInstaller` session, install-status receiver |
| `app/…/AppUpdateCheck.kt` | Manifest gains `apkSha256` / `apkSizeBytes`; `checkAppUpdate` returns soft or force |
| `app/…/AppModel.kt` | Update state machine (download → verify → install), soft dismissal, foreground re-check |
| `app/…/RootScreen.kt` | Force screen installs in-app; new dismissible soft dialog; shared update controls |
| `AndroidManifest.xml` | `REQUEST_INSTALL_PACKAGES` + receiver registration |
| `app/build.gradle.kts` | versionCode 25 / versionName 0.3.14 |
| `scripts/*.sh` | Release scripts write `apkSha256` / `apkSizeBytes`, honor `MIN_VERSION_CODE`, and support `KEEP_MANIFEST=1` to host a build without announcing it |

Verified on this branch: `./gradlew :domain:test` (10 update tests pass),
`:app:compileDebugKotlin`, and `:app:assembleDebug` all succeed against
Android SDK 35. Device behavior (permission prompt, system install sheet,
install over a previous release) still needs a real phone.
