# Yahpaz iOS — Ad Hoc self-hosted distribution from yahpz.com

**Date:** 2026-09-04
**Status:** Draft — awaiting review
**Repos:** `yahpaz-ios`, `op-yh-26` (yahpz.com), Supabase `yahpaz-2026`
**Supersedes:** the AltStore / unsigned-IPA install path in `yahpaz-ios/README.md`
**Out of scope:** App Store listing, TestFlight, Apple Business Manager custom apps, MDM, iPad support

## Context

Native iOS was on hold (`yahpaz-ios-on-hold.mdc`). The user explicitly lifted the hold on
2026-09-04 to build iOS distribution. Android already ships as a signed APK from
`yahpz.com/android` with a `version.json` force-update contract
(`2026-08-18-yahpaz-android-sideload-force-update-design.md`). This spec brings iOS to the
closest equivalent Apple permits.

### Why Ad Hoc and not the alternatives

The originally requested flow — "volunteers trust me as a developer once, then install
anything from my site" — is Apple's **Enterprise** in-house distribution. It requires the
Apple Developer Enterprise Program: $299/yr, a legal entity with **100+ employees**, an
Apple verification interview, and a binding commitment to distribute only to *employees*.
Volunteers are not employees. Apple audits and revokes, and revocation instantly disables
the app on every device. Not available to us.

Evaluated and rejected:

- **TestFlight public link** — no device cap, but installs go through Apple's TestFlight
  app with beta framing, every build hard-expires after 90 days, and the first build of
  each version needs Beta App Review. Recommended by the analysis; the user chose the
  self-hosted path deliberately, accepting the device cap in exchange for installing
  directly from yahpz.com.
- **Apple Business Manager custom app** — no expiry, no cap, unlisted. Needs an
  organization account with a D-U-N-S number, which we do not have (membership is a paid
  **individual** account). Revisit if the עמותה registers.

### Hard constraints this design lives inside

| Constraint | Value | Consequence |
|---|---|---|
| Registered iPhones | 100 per membership year | Hard ceiling; no mid-year increase |
| Device list reset | Only at membership renewal | A full roster must be re-added at reset |
| Provisioning profile life | 12 months | App stops launching for everyone at expiry |
| Distribution certificate life | 12 months | Must be renewed and the build re-signed |
| Signing input | Every UDID must be in the profile **before** signing | New volunteer ⇒ rebuild for everyone |
| OTA transport | `itms-services://`, HTTPS only, **Safari only** | Chrome/Firefox on iOS silently do nothing |
| Auto-update | None | The app must police its own version |

Current fleet: 40–80 iPhones, growing roughly 3/month, onboarding batchable.

**Named risk:** at 80 devices and +3/month the 100-slot ceiling is reached inside a year,
with no mid-year remedy. The admin console (Unit 2) exists to make that visible early. The
documented escape hatch is switching to TestFlight, so the App Store Connect app record for
`com.yahpz.responder` must be created and kept alive even though we do not use it.

### Accepted risks

**The published IPA exposes every registered device UDID. Accepted 2026-09-04.**
`Payload/Yahpaz.app/embedded.mobileprovision` inside `https://yahpz.com/ios/Yahpaz.ipa` is
readable by anyone who downloads the file. It lists the Apple team ID and the complete
`ProvisionedDevices` array — one UDID today, up to 100 volunteers' devices after batch
enrollment — and each published build records that roster in git history permanently.

This is not fixable within OTA distribution: iOS's install daemon cannot present
credentials, so the IPA must be anonymously fetchable over HTTPS. Serving it from an
unguessable per-release path was considered and rejected as security through obscurity that
would also break the fixed-filename manifest contract. The exposure is accepted because a
UDID on its own is inert — Apple removed app access to it in iOS 7, it grants no access to
the device, and it cannot be used to enroll a device in someone else's team.

**iPhones in Safari's "Request Desktop Website" mode cannot install. Accepted 2026-09-04.**
That per-site setting makes an iPhone report a `Macintosh` user agent, so `isIosDevice`
returns false and `/ios` hides the install button behind the "open this on an iPhone"
notice. The available fix — falling back to `navigator.maxTouchPoints` — would also show the
button to iPads, which cannot run the app at all (`UIDeviceFamily [1]`), turning a rare
confusing case into a common one. The setting is rare, non-default, and the page already
tells the reader to use Safari on an iPhone. Revisit only if a volunteer actually hits it.

## Current state

- `yahpaz-ios` team `477WWCHXU7`, bundle `com.yahpz.responder`, deployment target iOS 17.
- Keychain holds only an `Apple Development` identity; **no `Apple Distribution` certificate
  exists yet** and there are zero provisioning profiles installed. Minting the distribution
  certificate is task zero and doubles as the check that the paid membership is live.
- `scripts/build-ipa.sh` builds with `CODE_SIGNING_ALLOWED=NO` and hand-zips a `Payload/`
  folder — an unsigned IPA for AltStore. It is replaced entirely.
- `scripts/export-options-*.plist` already use post-Xcode-15.3 method naming
  (`app-store-connect`), so ad hoc export uses **`release-testing`**, not the retired
  `ad-hoc` value.
- Release entitlements declare `aps-environment: production`.

## Architecture

Five units with separate owners and interfaces.

```
volunteer iPhone                  yahpz.com (op-yh-26)         Supabase              yahpaz-ios (local)
──────────────                    ────────────────────         ────────              ──────────────────
 1. open /ios in Safari  ───────▶ Unit 4: install page
 2. tap "רישום מכשיר"    ───────▶                      ─────▶ Unit 1: ios-enroll
                                                                GET  → .mobileconfig
 3. Settings → install profile ──────────────────────────────▶  POST → UDID captured
                                                                       ios_devices(pending)
                                  Unit 2: admin console ◀──────────────┘
                                    slots used / 100
                                    export UDID batch  ──────────────────────────────▶ 4. register in portal
                                                                                        regenerate profile
                                                                                        Unit 3: build-adhoc.sh
                                  public/ios/*.ipa      ◀─────────────────────────────  publish-ios.sh
                                  public/ios/manifest.plist
                                  public/ios/version.json
 5. notified by email ◀───────── send-email (existing)
 6. tap install (itms-services) ▶ Unit 4 → OTA install
 7. app boots ──────────────────▶ version.json          Unit 5: force-update + expiry guard
```

---

## Unit 1 — Device enrollment service

> **Superseded for implementation detail (2026-09-05):** Plan 2 enrollment, approval
> statuses, `super_admin` gate, and semi-auto publish are specified in
> `2026-09-05-yahpaz-ios-udid-enrollment-approval-design.md`. Keep this section for
> architectural context; prefer the 2026-09-05 doc when building.

**Purpose:** capture an iPhone's UDID from a non-technical volunteer with no Mac, and bind
it to their Yahpaz identity.

**Why it must exist:** iOS does not display the UDID anywhere in Settings. The only
self-service mechanism Apple provides is a *Profile Service* configuration profile: the
device installs it and POSTs its own attributes to a callback URL. Third-party "get my
UDID" websites do this, but they would receive the device identifiers of every volunteer
in the unit and could not associate them with `profiles`. We host it ourselves.

**Component:** Supabase Edge Function `ios-enroll`, `verify_jwt = false` (the device POST
carries no session).

Two routes:

- `GET /ios-enroll/profile?token=<enroll_token>`
  Returns `Content-Type: application/x-apple-aspen-config` — a `.mobileconfig` of
  `PayloadType = Profile Service` requesting attributes `UDID`, `PRODUCT`, `VERSION`,
  `DEVICE_NAME`, with `URL` pointing at the callback below carrying the same token.
- `POST /ios-enroll/callback?token=<enroll_token>`
  iOS posts a PKCS#7-signed XML plist. Extract the enclosed plist, read `UDID`, `PRODUCT`,
  `VERSION`, upsert `ios_devices`, consume the token, and return a `302` to
  `https://yahpz.com/ios/enrolled`.

**Token:** `enroll_token` minted by the `/ios` page for the signed-in user. Single use,
30-minute TTL, bound to `user_id`. This is what authenticates an otherwise anonymous POST.

**Deliberate simplification:** the callback extracts the plist from the PKCS#7 envelope by
locating the `<?xml … </plist>` span rather than performing full CMS signature
verification. The single-use, short-lived, user-bound token is the security control; a
forged POST can only write a UDID against the user who just requested it. Recorded as an
accepted trade-off, not an oversight.

**Known rough edge:** we cannot sign the `.mobileconfig`, because that needs the private key
for a cert in a CA chain iOS trusts, and yahpz.com's TLS key lives inside Netlify. iOS will
show the profile as **"לא מאומת" / Not Verified** in red. It still installs. The Hebrew
instructions on `/ios` must set this expectation explicitly, otherwise volunteers will
(reasonably) abandon the flow.

**Schema** — migration `ios_devices`:

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `user_id` | uuid → `profiles` | one volunteer may have >1 device |
| `udid` | text unique | the 25- or 40-char device identifier |
| `device_name` | text null | as reported |
| `product_type` | text null | e.g. `iPhone14,5` |
| `ios_version` | text null | |
| `status` | text | `pending` \| `registered` \| `retired` |
| `requested_at` | timestamptz | |
| `registered_at` | timestamptz null | set when added to the portal |
| `membership_year` | int | which 100-slot budget it consumes |

RLS: a volunteer reads their own rows; `admin` reads and writes all; clients never write
`status`.

---

## Unit 2 — Admin device console

> **Superseded (2026-09-05):** Console is **`super_admin` only**; statuses include
> `approved` (queued); registration is flipped by `publish-ios-batch.sh`, not a web
> “mark registered” action. See
> `2026-09-05-yahpaz-ios-udid-enrollment-approval-design.md`.

**Purpose:** make the 100-slot budget and the pending queue visible, and make the annual
reset survivable.

Web screen under ניהול, **super_admin-only** (not general admin), following the existing
admin list patterns (desktop table, mobile cards with the ⋮ overflow menu per
`2026-08-11-mobile-admin-users-card-design.md`).

- Pending enrollments awaiting approval, with volunteer name and או״ק.
- Approved devices queued for the next Mac publish.
- Registered devices, grouped by volunteer.
- **Budget header: `X / 100` used, plus the membership reset date.** Warning treatment past
  80, blocking-tone treatment at 95.
- Publish script registers devices / builds / emails; optional UDID checklist lives in the
  script pause path, not as the primary admin action.
- Retire a device, which frees nothing mid-year (Apple counts disabled devices) but keeps
  the roster honest for the next reset.

Storing UDIDs ourselves is what makes the annual reset tolerable: at renewal we wipe
Apple's list and re-add the whole active roster from this table rather than re-collecting
from 80 volunteers.

---

## Unit 3 — Release pipeline (`yahpaz-ios`)

Replaces `scripts/build-ipa.sh` (unsigned) entirely.

- **`scripts/export-options-adhoc.plist`** — `method: release-testing`, `teamID
  477WWCHXU7`, `signingStyle: manual`, plus the `manifest` dict (`appURL`,
  `displayImageURL`, `fullSizeImageURL`) so Xcode emits a `manifest.plist` alongside the
  IPA.
- **`scripts/build-adhoc.sh`** — `xcodegen generate` → `xcodebuild archive` → `xcodebuild
  -exportArchive`. Bumps `CURRENT_PROJECT_VERSION`. Outputs `dist/adhoc/Yahpaz.ipa`,
  `manifest.plist`, and the 57px/512px manifest icons.
- **`scripts/publish-ios.sh`** — copies the artifacts into `op-yh-26/public/ios/` under a
  versioned IPA filename and rewrites `version.json`. Mirrors the Android
  `build-release-apk.sh` → `public/android/` step.

The profile must be regenerated in the Apple portal *before* each build whenever the device
list changed; the script fails loudly if the embedded profile's device list does not contain
every `registered` UDID.

---

## Unit 4 — Web install surface (`op-yh-26`)

Static assets under `public/ios/`: the versioned `.ipa`, `manifest.plist`, `version.json`,
and both manifest icons.

**`src/lib/iosDownload.ts`**, deliberately parallel to `androidDownload.ts`:

- `IOS_DOWNLOAD_PATH = '/ios'`, `IOS_VERSION_PATH = '/ios/version.json'`
- `isIosDevice(ua)` and `isIosSafari(ua)` — the second matters because `itms-services://`
  fails silently in every non-Safari iOS browser
- `itmsInstallHref(manifestUrl)` → `itms-services://?action=download-manifest&url=…`
- `ipaHrefFromManifest()` / `fetchIosVersion()`, matching the Android helpers' shape and
  their unit-test coverage in `androidDownload.test.ts`

**Route `/ios`** — state machine, Hebrew RTL, רשומה design system:

1. Not an iPhone → `פתח את הדף מ‑Safari באייפון`
2. iPhone, not Safari → explicit `פתח ב‑Safari` instruction (silent failure otherwise)
3. iPhone + Safari, not signed in → login first, since enrollment binds to identity
4. Signed in, no enrolled device → **step 1**: install the enrollment profile, including the
   "Not Verified" warning and the Settings → Profile Downloaded → Install walkthrough
5. Enrolled, `pending` → waiting state explaining the batch and that they'll be emailed
6. `registered` and a build is published → **step 2**: the `itms-services` install button

Footer link mirroring `ANDROID_FOOTER_LINK`.

**`netlify.toml`** additions:

- `/ios/version.json` → `Cache-Control: no-store`
- `/ios/*.ipa` → `application/octet-stream`
- `/ios/manifest.plist` → `application/xml`, `no-store`

**Notification:** when a batch is marked registered, the admin console triggers the existing
`send-email` Edge Function to tell those volunteers their build is ready, with a link to
`/ios`. This closes the two-visit gap.

---

## Unit 5 — In-app guards (`yahpaz-ios`)

Both checks run on boot and both have pure domain helpers with unit tests in
`YahpazDomain`, matching how Android tests `needsForceUpdate`.

**Version force-update** — mirrors the Android contract exactly.

`https://yahpz.com/ios/version.json`:

```json
{
  "minBuild": 5,
  "latestBuild": 5,
  "latestVersionName": "1.0.0",
  "installUrl": "itms-services://?action=download-manifest&url=https://yahpz.com/ios/manifest.plist",
  "messageHe": "יש גרסה חדשה של האפליקציה. יש להוריד ולהתקין כדי להמשיך."
}
```

Compare integer `CFBundleVersion` against `minBuild`. ≈5s timeout, **fail open** on network
or parse error. When outdated: undismissable full-screen block whose CTA calls `openURL` on
`installUrl` — Apple's deployment documentation explicitly endorses in-app `openURL` to an
`itms-services` link for updating a self-hosted app. Helper:
`needsForceUpdate(current:min:)`.

**Provisioning-profile expiry guard** — the mitigation for the annual cliff, and the reason
this unit is in the first slice.

Read `embedded.mobileprovision` from the app bundle, extract the plist from its CMS
envelope, and parse `ExpirationDate`. From 21 days out, show a persistent, non-blocking
Hebrew banner telling the volunteer to reinstall from yahpz.com; inside 7 days escalate the
tone. Helper: `profileExpiryState(expiresAt:now:)` returning `.ok` / `.warning(daysLeft)` /
`.critical(daysLeft)`.

Without this, the profile simply expires and 80 responders discover simultaneously that the
app will not launch, with no in-app explanation.

## Testing

- `YahpazDomain`: `needsForceUpdate`, `profileExpiryState`, and the `embedded.mobileprovision`
  date parser against a fixture.
- `op-yh-26`: `iosDownload.test.ts` covering UA detection, the Safari-only case, manifest
  URL construction, and rejection of off-origin `ipaUrl` values — the same shape as the
  existing `androidDownload.test.ts`.
- `ios-enroll`: PKCS#7 plist extraction against a captured real device payload; token
  single-use and expiry; rejection of a token belonging to another user.
- Manual: full two-visit flow end to end on a real iPhone, plus a Chrome-on-iOS run to
  confirm the fallback copy appears rather than a silent failure.

## Rollout

Ordered by risk, not by dependency. The uncertain part is whether the signing → manifest →
`itms-services` → Safari chain works end to end at all; if it does not, the enrollment
service would have been built on sand. So the walking skeleton comes first and the
enrollment machinery is added around a proven install path.

**Plan 1 — walking skeleton** (`docs/superpowers/plans/2026-09-04-yahpaz-ios-adhoc-distribution-skeleton.md`)

1. Mint the `Apple Distribution` certificate. If this fails, the membership is not actually
   active and everything else is blocked.
2. Create the App Store Connect record for `com.yahpz.responder` and leave it dormant — the
   TestFlight escape hatch if the device cap bites.
3. Units 3 and 4: the Ad Hoc build pipeline and the `/ios` install page, with one
   hand-registered pilot UDID.
4. Verify a real install on a real iPhone from yahpz.com.

**Plan 2 — enrollment and console:** Specified in
`2026-09-05-yahpaz-ios-udid-enrollment-approval-design.md` (supersedes Units 1–2 detail
here). Removes the manual UDID step, adds `super_admin` Approve → Mac batch publish →
batch email. Pilot 3–5 volunteers through the full two-visit flow before batch-enrolling
the unit; expect the first wave to consume most of the annual budget.

**Plan 3 — in-app guards:** Unit 5. Plan 1 ships `version.json` with `minBuild: 1` so that
no gate is enforced before a client exists that can read it.

## Open questions

1. Membership renewal date — needed for the admin console's reset countdown and to plan the
   annual re-add.
2. Whether the "build is ready" notification should also go out over Soprano SMS, given the
   unit already uses it for OTP, or stay email-only.

## Do not

- Publish under Hive team `5GXFELD6MM`.
- Commit the distribution certificate or its private key to either repo.
- Add Netlify Functions — enrollment is a Supabase Edge Function
  (`netlify.toml` stays static-assets-only).
- Ship the version gate fail-closed; a yahpz.com outage must not brick responders mid-event.
