# Yahpaz iOS — UDID enrollment, super-admin approval, semi-auto publish

**Date:** 2026-09-05  
**Status:** Approved — implementation plan next  
**Repos:** `op-yh-26` (yahpz.com + Supabase), `yahpaz-ios` (Mac publish script only)  
**Parent:** `2026-09-04-yahpaz-ios-adhoc-selfhosted-distribution-design.md` (Ad Hoc OTA)  
**Supersedes:** Plan 2 / Units 1–2 and the “Mark batch registered” admin hand-toggle in that parent spec  
**Depends on:** Plan 1 walking skeleton (`/ios` install + Ad Hoc IPA publish) must already work for at least one hand-registered pilot device  

## Problem

Volunteers cannot install the Ad Hoc IPA until their iPhone UDID is in the Apple portal and a new signed build is published. Today that means asking for a UDID by hand, pasting into the portal, rebuilding, and telling people somehow. We need self-service capture on `/ios`, a gated approval queue, a Mac-side batch publish that registers devices and ships a new build, and an email with the download link only to people in that batch.

## Decisions (locked 2026-09-05)

| Topic | Choice |
|---|---|
| Rebuild automation | **Semi-auto:** Approve queues; operator runs a Mac script that registers (API or checklist), builds, publishes, emails |
| UDID capture | **Profile Service** `.mobileconfig` via Edge `ios-enroll` (not manual paste) |
| Who Approves | **`super_admin` only** — regular `admin` has no console access |
| Cadence | **Batch then script** — Approve many → `approved`; publish when ready |
| Email audience | **Batch only** — no `minBuild` bump / no fleet force-update in this slice |
| Architecture approach | Extend parent Plan 2 (not thin web-only, not CI Mac) |

## Out of scope

- CI / hosted Mac one-click publish
- In-app force-update and provisioning-expiry guards (parent Plan 3)
- SMS (Soprano) for “build ready”
- Manual UDID paste UI
- App Store / TestFlight as primary path
- Editing `yahpaz-ios` app UI (hold remains for product features; scripts under `yahpaz-ios/scripts/` are in scope for publish)

## End-to-end flow

```
Volunteer (Safari /ios, signed in)
  → mint enroll_token (30 min, one-shot, bound to user_id)
  → GET ios-enroll/profile → .mobileconfig (Profile Service)
  → Settings: install profile (expect "לא מאומת" / Not Verified)
  → iOS POSTs PKCS#7 plist → ios-enroll/callback
  → upsert ios_devices status=pending
  → redirect https://yahpz.com/ios/enrolled

Super admin (ניהול → מכשירי iOS)
  → pending queue + X/100 budget
  → Approve → status=approved (queued; no build)
  → Reject → status=rejected

Operator Mac (when ready)
  → scripts/publish-ios-batch.sh
      1. fetch approved rows (service role)
      2. register UDIDs in Apple (API if keys exist; else print list + pause)
      3. build-adhoc (automatic signing includes all portal devices)
      4. copy IPA / manifest.plist / version.json → op-yh-26/public/ios/
         (bump latestBuild only; do not raise minBuild)
      5. send-email to batch users only → https://yahpz.com/ios
      6. mark batch registered (+ registered_at)
      On build/publish failure: do not mark registered; do not send email

Volunteer
  → /ios shows itms-services install once status=registered and a build is published
```

---

## Unit A — Schema

### `ios_devices`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `user_id` | uuid → `profiles` | volunteer may have >1 device |
| `udid` | text unique | 25- or 40-char identifier |
| `device_name` | text null | from Profile Service |
| `product_type` | text null | e.g. `iPhone14,5` |
| `ios_version` | text null | |
| `status` | text | `pending` \| `approved` \| `registered` \| `rejected` \| `retired` |
| `requested_at` | timestamptz | enrollment time |
| `approved_at` | timestamptz null | |
| `approved_by` | uuid null → `profiles` | super_admin who Approved |
| `registered_at` | timestamptz null | set only by publish script after successful ship |
| `rejected_at` | timestamptz null | |
| `reject_reason` | text null | optional |
| `membership_year` | int | which 100-slot budget year the row counts against |

**Status meanings**

| Status | Meaning |
|---|---|
| `pending` | Captured; awaiting super-admin |
| `approved` | Queued for next Mac publish |
| `registered` | In Apple portal and included in a published IPA |
| `rejected` | Denied; not in fleet |
| `retired` | Soft-removed from our roster; **does not free an Apple slot mid-year** |

**Budget count:** distinct UDIDs with status in (`approved`, `registered`) for the current `membership_year`, against 100. UI warn ≥80, strong warn ≥95. Approve is blocked at 100 with clear Hebrew copy; `pending` rows may still accumulate for the next membership year.

**Per-user cap:** at most **2** active devices per user in (`pending`, `approved`, `registered`). Further enroll attempts get a Hebrew error. Prevents spare phones from burning the annual pool unnoticed.

### `ios_enroll_tokens`

| Column | Notes |
|---|---|
| `token` | opaque secret (pk or unique) |
| `user_id` | minting user |
| `expires_at` | 30 minutes from mint |
| `consumed_at` | null until callback succeeds |

### RLS / write paths

- Volunteer: **SELECT** own `ios_devices` only. No client writes to `status` or enrollment rows.
- `super_admin`: console via Edge/RPC only (Approve / Reject / Retire / list). Regular `admin` and `shift_lead`: **no** access.
- Enrollment inserts/upserts: Edge `ios-enroll` with **service role** only.
- `approved` → `registered`: publish script (service role) or dedicated mark-registered action with service credentials — **not** a hand toggle in the web UI.

Parent-spec RLS that said “`admin` reads and writes all” is explicitly replaced by this gate.

---

## Unit B — Edge `ios-enroll`

`verify_jwt = false` on the device callback path (iOS carries no session). Token is the authn.

| Route | Behavior |
|---|---|
| Authenticated mint | Signed-in user mints `ios_enroll_tokens` row; returns profile download URL |
| `GET …/profile?token=` | `Content-Type: application/x-apple-aspen-config` — Profile Service requesting `UDID`, `PRODUCT`, `VERSION`, `DEVICE_NAME`; callback URL includes the same token |
| `POST …/callback?token=` | Extract enclosed plist from PKCS#7 by locating `<?xml`…`</plist>` (no full CMS verify — accepted trade-off); upsert `ios_devices` as `pending`; consume token; `302` → `https://yahpz.com/ios/enrolled` |

**Unsigned profile:** Netlify holds yahpz.com TLS keys; we cannot sign the `.mobileconfig` with a CA iOS trusts. Install UI must warn about **"לא מאומת"**. Profile still installs.

**Duplicate UDID** already bound to another `user_id`: reject upsert; show contact-admin copy on `/ios`.

**Expired / reused token:** Hebrew error; user may mint again from `/ios`.

---

## Unit C — `/ios` volunteer surface

Extends the existing Ad Hoc install page (`IosDownloadPage`). Hebrew RTL, רשומה.

First matching state:

1. Not iPhone → open from Safari on iPhone; shareable `yahpz.com/ios`
2. iPhone, not Safari → must use Safari (`itms-services` silent elsewhere)
3. Not signed in → login (enrollment binds to identity)
4. Under per-user cap, no enrollable path started → **רישום מכשיר** guide (Not Verified + Settings → Profile Downloaded → Install) + CTA to mint + download profile
5. Own device `pending` → ממתין לאישור מנהל; no install CTA
6. Own device `approved` → באישור — הגרסה תפורסם בקרוב; no install CTA
7. Own device `registered` + published manifest → **התקנת האפליקציה** (`itms-services`)
8. Own device `rejected` → short message to contact the unit

Multi-device: list own devices with per-row status; enroll CTA remains while under the per-user cap of 2.

Redirect target `/ios/enrolled` is the same route with a success/waiting state after callback (not a separate product page).

---

## Unit D — Super-admin console

Nav under **ניהול → מכשירי iOS**, visible only when the viewer has `super_admin`. Follow admin list patterns (desktop table, mobile cards + ⋮ where actions need it).

- Budget header: `X / 100` + membership-year note (membership reset date when known — open question below)
- Segments: **ממתינים** | **מאושרים (בתור)** | **רשומים** | **נדחו / הוצאו**
- Pending: name, או״ק, device meta, `requested_at` → **אשר** / **דחה**
- Approved: queue count (“N ממתינים לפרסום”) — operator cue to run the Mac script
- Registered: grouped by volunteer; **הוצאה משימוש** → `retired`
- **No** “סמן כרשום” / export-as-primary workflow in UI — registration is the script’s job after a successful ship. Optional copy-paste of approved UDIDs remains a **fallback** inside the script pause path, not the main admin action.

Approve/Reject/Retire go through Edge or RPCs that assert `super_admin`.

---

## Unit E — Mac `publish-ios-batch.sh` (`yahpaz-ios`)

Runs on an operator Mac with Xcode, Apple Distribution identity, and Supabase service credentials (env / keychain — never committed).

1. Fetch all `status = approved` devices (udid, user_id, display hints)
2. Register in Apple Developer:
   - Prefer App Store Connect / Developer API when API key is configured
   - Else print newline-delimited UDIDs, pause for portal bulk upload, continue on keypress
3. Run existing `build-adhoc.sh` (automatic signing so the profile includes all currently registered portal devices)
4. Publish artifacts into `op-yh-26/public/ios/` (`Yahpaz.ipa`, `manifest.plist`, icons as needed, `version.json` with bumped `latestBuild` / version name). **Do not** raise `minBuild` in this slice
5. Call existing `send-email` for **batch user_ids only** — Hebrew subject/body; CTA `https://yahpz.com/ios`
6. Mark those rows `registered` + `registered_at`

**Failure rules**

- Archive/export/publish failure → exit non-zero; leave rows `approved`; send no email
- Email failure after successful publish → still mark `registered` (IPA is live); print failed `user_id`s for manual resend (v1 best-effort; optional “שלח שוב” later)

Script must fail loudly if the embedded profile’s device list is missing any UDID that should have been registered this run (when detectable).

---

## Email

Reuse Edge `send-email` + `_shared/email.ts` shell. Recipients = active `profiles` for the batch only. No SMS in this slice.

---

## Testing

- Tokens: TTL, single-use, wrong-user rejection
- Status transitions: pending→approved→registered; reject; retire; Approve blocked at 100
- Per-user cap of 2
- Budget counter (approved + registered)
- `ios-enroll`: PKCS#7 fixture → UDID extract; duplicate UDID handling
- Web: `/ios` state matrix; console hidden without `super_admin`
- Manual: real iPhone enroll → Approve → script → email → Safari install

## Rollout

1. Schema + Edge enroll + `/ios` states (can pilot capture without Approve UI)
2. Super-admin console Approve/Reject
3. `publish-ios-batch.sh` wired to service role + email
4. Pilot 3–5 volunteers through full two-visit flow before a large batch

## Open questions

1. Membership renewal / device-list reset date — needed for console countdown copy.
2. Whether Apple API keys for device registration are available now, or v1 ships checklist-pause only.

## Do not

- Raise `minBuild` on every batch publish (would force the whole fleet to reinstall)
- Let `admin` Approve or see the console
- Mark `registered` from the web UI
- Commit distribution certs, API keys, or `.mobileprovision` files
- Add Netlify Functions for enrollment (Supabase Edge only)
- Build CI Mac automation in this slice
`}