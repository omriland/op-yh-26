# iOS Ad Hoc Distribution — Walking Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install אבן דרך on a registered iPhone directly from yahpz.com over `itms-services://`, with the device UDID registered by hand.

**Architecture:** `yahpaz-ios` produces a signed Ad Hoc archive plus an OTA `manifest.plist` via `xcodebuild -exportArchive` with automatic signing. A publish script copies the IPA, manifest, icons, and a `version.json` into `op-yh-26/public/ios/`. The web app gains an `/ios` route that mirrors the existing `/android` page and renders an `itms-services://` install button. No database, no Edge Function, no enrollment — those are plan 2.

**Tech Stack:** Xcode 16+ / xcodegen / xcodebuild, Vite + React 19 + TypeScript, vitest, Netlify static hosting.

**Spec:** `docs/superpowers/specs/2026-09-04-yahpaz-ios-adhoc-selfhosted-distribution-design.md` (Units 3 and 4; Units 1, 2 and 5 are out of scope here).

## Global Constraints

- Bundle identifier is exactly `com.yahpz.responder`. Apple team is `477WWCHXU7`. Never publish under Hive team `5GXFELD6MM`.
- Xcode export `method` for Ad Hoc is **`release-testing`**. The pre-15.3 value `ad-hoc` is retired and will fail. The repo's existing plists already use the new naming (`app-store-connect`).
- Both the manifest URL and the IPA URL inside it **must be HTTPS on a publicly trusted certificate**. iOS silently refuses anything else.
- `itms-services://` works **only in Safari on iOS**. Chrome, Firefox, Edge and most in-app browsers do nothing at all, with no error.
- All product UI strings are Hebrew, RTL. No English in product surfaces.
- Design system is "רשומה" — `design-system-design-instructions/`. Reuse existing tokens (`--space-*`, `--surface-raised`, `--stroke-hairline`); add no new colors.
- Do not commit the distribution certificate, its private key, or any `.mobileprovision` to either repo.
- Do not add Netlify Functions. `netlify.toml` stays static assets and headers only.
- Do not kill or restart the user's `npm run dev` Vite server.
- The IPA and manifest use **fixed filenames** (`Yahpaz.ipa`, `manifest.plist`), unlike Android's versioned APK. The manifest embeds an absolute IPA URL, so a versioned filename would require regenerating the manifest URL on every release for no benefit. Freshness comes from cache headers.
- **`npx tsc --noEmit` checks nothing in this repo.** The root `tsconfig.json` is a solution file with `"files": []`, so it exits 0 in a fraction of a second without compiling `src`. Always typecheck with `npx tsc -p tsconfig.app.json --noEmit`, which is what `npm run build` runs.

---

### Task 1: Apple signing foundation

Manual portal work. No code. This task exists because everything downstream is blocked on it, and because it is the point at which we discover whether the paid membership is actually active.

**Files:**
- None. Verification only.

**Interfaces:**
- Produces: an `Apple Distribution` identity in the login keychain; an Ad Hoc provisioning profile for `com.yahpz.responder` containing at least one registered iPhone UDID.

- [ ] **Step 1: Confirm the current signing state**

Run: `security find-identity -v -p codesigning`

Expected before starting: exactly one line, `Apple Development: omriland@gmail.com (3D8PHMP398)`. If an `Apple Distribution` line already exists, skip to Step 4.

- [ ] **Step 2: Create the Apple Distribution certificate**

In Xcode: Settings → Accounts → select `omriland@gmail.com` → Manage Certificates → **+** → Apple Distribution.

If this option is greyed out or errors with a membership message, **stop and report to the user** — it means the account is still the free personal tier and the entire plan is blocked. Do not attempt a workaround.

- [ ] **Step 3: Verify the certificate landed**

Run: `security find-identity -v -p codesigning`

Expected: a second line containing `Apple Distribution: ... (477WWCHXU7)`.

- [ ] **Step 4: Register the pilot iPhone UDID**

Connect the iPhone by USB. In Xcode: Window → Devices and Simulators → select the device → copy the **Identifier**. Then at <https://developer.apple.com/account/resources/devices/list>, register it with a recognisable name.

Record the UDID in a scratch note; plan 2's `ios_devices` table will need it seeded.

- [ ] **Step 5: Create the dormant App Store Connect record**

At <https://appstoreconnect.apple.com/apps>, create a new iOS app for bundle `com.yahpz.responder`, name `אבן דרך`. Do **not** submit anything.

This is the TestFlight escape hatch named in the spec's risk section. It costs nothing now and is the only remedy if the 100-device ceiling is hit mid-year.

- [ ] **Step 6: Note the membership renewal date**

At <https://developer.apple.com/account> → Membership, record the renewal date. It is the device-list reset date and one of the spec's open questions.

---

### Task 2: Ad Hoc export options and build script

**Files:**
- Create: `/Users/omrilandman/CursorProjects/today-i/yahpaz-ios/scripts/export-options-adhoc.plist`
- Create: `/Users/omrilandman/CursorProjects/today-i/yahpaz-ios/scripts/build-adhoc.sh`
- Modify: `/Users/omrilandman/CursorProjects/today-i/yahpaz-ios/project.yml` (bump `CFBundleVersion` / `CURRENT_PROJECT_VERSION` from `4` to `5`)
- Delete: `/Users/omrilandman/CursorProjects/today-i/yahpaz-ios/scripts/build-ipa.sh`

**Interfaces:**
- Consumes: the Apple Distribution identity from Task 1.
- Produces: `dist/adhoc/Yahpaz.ipa` and `dist/adhoc/manifest.plist`, consumed by Task 7's publish script.

- [ ] **Step 1: Write the export options plist**

Create `scripts/export-options-adhoc.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>method</key>
	<string>release-testing</string>
	<key>destination</key>
	<string>export</string>
	<key>signingStyle</key>
	<string>automatic</string>
	<key>teamID</key>
	<string>477WWCHXU7</string>
	<key>stripSwiftSymbols</key>
	<true/>
	<key>manageAppVersionAndBuildNumber</key>
	<false/>
	<key>manifest</key>
	<dict>
		<key>appURL</key>
		<string>https://yahpz.com/ios/Yahpaz.ipa</string>
		<key>displayImageURL</key>
		<string>https://yahpz.com/ios/icon-57.png</string>
		<key>fullSizeImageURL</key>
		<string>https://yahpz.com/ios/icon-512.png</string>
	</dict>
</dict>
</plist>
```

`signingStyle: automatic` combined with `-allowProvisioningUpdates` in the next step is deliberate: Xcode regenerates the Ad Hoc profile on every build with **all** currently registered devices. Manual signing would require regenerating and re-downloading the profile by hand after each batch of new volunteers.

The `manifest` dict is what makes Xcode emit `manifest.plist` next to the IPA.

- [ ] **Step 2: Bump the build number**

In `project.yml`, change `CFBundleVersion: "4"` to `"5"` (under `info.properties`) and `CURRENT_PROJECT_VERSION: 4` to `5` (under `settings.base`). Leave `CFBundleShortVersionString` / `MARKETING_VERSION` at `1.0.0`.

- [ ] **Step 3: Write the build script**

Create `scripts/build-adhoc.sh`:

```bash
#!/bin/zsh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ARCHIVE="$ROOT/dist/Yahpaz-adhoc.xcarchive"
OUT="$ROOT/dist/adhoc"

if command -v xcodegen >/dev/null; then
  xcodegen generate
fi

rm -rf "$ARCHIVE" "$OUT"

xcodebuild archive \
  -scheme Yahpaz \
  -project Yahpaz.xcodeproj \
  -destination 'generic/platform=iOS' \
  -configuration Release \
  -archivePath "$ARCHIVE" \
  -allowProvisioningUpdates

xcodebuild -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportOptionsPlist "$ROOT/scripts/export-options-adhoc.plist" \
  -exportPath "$OUT" \
  -allowProvisioningUpdates

# Fail loudly if the embedded profile is not Ad Hoc or has no devices.
WORK=$(mktemp -d)
unzip -qq "$OUT/Yahpaz.ipa" -d "$WORK"
PROFILE="$WORK/Payload/Yahpaz.app/embedded.mobileprovision"
security cms -D -i "$PROFILE" > "$WORK/profile.plist"

DEVICES=$(/usr/libexec/PlistBuddy -c 'Print :ProvisionedDevices' "$WORK/profile.plist" 2>/dev/null | grep -c '^ ' || true)
EXPIRES=$(/usr/libexec/PlistBuddy -c 'Print :ExpirationDate' "$WORK/profile.plist")

if [ "$DEVICES" -lt 1 ]; then
  echo "ERROR: embedded profile has no provisioned devices — this build installs nowhere." >&2
  exit 1
fi

echo "✅ Ad Hoc IPA ready"
echo "   devices in profile: $DEVICES"
echo "   profile expires:    $EXPIRES"
ls -lh "$OUT/Yahpaz.ipa" "$OUT/manifest.plist"
rm -rf "$WORK"
```

Then: `chmod +x scripts/build-adhoc.sh`

The device-count guard is the cheap version of the spec's "fail loudly" requirement — a zero-device profile produces an IPA that silently installs on nothing.

- [ ] **Step 4: Delete the obsolete unsigned build script**

```bash
git rm scripts/build-ipa.sh
```

It built with `CODE_SIGNING_ALLOWED=NO` for AltStore. Leaving it invites someone to publish an unsigned IPA that no device can install over the air.

- [ ] **Step 5: Run the build**

Run: `./scripts/build-adhoc.sh`

Expected: `✅ Ad Hoc IPA ready`, a device count of at least 1, an expiry roughly 12 months out, and both `Yahpaz.ipa` and `manifest.plist` listed.

If export fails with a provisioning error, confirm Xcode is signed in to `omriland@gmail.com` and that the device from Task 1 Step 4 is registered.

- [ ] **Step 6: Inspect the generated manifest**

Run: `cat dist/adhoc/manifest.plist`

Expected: a `software-package` asset whose `url` is `https://yahpz.com/ios/Yahpaz.ipa`, and `metadata.bundle-identifier` equal to `com.yahpz.responder`. A mismatch here is the single most common cause of a silent OTA failure.

- [ ] **Step 7: Commit**

```bash
cd /Users/omrilandman/CursorProjects/today-i/yahpaz-ios
git add scripts/export-options-adhoc.plist scripts/build-adhoc.sh project.yml
git rm --cached scripts/build-ipa.sh 2>/dev/null || true
git commit -m "Build a signed Ad Hoc IPA with an OTA manifest"
```

---

### Task 3: iOS download helpers with tests

Pure TypeScript, TDD, no UI. Mirrors `src/lib/androidDownload.ts` deliberately so the two stay legible side by side.

**Files:**
- Create: `/Users/omrilandman/CursorProjects/today-i/op-yh-26/src/lib/iosDownload.ts`
- Create: `/Users/omrilandman/CursorProjects/today-i/op-yh-26/src/lib/iosDownload.test.ts`

**Interfaces:**
- Produces: `IOS_DOWNLOAD_PATH`, `IOS_VERSION_PATH`, `IOS_FOOTER_LINK`, `IosVersionManifest`, `isIosDevice(ua): boolean`, `isIosSafari(ua): boolean`, `isIosDownloadPath(pathname): boolean`, `itmsInstallHref(manifestUrl): string | null`, `fetchIosInstallHref(fetchImpl?): Promise<string | null>`. Tasks 4, 5, 6 and 8 all consume these.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/iosDownload.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import {
  IOS_DOWNLOAD_PATH,
  IOS_FOOTER_LINK,
  fetchIosInstallHref,
  isIosDevice,
  isIosDownloadPath,
  isIosSafari,
  itmsInstallHref,
} from './iosDownload'

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1'
const IPHONE_WEBVIEW =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
const MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'

describe('isIosDevice', () => {
  it('detects iPhone regardless of browser', () => {
    expect(isIosDevice(IPHONE_SAFARI)).toBe(true)
    expect(isIosDevice(IPHONE_CHROME)).toBe(true)
  })

  it('rejects Android, macOS and empty strings', () => {
    expect(isIosDevice(ANDROID)).toBe(false)
    expect(isIosDevice(MAC)).toBe(false)
    expect(isIosDevice('')).toBe(false)
  })
})

describe('isIosSafari', () => {
  it('accepts real mobile Safari', () => {
    expect(isIosSafari(IPHONE_SAFARI)).toBe(true)
  })

  it('rejects Chrome on iOS, which fails itms-services silently', () => {
    expect(isIosSafari(IPHONE_CHROME)).toBe(false)
  })

  it('rejects a bare in-app WKWebView', () => {
    expect(isIosSafari(IPHONE_WEBVIEW)).toBe(false)
  })

  it('rejects desktop Safari', () => {
    expect(isIosSafari(MAC)).toBe(false)
  })
})

describe('ios download paths', () => {
  it('matches /ios with or without a trailing slash', () => {
    expect(isIosDownloadPath('/ios')).toBe(true)
    expect(isIosDownloadPath('/ios/')).toBe(true)
    expect(isIosDownloadPath('/android')).toBe(false)
  })

  it('exposes footer copy', () => {
    expect(IOS_FOOTER_LINK.href).toBe(IOS_DOWNLOAD_PATH)
    expect(IOS_FOOTER_LINK.label).toBe('הורדת אפליקציית אייפון')
  })
})

describe('itmsInstallHref', () => {
  it('wraps a yahpz.com manifest url', () => {
    expect(itmsInstallHref('https://yahpz.com/ios/manifest.plist')).toBe(
      'itms-services://?action=download-manifest&url=https%3A%2F%2Fyahpz.com%2Fios%2Fmanifest.plist',
    )
  })

  it('rejects http, foreign hosts, non-plist paths and empties', () => {
    expect(itmsInstallHref('http://yahpz.com/ios/manifest.plist')).toBeNull()
    expect(itmsInstallHref('https://evil.example/ios/manifest.plist')).toBeNull()
    expect(itmsInstallHref('https://yahpz.com/ios/Yahpaz.ipa')).toBeNull()
    expect(itmsInstallHref('')).toBeNull()
  })
})

describe('fetchIosInstallHref', () => {
  it('reads manifestUrl from version.json', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        minBuild: 5,
        latestBuild: 5,
        manifestUrl: 'https://yahpz.com/ios/manifest.plist',
      }),
    )
    await expect(fetchIosInstallHref(fetchImpl as unknown as typeof fetch)).resolves.toBe(
      'itms-services://?action=download-manifest&url=https%3A%2F%2Fyahpz.com%2Fios%2Fmanifest.plist',
    )
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('returns null when version.json is missing', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 404 }))
    await expect(
      fetchIosInstallHref(fetchImpl as unknown as typeof fetch),
    ).resolves.toBeNull()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/iosDownload.test.ts`

Expected: FAIL — `Failed to resolve import "./iosDownload"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/iosDownload.ts`:

```ts
/** iOS Ad Hoc OTA install helpers for yahpz.com */

export const IOS_DOWNLOAD_PATH = '/ios'
export const IOS_VERSION_PATH = '/ios/version.json'

export const IOS_FOOTER_LINK = {
  label: 'הורדת אפליקציית אייפון',
  href: IOS_DOWNLOAD_PATH,
} as const

export type IosVersionManifest = {
  minBuild: number
  latestBuild?: number
  latestVersionName?: string
  manifestUrl: string
  messageHe?: string
}

/** True for iPhone / iPod. iPad is out of scope (TARGETED_DEVICE_FAMILY "1"). */
export function isIosDevice(userAgent: string): boolean {
  const ua = userAgent.trim()
  if (!ua) return false
  return /iPhone|iPod/i.test(ua)
}

/**
 * True only for real mobile Safari. Chrome (CriOS), Firefox (FxiOS), Edge
 * (EdgiOS), Opera and bare in-app WKWebViews all drop `itms-services://`
 * links on the floor with no error, so the page must warn instead.
 */
export function isIosSafari(userAgent: string): boolean {
  if (!isIosDevice(userAgent)) return false
  if (/CriOS|FxiOS|EdgiOS|OPiOS|OPT\//i.test(userAgent)) return false
  return /Safari/i.test(userAgent)
}

export function isIosDownloadPath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '') || '/'
  return path === IOS_DOWNLOAD_PATH
}

/** Build the OTA install URL, but only for an https yahpz.com .plist. */
export function itmsInstallHref(manifestUrl: string): string | null {
  const raw = manifestUrl?.trim()
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:') return null
    if (url.hostname !== 'yahpz.com') return null
    if (!url.pathname.endsWith('.plist')) return null
    return `itms-services://?action=download-manifest&url=${encodeURIComponent(url.toString())}`
  } catch {
    return null
  }
}

export async function fetchIosInstallHref(
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  try {
    const res = await fetchImpl(`${IOS_VERSION_PATH}?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return null
    const manifest = (await res.json()) as IosVersionManifest
    return itmsInstallHref(manifest.manifestUrl)
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/iosDownload.test.ts`

Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/iosDownload.ts src/lib/iosDownload.test.ts
git commit -m "Add iOS OTA install helpers"
```

---

### Task 4: Static assets and Netlify headers

**Files:**
- Create: `/Users/omrilandman/CursorProjects/today-i/op-yh-26/public/ios/version.json`
- Create: `/Users/omrilandman/CursorProjects/today-i/op-yh-26/public/ios/icon-57.png`
- Create: `/Users/omrilandman/CursorProjects/today-i/op-yh-26/public/ios/icon-512.png`
- Modify: `/Users/omrilandman/CursorProjects/today-i/op-yh-26/netlify.toml`

**Interfaces:**
- Consumes: nothing.
- Produces: `/ios/version.json` served with `no-store`, and the two manifest icons referenced by `export-options-adhoc.plist` in Task 2.

- [ ] **Step 1: Generate the manifest icons**

The OTA install sheet shows `display-image` (57px) and `full-size-image` (512px). Source them from the existing 1024px app icon:

```bash
cd /Users/omrilandman/CursorProjects/today-i/op-yh-26
mkdir -p public/ios
sips -z 57 57 \
  /Users/omrilandman/CursorProjects/today-i/yahpaz-ios/docs/app-store/AppIcon-1024.png \
  --out public/ios/icon-57.png
sips -z 512 512 \
  /Users/omrilandman/CursorProjects/today-i/yahpaz-ios/docs/app-store/AppIcon-1024.png \
  --out public/ios/icon-512.png
```

- [ ] **Step 2: Write the seed version.json**

Create `public/ios/version.json`. `minBuild` stays at `1` for now — the in-app force-update gate that reads it is plan 3, and shipping a live `minBuild` of `5` before the app can interpret it achieves nothing.

```json
{
  "minBuild": 1,
  "latestBuild": 5,
  "latestVersionName": "1.0.0",
  "manifestUrl": "https://yahpz.com/ios/manifest.plist",
  "messageHe": "יש גרסה חדשה של האפליקציה. יש להוריד ולהתקין כדי להמשיך."
}
```

- [ ] **Step 3: Add the Netlify headers**

In `netlify.toml`, immediately after the existing `/android/yahpaz.apk` block, insert:

```toml
[[headers]]
  for = "/ios/version.json"
  [headers.values]
    Cache-Control = "no-store"

[[headers]]
  for = "/ios/manifest.plist"
  [headers.values]
    Content-Type = "application/xml"
    Cache-Control = "no-store"

[[headers]]
  for = "/ios/Yahpaz.ipa"
  [headers.values]
    Content-Type = "application/octet-stream"
    Cache-Control = "public, max-age=300"
```

The manifest is `no-store` because it names the IPA and its bundle version; a cached copy after a release points iOS at stale metadata.

The catch-all `/*` → `/index.html` redirect at the bottom of the file does **not** shadow these: Netlify serves a matching static file before evaluating redirects. The existing `public/android/` directory alongside the `/android` SPA route is the working precedent.

- [ ] **Step 4: Verify the build still passes typecheck**

Run: `npx tsc -p tsconfig.app.json --noEmit`

Expected: no output, exit 0.

- [ ] **Step 5: Commit**

```bash
git add public/ios/version.json public/ios/icon-57.png public/ios/icon-512.png netlify.toml
git commit -m "Serve iOS install assets with OTA-safe headers"
```

---

### Task 5: Route wiring for `/ios`

**Files:**
- Modify: `/Users/omrilandman/CursorProjects/today-i/op-yh-26/src/lib/appRoute.ts`
- Modify: `/Users/omrilandman/CursorProjects/today-i/op-yh-26/src/lib/appRoute.test.ts:96,181`

**Interfaces:**
- Consumes: `isIosDownloadPath`, `IOS_DOWNLOAD_PATH` from Task 3.
- Produces: `ParsedAppLocation` variant `{ kind: 'ios' }` and `legalPage` value `'ios'`, both consumed by Task 6.

- [ ] **Step 1: Write the failing route tests**

`src/lib/appRoute.test.ts` already asserts the android route at lines 96 and 181. Add the iOS twins right after each.

After line 96:

```ts
    expect(parseAppPath('/ios')).toEqual({ kind: 'ios' })
```

After line 181:

```ts
    expect(readBootRoute('/ios').legalPage).toBe('ios')
```

And beside the `appPath` assertions near line 174:

```ts
    expect(appPath({ ...listState('profile'), legalPage: 'ios' })).toBe('/ios')
```

Run: `npx vitest run src/lib/appRoute.test.ts`

Expected: FAIL — `/ios` currently parses to `{ kind: 'home' }`, and TypeScript rejects `legalPage: 'ios'`.

- [ ] **Step 2: Extend the imports**

At the top of `src/lib/appRoute.ts`, beside the existing android import:

```ts
import { isAndroidDownloadPath, ANDROID_DOWNLOAD_PATH } from './androidDownload'
import { isIosDownloadPath, IOS_DOWNLOAD_PATH } from './iosDownload'
```

- [ ] **Step 3: Widen the two union types**

In `AppRouteState`:

```ts
  legalPage?: 'privacy' | 'android' | 'ios' | 'delete_data' | null
```

In `ParsedAppLocation`, add a variant after `{ kind: 'android' }`:

```ts
  | { kind: 'ios' }
```

- [ ] **Step 4: Parse the path**

In `parseAppPath`, directly after the android line:

```ts
  if (isAndroidDownloadPath(path)) return { kind: 'android' }
  if (isIosDownloadPath(path)) return { kind: 'ios' }
```

- [ ] **Step 5: Emit the path**

In `appPath`, directly after the android line:

```ts
  if (state.legalPage === 'android') return ANDROID_DOWNLOAD_PATH
  if (state.legalPage === 'ios') return IOS_DOWNLOAD_PATH
```

- [ ] **Step 6: Handle it at boot**

In `readBootRoute`, add a branch mirroring the android one, after it. Note the return type's `legalPage` union must be widened to include `'ios'` as well:

```ts
  if (parsed.kind === 'ios') {
    return {
      view: null,
      eventSurface: { kind: 'list' },
      shiftSurface: { kind: 'list' },
      legalPage: 'ios',
    }
  }
```

The function's declared return type changes from
`legalPage: 'privacy' | 'android' | 'delete_data' | null` to
`legalPage: 'privacy' | 'android' | 'ios' | 'delete_data' | null`.

- [ ] **Step 7: Typecheck**

Run: `npx tsc -p tsconfig.app.json --noEmit`

Expected: exit 0. Any error here means a `legalPage` union was missed — widen it rather than casting.

- [ ] **Step 8: Run the full test suite**

Run: `npx vitest run`

Expected: all green, including the three new `/ios` assertions from Step 1, and no regressions in `androidDownload`.

- [ ] **Step 9: Commit**

```bash
git add src/lib/appRoute.ts src/lib/appRoute.test.ts
git commit -m "Route /ios to the iPhone install page"
```

---

### Task 6: The `/ios` install page

**Files:**
- Create: `/Users/omrilandman/CursorProjects/today-i/op-yh-26/src/pages/IosDownloadPage.tsx`
- Modify: `/Users/omrilandman/CursorProjects/today-i/op-yh-26/src/App.tsx`
- Modify: `/Users/omrilandman/CursorProjects/today-i/op-yh-26/src/styles/components.css`

**Interfaces:**
- Consumes: `fetchIosInstallHref`, `isIosDevice`, `isIosSafari`, `IOS_FOOTER_LINK` from Task 3; `legalPage === 'ios'` from Task 5.
- Produces: `IosDownloadPage` component and an `openIosDownload()` handler on `App`.

- [ ] **Step 1: Write the page component**

Create `src/pages/IosDownloadPage.tsx`, mirroring `AndroidDownloadPage.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, Download } from 'lucide-react'
import { Button } from '../components/ui/Button'
import {
  IOS_FOOTER_LINK,
  fetchIosInstallHref,
  isIosDevice,
  isIosSafari,
} from '../lib/iosDownload'

type IosDownloadPageProps = {
  onBack: () => void
}

export function IosDownloadPage({ onBack }: IosDownloadPageProps) {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent
  const iphone = useMemo(() => isIosDevice(ua), [ua])
  const safari = useMemo(() => isIosSafari(ua), [ua])
  const [installHref, setInstallHref] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetchIosInstallHref().then((href) => {
      if (!cancelled) setInstallHref(href)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <article className="ios-download" data-theme="field">
      <div className="detail__back">
        <Button
          variant="ghost"
          onClick={onBack}
          icon={<ChevronRight size={20} strokeWidth={1.75} />}
        >
          חזרה
        </Button>
      </div>

      <header className="ios-download__header">
        <h1 className="t-title">אפליקציית אייפון</h1>
        <p className="t-body text-secondary">
          מטעמי אבטחה - האפליקציה אינה חשופה לחנות האפליקציות.
          <br />
          ההתקנה אפשרית רק במכשיר שנרשם מראש אצל מנהל המערכת.
        </p>
      </header>

      {iphone ? (
        <div className="ios-download__panel stack-3">
          {!safari && (
            <div className="banner banner--warning t-body" role="alert">
              יש לפתוח את העמוד הזה בדפדפן ספארי. בדפדפנים אחרים כפתור ההתקנה
              לא יגיב.
            </div>
          )}
          <ol className="ios-download__steps t-body">
            <li>ודאו שמסרתם למנהל המערכת את פרטי המכשיר ושקיבלתם אישור שהגרסה מוכנה.</li>
            <li>לחצו על «התקנת האפליקציה» בתחתית העמוד.</li>
            <li>באישור שמופיע - בחרו «התקן».</li>
            <li>סגרו את הדפדפן וחכו שהסמל יופיע במסך הבית. ההתקנה נמשכת מספר שניות.</li>
          </ol>
          {installHref ? (
            <a className="btn btn--primary btn--block" href={installHref}>
              <Download size={20} strokeWidth={1.75} aria-hidden="true" />
              התקנת האפליקציה
            </a>
          ) : (
            <Button type="button" block disabled>
              טוען קישור התקנה…
            </Button>
          )}
        </div>
      ) : (
        <div className="banner banner--info t-body" role="status">
          יש לפתוח את העמוד הזה מדפדפן ספארי באייפון כדי להתקין את האפליקציה.
          <br />
          קישור לשיתוף: yahpz.com{IOS_FOOTER_LINK.href}
        </div>
      )}
    </article>
  )
}
```

Note the deliberate difference from Android: the install anchor has **no `download` attribute**. `itms-services://` is a protocol handoff to iOS, not a file download, and `download` would break it.

- [ ] **Step 2: Wire the page into App.tsx**

Four edits, each mirroring its android neighbour.

Import, next to the `AndroidDownloadPage` import near line 36:

```tsx
import { IosDownloadPage } from './pages/IosDownloadPage'
```

Path helper, next to the `isAndroidDownloadPath` import near line 64:

```tsx
import { isIosDownloadPath } from './lib/iosDownload'
```

Handler, next to `openAndroidDownload`:

```tsx
  function openIosDownload() {
    setLegalPage('ios')
  }
```

Extend `closeLegalPage`'s path check to include the new route:

```tsx
    if (
      isAndroidDownloadPath(window.location.pathname) ||
      isIosDownloadPath(window.location.pathname) ||
      isDeleteDataPath(window.location.pathname) ||
      isPrivacyPath(window.location.pathname)
    ) {
```

In the `popstate` handler, after the android branch:

```tsx
      if (parsed.kind === 'ios') {
        setLegalPage('ios')
        return
      }
```

And the render branch, immediately after the `legalPage === 'android'` block:

```tsx
  if (legalPage === 'ios') {
    return (
      <div className="shell" data-theme="field">
        <main className="shell__main">
          <IosDownloadPage onBack={closeLegalPage} />
        </main>
      </div>
    )
  }
```

- [ ] **Step 3: Extend the stylesheet**

In `src/styles/components.css`, the `.android-download*` rules starting near line 2307 already express exactly the layout this page needs. Rather than duplicating them, widen each selector. Change these five selectors:

```css
.android-download,
.ios-download {

.android-download__header,
.ios-download__header {

.android-download__panel,
.ios-download__panel {

.android-download__steps,
.ios-download__steps {

.android-download a.btn,
.ios-download a.btn,
.login__android-actions a.btn {
```

leaving every declaration block unchanged.

- [ ] **Step 4: Typecheck and test**

Run: `npx tsc -p tsconfig.app.json --noEmit && npx vitest run`

Expected: exit 0, all tests green.

- [ ] **Step 5: Verify in the running dev server**

The user keeps Vite running on `http://localhost:5173`. Do not restart it; HMR picks this up.

Open `http://localhost:5173/ios` in a desktop browser. Expected: the Hebrew RTL page renders with the blue "יש לפתוח את העמוד הזה מדפדפן ספארי באייפון" info banner, since a desktop UA is not an iPhone.

- [ ] **Step 6: Commit**

```bash
git add src/pages/IosDownloadPage.tsx src/App.tsx src/styles/components.css
git commit -m "Add the /ios install page"
```

---

### Task 7: Publish script and footer link

**Files:**
- Create: `/Users/omrilandman/CursorProjects/today-i/yahpaz-ios/scripts/publish-ios.sh`
- Modify: `/Users/omrilandman/CursorProjects/today-i/op-yh-26/src/components/shell/SnykBadge.tsx:26-29,47-54`
- Modify: `/Users/omrilandman/CursorProjects/today-i/op-yh-26/src/components/shell/AppShell.tsx:116,137,183`
- Modify: `/Users/omrilandman/CursorProjects/today-i/op-yh-26/src/pages/LoginPage.tsx:24,34,446-453`
- Modify: `/Users/omrilandman/CursorProjects/today-i/op-yh-26/src/App.tsx:705,788,887`

**Interfaces:**
- Consumes: `dist/adhoc/Yahpaz.ipa` and `dist/adhoc/manifest.plist` from Task 2; `IOS_FOOTER_LINK` from Task 3.
- Produces: populated `op-yh-26/public/ios/`, ready for Task 8.

- [ ] **Step 1: Write the publish script**

Create `yahpaz-ios/scripts/publish-ios.sh`:

```bash
#!/bin/zsh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WEB="/Users/omrilandman/CursorProjects/today-i/op-yh-26"
SRC="$ROOT/dist/adhoc"
DEST="$WEB/public/ios"

if [ ! -f "$SRC/Yahpaz.ipa" ] || [ ! -f "$SRC/manifest.plist" ]; then
  echo "ERROR: run ./scripts/build-adhoc.sh first." >&2
  exit 1
fi

mkdir -p "$DEST"
cp "$SRC/Yahpaz.ipa" "$DEST/Yahpaz.ipa"
cp "$SRC/manifest.plist" "$DEST/manifest.plist"

# Read the shipped build number straight out of the IPA so version.json
# can never drift from the binary it describes.
WORK=$(mktemp -d)
unzip -qq "$SRC/Yahpaz.ipa" -d "$WORK"
PLIST="$WORK/Payload/Yahpaz.app/Info.plist"
BUILD=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$PLIST")
NAME=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$PLIST")
rm -rf "$WORK"

MIN=$(/usr/bin/python3 -c "import json,sys; print(json.load(open('$DEST/version.json'))['minBuild'])")

cat > "$DEST/version.json" <<JSON
{
  "minBuild": $MIN,
  "latestBuild": $BUILD,
  "latestVersionName": "$NAME",
  "manifestUrl": "https://yahpz.com/ios/manifest.plist",
  "messageHe": "יש גרסה חדשה של האפליקציה. יש להוריד ולהתקין כדי להמשיך."
}
JSON

echo "✅ published build $BUILD ($NAME) to $DEST"
echo "   minBuild left at $MIN — raise it by hand only when forcing an update"
```

Then: `chmod +x scripts/publish-ios.sh`

`minBuild` is deliberately preserved rather than recomputed. Forcing an update is a decision, not a side effect of publishing.

- [ ] **Step 2: Run it**

Run: `cd /Users/omrilandman/CursorProjects/today-i/yahpaz-ios && ./scripts/publish-ios.sh`

Expected: `✅ published build 5 (1.0.0)`, and `op-yh-26/public/ios/` now holds `Yahpaz.ipa`, `manifest.plist`, `version.json`, and both icons.

- [ ] **Step 3: Add the footer link**

The footer links are not plain anchors — they are callback buttons threaded down from `App.tsx`, so a new `onOpenIos` prop has to follow the same path `onOpenAndroid` already takes: `App` → `LoginPage`, and `App` → `AppShell` → `SnykBadge`.

In `src/components/shell/SnykBadge.tsx`, add the import beside the android one:

```tsx
import { IOS_FOOTER_LINK } from '../../lib/iosDownload'
```

widen the props:

```tsx
export function SnykBadge({
  onOpenPrivacy,
  onOpenAndroid,
  onOpenIos,
}: {
  onOpenPrivacy: () => void
  onOpenAndroid?: () => void
  onOpenIos?: () => void
}) {
```

and add a block directly after the existing `onOpenAndroid` block, before the closing `</footer>`:

```tsx
      {onOpenIos ? (
        <>
          <span className="security-badge__sep" aria-hidden="true" />
          <button type="button" className="security-badge__link" onClick={onOpenIos}>
            {IOS_FOOTER_LINK.label}
          </button>
        </>
      ) : null}
```

In `src/components/shell/AppShell.tsx`, add `onOpenIos?: () => void` to the props type beside `onOpenAndroid` (line 116), destructure it (line 137), and pass it through (line 183):

```tsx
            <SnykBadge
              onOpenPrivacy={onOpenPrivacy}
              onOpenAndroid={onOpenAndroid}
              onOpenIos={onOpenIos}
            />
```

In `src/pages/LoginPage.tsx`, add the import, add `onOpenIos?: () => void` to the props type (line 24), destructure it (line 34), and add a sibling to the footer block at lines 446-453 — mirroring its button/anchor fallback exactly:

```tsx
          <span className="login__footer-sep" aria-hidden="true" />
          {onOpenIos ? (
            <button type="button" className="login__footer-link" onClick={onOpenIos}>
              {IOS_FOOTER_LINK.label}
            </button>
          ) : (
            <a className="login__footer-link" href={IOS_FOOTER_LINK.href}>
              {IOS_FOOTER_LINK.label}
            </a>
          )}
```

Finally in `src/App.tsx`, add `onOpenIos={openIosDownload}` beside each of the three existing `onOpenAndroid={openAndroidDownload}` props (lines 705, 788, 887). `openIosDownload` was defined in Task 6 Step 2.

Leave the in-body Android download CTA at `LoginPage.tsx:189` alone. It is an Android-specific prompt shown to Android visitors; an iOS equivalent depends on enrollment state and belongs in plan 2.

- [ ] **Step 4: Typecheck and test**

Run: `cd /Users/omrilandman/CursorProjects/today-i/op-yh-26 && npx tsc -p tsconfig.app.json --noEmit && npx vitest run`

Expected: exit 0, all green.

- [ ] **Step 5: Commit both repos**

```bash
cd /Users/omrilandman/CursorProjects/today-i/yahpaz-ios
git add scripts/publish-ios.sh
git commit -m "Publish the Ad Hoc build to yahpz.com"

cd /Users/omrilandman/CursorProjects/today-i/op-yh-26
git add public/ios src/components/shell/SnykBadge.tsx src/pages/LoginPage.tsx
git commit -m "Ship the first iOS Ad Hoc build and footer link"
```

---

### Task 8: End-to-end verification on a real iPhone

The only task that proves the plan worked. Everything before it is unverified until this passes.

**Files:**
- None.

**Interfaces:**
- Consumes: everything.

- [ ] **Step 1: Deploy to production**

Push `infra/bootstrap`. Wait for the Netlify deploy on https://yahpz.com to report ready.

- [ ] **Step 2: Verify the assets are served correctly**

```bash
curl -sI https://yahpz.com/ios/manifest.plist | head -20
curl -sI https://yahpz.com/ios/Yahpaz.ipa | head -20
curl -s  https://yahpz.com/ios/version.json
```

Expected: `200` for all three; `content-type: application/xml` on the manifest; `content-type: application/octet-stream` and a multi-megabyte `content-length` on the IPA; `cache-control: no-store` on the manifest and version.json.

An HTML body on the manifest request means the SPA catch-all swallowed it — fix that before continuing, because iOS gives no error for it.

- [ ] **Step 3: Confirm the manifest points at a real IPA**

```bash
curl -s https://yahpz.com/ios/manifest.plist | grep -A1 software-package
```

Expected: `https://yahpz.com/ios/Yahpaz.ipa`, matching the URL that returned 200 above.

- [ ] **Step 4: Install on the registered iPhone**

On the iPhone from Task 1 Step 4, in **Safari**, open `https://yahpz.com/ios`.

Expected: the Hebrew page, no Safari warning banner, and an enabled `התקנת האפליקציה` button. Tap it, then confirm `התקן` in the iOS sheet, and watch the אבן דרך icon appear on the home screen.

- [ ] **Step 5: Launch it**

Open the app. Expected: it launches straight to the Hebrew login screen with no "untrusted developer" prompt. Ad Hoc builds signed with a distribution certificate need no trust step — if iOS asks you to trust a developer, the build was signed with a development certificate and Task 2 needs revisiting.

Log in and confirm the responder inbox loads against the live Supabase backend.

- [ ] **Step 6: Confirm the negative cases**

On the same iPhone, open `https://yahpz.com/ios` in **Chrome**. Expected: the orange Hebrew warning telling the user to switch to Safari.

On an **unregistered** iPhone, tap install in Safari. Expected: iOS downloads and then refuses with an install failure. This is the device-cap behaviour volunteers will hit before enrollment exists, and it is exactly what plan 2 removes.

- [ ] **Step 7: Record the outcome**

Update the spec's rollout section with the verified date and the profile expiry from Task 2 Step 5. The expiry date is what plan 3's guard counts down to.

---

### Task 9: Retire the AltStore install path

The old sideload route must not outlive the new one. `yahpaz-ios/README.md`, the GitHub Pages
site at `omriland.github.io/yahpaz-ios`, and `docs/altstore.json` all still tell volunteers to
install through AltStore — a path whose free signature expires every 7 days and whose build
script Task 2 deletes. Leaving them live points people at something that no longer exists.

**Files:**
- Delete: `/Users/omrilandman/CursorProjects/today-i/yahpaz-ios/docs/altstore.json`
- Modify: `/Users/omrilandman/CursorProjects/today-i/yahpaz-ios/docs/index.html`
- Modify: `/Users/omrilandman/CursorProjects/today-i/yahpaz-ios/README.md`

**Interfaces:**
- Consumes: the `/ios` page from Task 6 and the scripts from Tasks 2 and 7.

- [ ] **Step 1: Replace the GitHub Pages install page**

Rewrite `docs/index.html` as a signpost: keep the existing `:root` custom properties, `body`,
`main`, `h1`, `.kicker`, `.card`, `a.btn` and `.note` rules verbatim so it still looks like the
product, and replace the whole `<main>` body with a single card. Add
`<link rel="canonical" href="https://yahpz.com/ios" />` and
`<meta http-equiv="refresh" content="5; url=https://yahpz.com/ios" />` in the head.

Card copy, Hebrew, exactly:

- `<h2>` — `ההתקנה עברה לאתר יחפ״צ`
- `<p>` — `העמוד הזה כבר לא בשימוש. ההתקנה מתבצעת עכשיו ישירות מ־yahpz.com, בדפדפן ספארי באייפון.`
- `a.btn` to `https://yahpz.com/ios` — `מעבר לעמוד ההתקנה`
- `.note` — `ההתקנה אפשרית רק במכשיר שנרשם מראש אצל מנהל המערכת. אם עוד לא נרשמתם - פנו אליו.`

- [ ] **Step 2: Rewrite the README install section**

Replace the `**Install:**` line with `**Install:** [yahpz.com/ios](https://yahpz.com/ios) — Safari on iPhone only`,
and replace the whole `## Install` section with the Ad Hoc explanation: no App Store, no
TestFlight, no AltStore; a device installs only if its UDID was registered in team
`477WWCHXU7` *before* the build was signed; Safari only; the 100-device and 12-month limits;
a link to the spec; and a "Cutting a release" block naming `./scripts/build-adhoc.sh` then
`./scripts/publish-ios.sh`.

In the `## Build` section, drop the `./scripts/build-ipa.sh` line — Task 2 deleted that script.

- [ ] **Step 3: Confirm nothing still points at AltStore**

Run: `rg -n "altstore|AltStore|build-ipa|releases/download" README.md docs/`

Expected: the only hit is the prose sentence in the README that explicitly says AltStore is
no longer used. A hit in `docs/` means the Pages site still advertises the dead path.

- [ ] **Step 4: Commit**

```bash
cd /Users/omrilandman/CursorProjects/today-i/yahpaz-ios
git rm docs/altstore.json
git add README.md docs/index.html
git commit -m "Retire the AltStore install path for yahpz.com/ios"
```

---

## Out of scope — the follow-on plans

- **Plan 2 — enrollment and admin console:** `ios_devices` migration, the `ios-enroll` Edge Function serving a per-user `.mobileconfig`, the admin device console with slots-used-of-100, and the "your build is ready" notification. Until it exists, UDIDs are collected by hand and registered in the Apple portal manually, which is workable for the pilot and for one batch.
- **Plan 3 — in-app guards:** the `version.json` force-update gate and the `embedded.mobileprovision` expiry warning, both with domain helpers and unit tests in `YahpazDomain`. Task 4 ships `minBuild: 1` precisely so that nothing enforces a gate no client can yet read.
