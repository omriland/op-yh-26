# Yahpaz (יחפ״צ) — Live responder location (web, page must stay open)

**Date:** 2026-08-17  
**Repo:** `yhpz-2026`  
**Status:** Implemented (v1 foreground web page, not HyperTrack / not a native app)  
**Depends on:** event form autosave (`2026-08-09-yahpaz-event-form.md`), `event_responders.ended_at`, Soprano SMS, scoped fill-token pattern (`2026-08-12-yahpaz-generic-email-and-fill-link-design.md`), `OpsMapPanel` on **מפה** + cockpit, רשומה (`design-system-design-instructions/`)

## Problem

When an אחמ״ש attaches a responder, the unit wants that volunteer on the two ops maps **live**, and must **stop collecting and showing** when that assignment has an end time (or is removed).

Pocket / screen-off tracking needs a native app. v1 does **not** do that. The volunteer opens an SMS link and **leaves that Yahpaz page in the foreground**. Locking the phone or switching apps freezes the pin.

## Goals (v1)

- On attach (autosave), text the responder **once** with a Yahpaz tracking URL
- Unauthenticated page (token, same idea as fill link) streams `watchPosition` while it is open
- Latest point only, on **מפה** and cockpit, for every `shift_lead` and `admin`
- Stop collect + show when the lead sets `ended_at` or removes the responder
- Event save never depends on SMS or GPS succeeding

## Non-goals (v1)

- Background / pocket GPS, HyperTrack, Radar, Onfleet, Capacitor, App Store / Play
- Live pins on event detail (static hero stays)
- Plain responders seeing anyone’s live location
- Breadcrumb trail or history after end
- `סיימתי`, lead `עצור מעקב`, or a product time cap on the assignment
- `כוננים קרובים` using live GPS (list stays address / 30 km)
- Blocking event save on SMS failure
- “ממתין למיקום” waiting UI on the maps — no pin until a point exists
- Login required to share location

## Decisions (locked)

| Topic | Choice |
|---|---|
| How GPS runs | **Web page must stay open** (`watchPosition`). Not a store app. |
| Who sees | Every `shift_lead` and `admin` on **מפה** and cockpit. Not responders. |
| Trigger | Attach via autosave. **One SMS per assignment.** |
| Stop | **Only** `ended_at` set, or responder removed. No in-app stop, no assignment timeout. Tracking can outlive the call until the report is filled in. The **page** also stops the moment the server rejects writes. |
| Storage | Latest point only. Delete the row when tracking stops. |
| Event save | Always succeeds without waiting on SMS |
| Nearby list | Unchanged (addresses only) |
| Pocket GPS | Later, if ever — not this slice |

## Honest limit

Safari and Chrome pause geolocation when the tab is not visible. v1 copy on the page and in the SMS says to leave the page open. Screen Wake Lock is **best-effort** where the browser allows it; iOS often will not keep the screen awake. That is accepted.

## Flow

1. Lead attaches a responder. Autosave inserts `event_responders`. If `ended_at` is already set, skip tracking.
2. After a successful save, the client calls Edge Function `responder-track` `start` for new assignments with no `tracking_sms_sent_at`.
3. Edge mints an opaque `track_token` (store **hash** only), Soprano-texts the URL, sets `tracking_sms_sent_at` only after Soprano accepts.
4. Volunteer opens `https://yahpz.com/?track_token=…` (no login). Page asks for location, then `watchPosition`. Each accepted fix POSTs to `responder-track` `ping`.
5. Ping upserts one row on `event_responder_live_locations`. Maps subscribe (Realtime).
6. Lead sets `ended_at` or removes them → client calls `responder-track` `stop` **before** deleting the assignment when removing. Edge deletes the live row and treats the token as dead. Next ping gets “ended”; the page stops watching and shows that tracking ended.

Re-attach after removal = new assignment id → new token + new SMS.

## SMS

Soprano, same account as OTP/broadcast. Eligible: active profile with valid IL mobile (`isValidIlMobile` / `profiles.phone`). No mobile → skip, event still saved, no toast required.

```
שובצת לאירוע ביחפצ - לשיתוף מיקום בזמן אמת לחץ על הלינק: {track_url}
השאירו את הדף פתוח עד סיום האירוע.
```

`{track_url}` is `{APP_ORIGIN}/?track_token={raw_token}` (`INVITE_REDIRECT_TO` / `yahpz.com`, localhost in dev). One SMS per assignment. No event type, address, or lead name.

**Rollout flag:** Edge env `LIVE_TRACK_SMS_ALLOWLIST`. Default / current prod: `336` (עמרי). Comma-separated callsigns to expand. `*` sends to every eligible assignment. Skip is silent (event still saved, no toast).

## Tracker page

Unauthenticated, immersive, **Field** theme, Hebrew RTL, רשומה. New screen blueprint: `design-system-design-instructions/screens/live-track.md` in the same implementation slice. Boot in `App.tsx` **before** login, like `fill_token` (do not send them to login if the token is valid).

**Copy**

- Title: `שיתוף מיקום`
- Lead: `השאירו דף זה פתוח. נעילת המסך או מעבר לאפליקציה אחרת יפסיקו את השיתוף.`
- Primary, before permission: `התחלת שיתוף מיקום` (browsers that need a gesture)
- While live: `משתף מיקום` (not a spinner-only state — keep the instruction visible)
- Permission denied: `יש לאשר מיקום בדפדפן כדי לשתף.`
- Token invalid/expired: `קישור המעקב אינו תקין או שפג תוקפו.`
- Server says ended / assignment gone: `המעקב הסתיים.` Stop `watchPosition`. No more pings.

**Behavior**

- `navigator.geolocation.watchPosition` with high accuracy
- POST at most every **10 seconds**, or sooner if the fix moved **≥ 50 m** (whichever comes first)
- `Ping` body: `{ track_token, lat, lng, accuracy_m?, recorded_at }`
- Rejected ping (`ended` / bad token) → stop watching, show the matching Hebrew state
- Optional `navigator.wakeLock.request('screen')` while live; ignore failure
- No map on this page (leads have the ops maps; this page is a beacon)

## Token (same shape as fill)

Columns on `event_responders`:

| Column | Type | Notes |
|---|---|---|
| `track_token_hash` | text | sha256 of raw token; null until mint |
| `track_token_expires_at` | timestamptz | mint + **7 days** (leak cap, same as fill). Dead earlier if we `stop`. |
| `tracking_sms_sent_at` | timestamptz | set only after Soprano accepts |

Raw token only in the SMS URL. Re-mint on `start` only if missing/expired **and** `tracking_sms_sent_at` is null (do not SMS twice). `stop` nulls the hash (or leaves it but pings still refuse when `ended_at` is set / row gone — **must refuse in both cases**).

`start` auth: caller JWT must be `shift_lead` or `admin`. Function re-reads the assignment; does not trust the client that it is “new.”

`ping` auth: raw token only (no user JWT). Service-role write.

`stop` auth: `shift_lead` / `admin` JWT.

## Data

### `event_responder_live_locations`

One row per live assignment:

- `event_responder_id uuid primary key` → `event_responders.id` **on delete cascade**
- `lat` / `lng` `double precision not null`
- `accuracy_m double precision null`
- `recorded_at timestamptz not null`
- `updated_at timestamptz not null`

No trail.

### RLS

- `SELECT`: authenticated `shift_lead` or `admin`. Impersonation follows the **effective** JWT (impersonating a plain responder hides pins).
- `INSERT`/`UPDATE`/`DELETE`: service role only.
- Realtime enabled on this table.

`stop` always deletes the live row. `ended_at` update does not cascade by itself.

### Ping must refuse when

- Hash mismatch / expired token
- Assignment missing
- `ended_at` is not null

Do not upsert in those cases. If a live row still exists, `stop`/refuse path deletes it.

## Maps (רשומה)

Same `OpsMapPanel`. Extend `createLabeledPin` with variant `live` (disc `--status-done`). Do not invent colors.

| Kind | Disc | Caption |
|---|---|---|
| Address | `--accent` | unchanged |
| Open event (cockpit) | `--status-alert` | unchanged |
| Live responder | `--status-done` | `{callsign \|\| full_name} · בדרך` |

- Same person may have address pin(s) **and** a live pin
- Tooltip (same chrome as user pins, border `--status-done`): `{סוג · כביש מיקום} · HH:MM` last ping, `Asia/Jerusalem`. Empty one-liner → `HH:MM` only
- Live pin is not a hit target that opens the event
- Not in `כוננים קרובים`
- **מפה** caption stays about addresses
- Pin gone when the live row is deleted (Realtime)

Update `screens/admin.md` (מפה) and `screens/cockpit.md` (מפה drawer) in the same slice.

## Client wiring (event form)

After `syncResponders` succeeds:

1. `stop` each `toRemove` assignment (**select tracking columns before delete**)
2. Existing delete/upsert
3. `stop` assignments whose `ended_at` is now set and that had a track token / live row
4. `start` newly inserted assignments with `ended_at` null

Failures: toast `שליחת מעקב המיקום נכשלה. האירוע נשמר.` or `עצירת מעקב המיקום נכשלה. האירוע נשמר.` Do not roll back the event.

## Errors

| Case | Behavior |
|---|---|
| No IL mobile | Skip start. Event saved. |
| Soprano fail | Do not set `tracking_sms_sent_at`. Null the new hash if we minted and did not send. Toast. Retry next save. |
| Volunteer denies location | Tracker page error copy. No pin. |
| Tab backgrounded / screen locked | OS stops fixes. Last pin stays until a new ping or `stop`. |
| Volunteer never opens the link | No pin. |
| Event cancelled, `ended_at` still null | Tracking **continues** (locked stop rule) |

## Testing (implementation)

- Pure: live pin label/tooltip; start vs skip (`ended_at`, existing `tracking_sms_sent_at`, invalid phone); ping refuse when ended/expired; stop deletes live row
- No Soprano / live GPS in unit tests
- Manual: attach → SMS → leave page open → pin on both maps → lock phone (pin freezes) → set end time → pin gone and page shows `המעקב הסתיים`

## Complexity

**Medium.** This is fill-token + Soprano + one Field page + Realtime pins. Roughly a few days, not a vendor/native project. Pocket tracking stays a later product if the unit outgrows “leave the page open.”
