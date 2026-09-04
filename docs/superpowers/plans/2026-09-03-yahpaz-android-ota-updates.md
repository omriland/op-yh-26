# Android OTA updates — Implementation Plan

> **Status: implemented.** Tasks 1–7 are done. Android code ships as
> `docs/superpowers/patches/2026-09-03-yahpaz-android-ota.patch`; web changes are on
> this branch. Task 8 (bootstrap release + on-device checks) needs the signing
> keystore and a real phone, so it stays open.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In-app download + PackageInstaller OTA for the sideloaded אבן דרך Android app, with soft and force update modes, using an extended `version.json` on yahpz.com.

**Architecture:** Extend the existing static manifest on Netlify. Android checks on boot, downloads the APK to app-private storage, verifies SHA-256, then commits a `PackageInstaller` session. Web release script writes `apkSha256` / size; `/android` copy notes in-app updates. No Play Store, no new backend tables.

**Tech Stack:** Kotlin + Jetpack Compose (`yahpaz-android`), OkHttp/Download to cache, `android.content.pm.PackageInstaller`, Vite/React + Netlify static files (`op-yh-26`).

## Global Constraints

- Hebrew-only UI, full RTL; no English on product surfaces
- Package `com.yahpz.responder`; same release signing key for all OTA builds
- Fail open if `version.json` cannot be fetched/parsed
- Never install an APK that fails SHA-256 (or size when present)
- Do not touch `yahpaz-ios`
- Prefer extending `2026-08-18` force-update flow; keep browser `apkUrl` as escape hatch
- Spec: `docs/superpowers/specs/2026-09-03-yahpaz-android-ota-updates-design.md`

## File map

| Path | Responsibility |
|---|---|
| `yahpaz-android/domain/.../AppUpdate.kt` | Pure version / soft / force decisions + SHA hex compare |
| `yahpaz-android/domain/.../AppUpdateTest.kt` | Unit tests for decisions |
| `yahpaz-android/app/.../AppUpdateApi.kt` (or existing) | Fetch/parse `version.json` including new fields |
| `yahpaz-android/app/.../ApkDownloader.kt` | Download to cache + progress callbacks |
| `yahpaz-android/app/.../ApkInstaller.kt` | Permission check + PackageInstaller session |
| `yahpaz-android/app/.../UpdateScreens.kt` (or RootScreen) | Soft dialog + force full-screen + progress |
| `yahpaz-android/app/src/main/AndroidManifest.xml` | `REQUEST_INSTALL_PACKAGES` |
| `yahpaz-android/scripts/build-release-apk.sh` | SHA-256 + size into `version.json` |
| `op-yh-26/public/android/version.json` | Live manifest |
| `op-yh-26/src/lib/androidDownload.ts` | Types for optional `apkSha256` / `apkSizeBytes` |
| `op-yh-26/src/pages/AndroidDownloadPage.tsx` | First-install + “updates inside app” copy |

---

### Task 1: Domain update decision helpers

**Files:**
- Modify or create: `yahpaz-android/domain/src/main/kotlin/com/yahpz/domain/AppUpdate.kt`
- Modify or create: `yahpaz-android/domain/src/test/kotlin/com/yahpz/domain/AppUpdateTest.kt`

**Interfaces:**
- Produces: `enum class UpdateMode { None, Soft, Force }`
- Produces: `fun decideUpdateMode(current: Int, min: Int, latest: Int): UpdateMode`
- Produces: `fun needsForceUpdate(current: Int, min: Int): Boolean` (keep if already present)
- Produces: `fun sha256Matches(expectedHex: String, actualHex: String): Boolean`

- [ ] **Step 1: Write failing tests**

```kotlin
@Test
fun forceWhenBelowMin() {
    assertEquals(UpdateMode.Force, decideUpdateMode(23, min = 24, latest = 25))
}

@Test
fun softWhenBetweenMinAndLatest() {
    assertEquals(UpdateMode.Soft, decideUpdateMode(24, min = 24, latest = 25))
}

@Test
fun noneWhenCurrentIsLatest() {
    assertEquals(UpdateMode.None, decideUpdateMode(25, min = 24, latest = 25))
}

@Test
fun noneWhenCurrentAboveLatest() {
    assertEquals(UpdateMode.None, decideUpdateMode(26, min = 24, latest = 25))
}

@Test
fun forceBeatsSoftEvenIfAlsoBelowLatest() {
    assertEquals(UpdateMode.Force, decideUpdateMode(20, min = 24, latest = 25))
}

@Test
fun sha256CompareIgnoresCase() {
    assertTrue(sha256Matches("AbCd", "abcd"))
    assertFalse(sha256Matches("ab", "cd"))
}
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `./gradlew :domain:test --tests 'com.yahpz.domain.AppUpdateTest'`  
Expected: FAIL (missing symbols or wrong behavior)

- [ ] **Step 3: Implement**

```kotlin
enum class UpdateMode { None, Soft, Force }

fun decideUpdateMode(current: Int, min: Int, latest: Int): UpdateMode = when {
    current < min -> UpdateMode.Force
    current < latest -> UpdateMode.Soft
    else -> UpdateMode.None
}

fun needsForceUpdate(current: Int, min: Int): Boolean = current < min

fun sha256Matches(expectedHex: String, actualHex: String): Boolean {
    val a = expectedHex.trim().lowercase()
    val b = actualHex.trim().lowercase()
    return a.isNotEmpty() && a == b
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `./gradlew :domain:test --tests 'com.yahpz.domain.AppUpdateTest'`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add domain/src/main/kotlin/com/yahpz/domain/AppUpdate.kt \
        domain/src/test/kotlin/com/yahpz/domain/AppUpdateTest.kt
git commit -m "feat(android): domain helpers for soft/force OTA modes"
```

---

### Task 2: Manifest model + fetch (Android)

**Files:**
- Modify: existing `AppUpdateApi` / `YahpazAPI` / bootstrap fetch that reads `version.json`
- Test: parsing unit test in `:app` or `:domain` if JSON DTO lives in domain

**Interfaces:**
- Consumes: `https://yahpz.com/android/version.json`
- Produces: data class with `minVersionCode`, `latestVersionCode`, `latestVersionName`, `apkUrl`, `apkSha256: String?`, `apkSizeBytes: Long?`, `messageHe: String?`

- [ ] **Step 1: Extend DTO**

```kotlin
data class AndroidVersionManifest(
    val minVersionCode: Int,
    val latestVersionCode: Int,
    val latestVersionName: String? = null,
    val apkUrl: String,
    val apkSha256: String? = null,
    val apkSizeBytes: Long? = null,
    val messageHe: String? = null,
)
```

Parse with existing JSON stack; treat missing `apkSha256` as null (triggers URL fallback later). Timeout ≈5s. On failure return null (fail open).

- [ ] **Step 2: Wire decideUpdateMode in bootstrap** after successful parse using `BuildConfig.VERSION_CODE`.

- [ ] **Step 3: Unit-test JSON parse** with and without `apkSha256`.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(android): parse apkSha256 and size from version.json"
```

---

### Task 3: APK downloader + SHA-256

**Files:**
- Create: `yahpaz-android/app/src/main/kotlin/.../update/ApkDownloader.kt`
- Create: test for hashing helper if extracted to domain; otherwise instrumented/manual checklist in PR

**Interfaces:**
- Consumes: `apkUrl`, optional expected size, destination `File`
- Produces: `Result` with file path + hex digest; progress `(bytesRead, totalOrNull)`

- [ ] **Step 1: Implement download to `context.cacheDir/updates/yahpaz-{versionCode}.apk`**

Use OkHttp (already in app) with streaming write. Delete partial file on failure.

- [ ] **Step 2: Hash file**

```kotlin
fun fileSha256Hex(file: File): String {
    val md = MessageDigest.getInstance("SHA-256")
    file.inputStream().use { input ->
        val buf = ByteArray(8192)
        while (true) {
            val n = input.read(buf)
            if (n <= 0) break
            md.update(buf, 0, n)
        }
    }
    return md.digest().joinToString("") { "%02x".format(it) }
}
```

- [ ] **Step 3: Gate install**

If `apkSha256` is null/blank → do not call installer; open `apkUrl` via `ACTION_VIEW` (legacy).  
If present and `!sha256Matches(expected, fileSha256Hex(file))` → delete file, surface Hebrew `הקובץ פגום. נסו שוב.`  
If `apkSizeBytes != null && file.length() != apkSizeBytes` → same error.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(android): download APK to cache and verify SHA-256"
```

---

### Task 4: PackageInstaller + unknown-sources permission

**Files:**
- Create: `yahpaz-android/app/src/main/kotlin/.../update/ApkInstaller.kt`
- Modify: `AndroidManifest.xml` — add `REQUEST_INSTALL_PACKAGES`
- Create: status receiver for install result if using session callback

**Interfaces:**
- Consumes: verified APK `File`
- Produces: launches system Install UI; on success process is replaced

- [ ] **Step 1: Manifest permission**

```xml
<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />
```

- [ ] **Step 2: Permission gate**

```kotlin
fun canInstallPackages(context: Context): Boolean =
    context.packageManager.canRequestPackageInstalls()

fun installPermissionSettingsIntent(context: Context): Intent =
    Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
        data = Uri.parse("package:${context.packageName}")
    }
```

Hebrew UI: explain that אבן דרך needs permission to install its own updates; button opens settings; on return, retry.

- [ ] **Step 3: PackageInstaller session**

```kotlin
val installer = context.packageManager.packageInstaller
val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
val sessionId = installer.createSession(params)
installer.openSession(sessionId).use { session ->
    session.openWrite("apk", 0, apkFile.length()).use { out ->
        apkFile.inputStream().use { input -> input.copyTo(out) }
        session.fsync(out)
    }
    val callback = Intent(/* your InstallResultReceiver */)
    val sender = PendingIntent.getBroadcast(
        context, sessionId, callback,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
    )
    session.commit(sender.intentSender)
}
```

Use the platform Install confirmation UI. Do not use deprecated `file://` + `ACTION_VIEW` for the primary path (fallback URL escape hatch may still use browser download).

- [ ] **Step 4: Manual device test** install over a previous signed debug/release build with the **same** keystore.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(android): PackageInstaller session for in-app OTA"
```

---

### Task 5: Soft + force UI (Compose)

**Files:**
- Modify: `RootScreen` / bootstrap gate composables from the existing force-update work
- Create or modify: update progress composable

**Interfaces:**
- Consumes: `UpdateMode`, manifest, downloader, installer
- Soft dismiss: in-memory for process lifetime

- [ ] **Step 1: Force screen**

- Full-screen, no dismiss  
- Title / body from `messageHe` or default `יש גרסה חדשה של האפליקציה. יש לעדכן כדי להמשיך.`  
- Primary: **עדכון עכשיו** → download → verify → install  
- Progress while downloading  
- Secondary text button: **הורדה מהאתר** → `apkUrl`  
- Errors with **נסו שוב**

- [ ] **Step 2: Soft prompt**

- After boot, when mode is Soft and not in fill / live-track overlay  
- Dialog: **עדכון** / **מאוחר יותר**  
- Dismiss stores flag in `AppModel` for this process only  

- [ ] **Step 3: Defer soft during fill/live-track**; show when those close if still Soft and not dismissed.

- [ ] **Step 4: Assemble debug and smoke**

Run: `./gradlew :app:assembleDebug`  
Expected: BUILD SUCCESSFUL

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(android): soft and force OTA UI with in-app install"
```

---

### Task 6: Release script writes SHA-256

**Files:**
- Modify: `yahpaz-android/scripts/build-release-apk.sh`
- Output consumed by: `op-yh-26/public/android/version.json` + versioned APK

- [ ] **Step 1: After signing the APK, compute hash and size**

```bash
APK_PATH="…/yahpaz-${VERSION_NAME}.apk"
SHA=$(sha256sum "$APK_PATH" | awk '{print $1}')
SIZE=$(wc -c < "$APK_PATH" | tr -d ' ')

cat > "$WEB_ANDROID_DIR/version.json" <<EOF
{
  "minVersionCode": ${MIN_VERSION_CODE},
  "latestVersionCode": ${VERSION_CODE},
  "latestVersionName": "${VERSION_NAME}",
  "apkUrl": "https://yahpz.com/android/yahpaz-${VERSION_NAME}.apk",
  "apkSha256": "${SHA}",
  "apkSizeBytes": ${SIZE},
  "messageHe": ""
}
EOF
cp "$APK_PATH" "$WEB_ANDROID_DIR/"
```

Document in script header: operators choose whether to bump `MIN_VERSION_CODE` (force) or leave it (soft-only).

- [ ] **Step 2: Commit script change in Android repo**

```bash
git commit -m "chore(android): write apkSha256 into version.json on release"
```

---

### Task 7: Web types + `/android` copy (`op-yh-26`)

**Files:**
- Modify: `src/lib/androidDownload.ts`
- Modify: `src/lib/androidDownload.test.ts` (optional field parse still works)
- Modify: `src/pages/AndroidDownloadPage.tsx`
- Modify: `public/android/version.json` when shipping a real hashed APK (ops; may be empty sha until first OTA release)

**Interfaces:**
- Extends `AndroidVersionManifest` with optional `apkSha256?: string` and `apkSizeBytes?: number`

- [ ] **Step 1: Extend type**

```ts
export type AndroidVersionManifest = {
  minVersionCode: number
  latestVersionCode?: number
  latestVersionName?: string
  apkUrl: string
  apkSha256?: string
  apkSizeBytes?: number
  messageHe?: string
}
```

Existing helpers ignore the new fields; no behavior change required for web download CTA.

- [ ] **Step 2: `/android` page** — after install steps, add one Hebrew sentence: updates after the first install happen **inside the app** (אין צורך להוריד שוב מהדפדפן בכל גרסה). Keep the download button for first install / escape hatch.

- [ ] **Step 3: Tests**

Run: `npx vitest run src/lib/androidDownload.test.ts`  
Expected: PASS

- [ ] **Step 4: Commit in op-yh-26**

```bash
git add src/lib/androidDownload.ts src/pages/AndroidDownloadPage.tsx
git commit -m "docs(web): Android download page notes in-app OTA updates"
```

---

### Task 8: Bootstrap ops + verification

**Files:** none new — release checklist

- [ ] **Step 1: Ship bootstrap OTA-capable build**

1. Build signed APK with Tasks 1–5.  
2. Run release script (Task 6) into `op-yh-26/public/android/`.  
3. Set `minVersionCode` to this build’s `versionCode` (forces one last browser-based update for old clients) **or** leave min lower and accept mixed open-URL vs OTA until adoption. Prefer raising min once.  
4. Deploy web so `version.json` + APK are live.  
5. On a device with the previous app: complete force update via old CTA once.  
6. Publish a **second** APK (latest+1) with soft-only (min unchanged): confirm in-app download + Install sheet + new versionCode + Super Admin **עדכני**.

- [ ] **Step 2: Negative tests on device**

- Corrupt APK / wrong sha in manifest → Hebrew corrupt message, no install  
- Revoke unknown-app permission → settings path works  
- Airplane mode at boot → app opens (fail open)

- [ ] **Step 3: Update project memory** in `op-yh-26/.cursor/memory/MEMORY.md` with: Android OTA via PackageInstaller + `apkSha256` in `version.json`; bootstrap force bump required once.

- [ ] **Step 4: Commit memory** if changed

```bash
git commit -m "docs: note Android in-app OTA release process"
```

---

## Self-review

| Spec requirement | Task |
|---|---|
| Approach A in-app PackageInstaller | 3–5 |
| Extended `version.json` + sha256 | 2, 6, 7 |
| Soft + force modes | 1, 5 |
| Fail open on manifest fetch | 2 |
| Unknown-sources for app package | 4 |
| Escape hatch `apkUrl` | 3, 5 |
| Release script | 6 |
| Bootstrap chicken-and-egg | 8 |
| Super Admin heartbeat unchanged | (no task — intentional) |
| No Play / no iOS | Global constraints |

No TBD placeholders. Types for `UpdateMode` / manifest fields are consistent across tasks.
