# אבן דרך — Locations, GPS Tracking & Map Display

**Audience:** Engineers working on Yahpaz (אבן דרך)  
**Scope:** Volunteer home addresses, event/report locations, live GPS tracking, "junctions," and the operational map  
**Date:** 2026-09-08

This is an internal architecture reference, not a user-facing contract (compare `docs/partner-api.md`, which documents the Telegram partner HTTP API — the `start_live_track` / `stop_live_track` / `ping` actions described there are the partner-facing entry points into the GPS system detailed in §3 here).

---

## Overview

Five loosely-coupled pieces of "where" data feed one Google Maps view (`OpsMapPanel`):

```
user_addresses (per-volunteer, admin-managed, Google Places)
        \
         \--> list_unit_map_pins() RPC --> MapPin[] ---\
                                                          \
events.location / location_lat / location_lng            \
        (free text + optional canonical pin)  ---\         \
                                                    \         >--> OpsMapCanvas (Google Maps JS, custom overlay pins)
event_responder_live_locations (1 row per            /         /       |
  active assignment, realtime)  --> LiveMapPin[] ----/         /   static layers:
                                                                /    - police station boundaries (GeoJSON)
mile-posts.json / police-station-boundaries.geojson -----------/    - kilometer markers ("mile posts")
        (static files, not DB)
```

There is no PostGIS/`geography` type anywhere in the schema — every location is a plain `(double precision lat, double precision lng)` pair plus, for volunteers and Places-picked events, a Google `place_id` and formatted address string. Distance math (nearby-volunteer search) is a hand-rolled haversine, not a DB spatial query.

Two more Google Maps surfaces exist outside the live canvas:
- **Static Maps** (`src/lib/staticMaps.ts`) — a small faded pin thumbnail on `EventDetailPage.tsx`, built from a plain image URL (`maps.googleapis.com/maps/api/staticmap`), no JS SDK.
- **Places Autocomplete + geocoding** (`src/lib/googlePlaces.ts`) — the new Places API (`places.googleapis.com/v1`), used both for interactive address/location pickers and as a server-less "best match" geocoder for auto-pinning highway events (§2).

---

## 1. Volunteer addresses

### Schema

`supabase/migrations/20260816144201_user_addresses.sql` — table `public.user_addresses`:

| Column | Notes |
|---|---|
| `user_id` | FK → `profiles`, cascade delete |
| `kind` | enum `address_kind`: `home` \| `work` \| `other` |
| `label` | required text for `other`, must be `null` for `home`/`work` (CHECK constraint) |
| `formatted_address`, `place_id`, `lat`, `lng` | always a **Google Places** result — there is no free-text fallback for volunteer addresses |

Unique partial indexes cap each user at one `home` and one `work` row; `other` is unlimited (add-more UI, see below).

RLS (`20260816144201...sql`, tightened by `20260816145306_user_addresses_shift_lead_select.sql`):
- **SELECT**: the row's own user, or `admin`, or `shift_lead`.
- **INSERT/UPDATE/DELETE**: `admin` only (and blocked entirely if `super_admin_row_locked(user_id)` — see the super-admin row-lock feature).

So a volunteer **cannot edit their own address** — only view it. Editing is admin-only, from `AdminUsersPage.tsx`.

### Client model

`src/lib/userAddresses.ts` is the single module for this domain:
- `AddressDraft` / `UserAddressRow` / `PersistableAddress` — draft-vs-persisted shapes used by the admin edit form.
- `emptyAddressDrafts()` seeds one `home` + one `work` slot; `emptyExtraAddressDraft()` adds an `other` slot (`AdminUsersPage.tsx:1660`).
- `isGooglePlaceComplete` / `addressDraftError` enforce **Places-only**: a slot is either empty, or has `place_id` + `lat` + `lng` (free text alone is rejected with `PLACES_ONLY_ERROR`).
- `persistableAddresses(drafts)` (`userAddresses.ts:141`) turns filled drafts into rows to save.

### Read/write flow

- **Admin edit** — `AdminUsersPage.tsx` builds `AddressDraft[]` via `draftsFromRows(user.addresses)`, and on save calls `persistableAddresses()` then `syncUserAddresses(userId, addresses)` (`src/lib/adminUsers.ts:280`). That function diffs existing vs. next rows (delete removed, update changed, insert new) directly against the `user_addresses` table through the Supabase client — protected purely by the admin RLS policy above, no edge function involved.
- **Volunteer self-view** — `ProfilePage.tsx` calls `fetchOwnAddresses(userId)` (`userAddresses.ts:387`) and renders read-only, labeled via `addressKindLabel`.
- **Map consumption** — addresses never reach the client as raw `user_addresses` rows for the unit map. Instead `list_unit_map_pins()` (`supabase/migrations/20260818073500_list_unit_map_pins.sql`, tightened by `20260827100000_..._skip_invite_pending.sql`) is a `security definer` SQL function any authenticated **active** user can call; it joins addresses to profiles and pre-filters to map-visible statuses (excludes `administration`, `basic_training`, `shifts_only`, and pending invites) — so responders can see the whole unit's addresses on the map without `user_addresses` SELECT rights themselves. `fetchActiveUserMapPins()` (`userAddresses.ts:381`) wraps the RPC; `mapPinsFromUnitRows` reshapes the flat rows into `MapPin[]`.

### Distance / "nearby volunteers"

Pure functions in `userAddresses.ts`, no server round-trip:
- `haversineKm` (line 244) — great-circle distance.
- `mapBoundsForRadiusKm` (line 270) — degrees-per-km approximation for a bounding box (used to frame the map, not to filter — filtering is exact haversine).
- `nearbyResponders(pins, origin, maxKm)` (line 285) — best (closest) address per volunteer within `maxKm`, sorted by distance then callsign. `SEARCH_VIEW_RADIUS_KM = 30`.

This powers the "מתנדבים קרובים" panel in `OpsMapPanel.tsx` when a shift lead searches an address (`LocationPlacesField` in `allowFreeText={false}` mode — search must resolve to a real Places pin).

---

## 2. Event / report locations

### Schema

Base columns on `public.events` (`supabase/migrations/20260809120000_init.sql`):
- `road_id` → FK to `public.roads` (a flat lookup table: `name`, `active`, `sort_order` — e.g. "כביש 6", "עירוני"). Not geographic; just a picklist.
- `location` — free text (e.g. "ליד יציאה 12" / a junction name / anything a shift lead types).

Google Places fields added later (`supabase/migrations/20260811140300_system_districts_places_location.sql`):
- `location_place_id`, `location_lat`, `location_lng`.

Canonical-pin bookkeeping (`supabase/migrations/20260824100000_event_location_pin.sql`):
- `location_pin_source` — `'places' | 'geocode' | 'shift_lead' | 'responder'`, CHECK-constrained.
- `location_pinned_at`, `location_pinned_by` (→ `auth.users`).

The comment on that migration is the key design note: *"Canonical event map pin, independent of location text."* — `location` (text) and `location_lat`/`location_lng` (pin) are deliberately decoupled: editing the text never silently moves the pin, and vice versa.

### Pin-source state machine

`src/lib/locationPin.ts`:
- `LOCKED_SOURCES = {'shift_lead', 'responder'}` — a **human-placed** pin (dragged on the cockpit map, or in the future set by a responder's native arrival). `locationPinIsLocked()` — once locked, further location-*text* edits keep the pin unless the source is explicitly cleared.
- `'places'` — the shift lead picked a real Google Places suggestion in the location field. Also locked from being silently overwritten (a real pick is trusted).
- `'geocode'` — the system's own best-effort guess (§ below); considered soft, and is skipped/replaced by anything better.
- `applyLeadMapPin(current, {lat, lng, userId, at})` — used when a shift lead drags the event pin on `OpsMapPanel`'s cockpit canvas (`onEventPinMove` in `OpsMapPanel.tsx:85`); sets `location_pin_source = 'shift_lead'`.
- `clearLockedLocationPin()` / `applyLocationFieldChange()` — the reconciliation logic run whenever the `LocationPlacesField` in the event form fires `onChange`.

### Auto-geocode ("best guess for highway events")

`src/lib/eventGeocode.ts`:
- `roadNumberForGeocode(roadName)` — pulls a road **number** out of the road name (handles a legacy `"עירוני (101)"` naming and a `(NN)` suffix pattern).
- `eventGeocodeQuery(road, location)` — builds a single Google query string, e.g. `"כביש 6 ליד יציאה 12"`, avoiding duplication if the location text already mentions the road.
- `eventNeedsPersistedGeocode(...)` — gates the auto-guess: **skipped** if the shift lead already used Places (`placesAssisted`), if the road is urban (`isUrbanRoadName` — `src/lib/systemDistricts.ts:63`, matches road name containing `"עירוני"`; urban events are expected to use a real street address via Places, not a highway guess), if the pin is already locked, or if coordinates already exist.
- `applyAutoGeocodeToLocationPayload(payload, coords)` — writes the guessed coords with `location_pin_source: 'geocode'`.

This auto-guess runs on save from three call sites, all following the same pattern (build query → `geocodePlaceQuery` → apply):
- `src/lib/eventForm.ts:1109-1130` (standalone event fill/save)
- `src/lib/cockpit.ts:539` (shift-lead cockpit save)
- `src/pages/EventDetailPage.tsx:107-121` (event detail edit)

`geocodePlaceQuery` (`src/lib/googlePlaces.ts:165`) takes the **first** Places Autocomplete prediction for the query and resolves its coordinates — a heuristic best-effort match, session-cached in memory (`geocodeCache`), not a true geocoder call.

### "System שלוחה" — the one district that unlocks free-address entry

`src/lib/systemDistricts.ts`. Most events pick a highway (`road_id`) + free-text `location`. One locked, system-owned district (`code = 'station_other_duplicated'`, name "תחנה / אחר / משוכפל") and the urban road (`עירוני`) both flip the location field into full Google Places mode (`needsPlacesLocation`) instead of the highway-guess flow, since "תחנה" (station) and city events don't have a meaningful road number. Switching into or out of that district clears the location (`shouldClearLocationOnDistrictChange`) so a stale highway guess doesn't linger under a city address, or vice versa.

### UI

- `LocationPlacesField` (`src/components/events/LocationPlacesField.tsx`) — the shared combobox: Google Places predictions (debounced 250 ms, session-tokened for billing) plus, when `allowFreeText` (event forms) is true, a "use what I typed" option. User addresses and the ops-map search box set `allowFreeText={false}` — those must resolve to a real place. When a `roadName` is passed, predictions are queried as `road + location` together (`eventGeocodeQuery`) even while the field isn't focused, so the Places suggestions already reflect the selected road.
- `EventLocationsList.tsx` / `EventLocationsPage.tsx` — a **super-admin-only** queue (`App.tsx`: `activeView === 'event_locations' && isSuperAdmin`) listing events with a "מיקום חסר" filter (`location_lat`/`location_lng` null) for manually assigning a Google Places pin per event (`eventLocationPlacesPatch` — writes only `location_place_id`/`lat`/`lng`/`pin_source: 'places'`, never touches the `location` text or `road_id`).

### RLS

Events are governed by the general event-access policies (admin/shift_lead full read/write; a responder can read their own assigned events) — there is no location-specific RLS beyond that; the sensitive surface here is really *who can move the canonical pin*, which is a client-side/business-logic distinction (`location_pin_source` lock), not a database-enforced one.

---

## 3. GPS live tracking

Two independent start paths feed one storage/display mechanism.

### Data model

`supabase/migrations/20260817070131_event_responder_live_locations.sql`:
- `event_responders` gains `track_token_hash` (SHA-256 hex of an opaque token — the raw token is **never stored**, only sent once in the SMS/link), `track_token_expires_at` (7-day leak cap from mint time), `tracking_sms_sent_at`.
- `public.event_responder_live_locations` — **one row per assignment** (`event_responder_id` is the primary key, not a log table): `lat`, `lng`, `accuracy_m`, `recorded_at`, `updated_at`. Each new ping **overwrites** the previous point — there is no location history/trail persisted server-side.
- RLS: `revoke insert/update/delete ... from authenticated` — only the service-role key (used inside edge functions) can write. **SELECT is admin/shift_lead only** (`event_responder_live_locations_select_ops`) — a responder cannot query their own or peers' live rows directly; the live map is an ops-only view.
- The table is added to the `supabase_realtime` publication, so admin/shift_lead clients get push updates via Supabase Realtime (`postgres_changes`), not polling.

### Two ways to start tracking

**A. Shift-lead-initiated, SMS-based** (`supabase/functions/responder-track/index.ts`, actions `start`/`stop`/`load`/`ping`):
- `start` (lead-authenticated, `requireLead()` checks `admin`/`shift_lead` role): mints a token per assignment, SMS's a link (`buildTrackLink` → `yahpz.com/?track_token=...`) via **Soprano** SMS gateway (`SOPRANO_*` env vars). Skips assignments already ended, already SMS'd (`tracking_sms_sent_at`, idempotent-by-design — no resend), not on the callsign allowlist (`LIVE_TRACK_SMS_ALLOWLIST`, default just callsign `336`, or `*` for everyone — a soft rollout gate), or with no valid Israeli mobile (`isValidIlMobile`).
- `load`: called by the tracking page itself when it opens, to validate the token before asking for GPS permission.
- `ping`: the actual location write (see below — shared logic with path B).
- `stop`: deletes the live-location row and clears the token hash (admin/shift_lead only, e.g. from a cockpit "stop tracking" action).

**B. Volunteer/partner-initiated, in-app** (`supabase/functions/responder-api/index.ts`, actions `start_live_track` / `stop_live_track`, documented externally in `docs/partner-api.md` §2): a volunteer (via the website or, per the partner API, a linked Telegram bot) starts tracking one of their **own open assignments** directly — `handleStartLiveTrack` (`responder-api/index.ts:650`) mints the same kind of token (`randomTrackToken` / `sha256Hex`, `TRACK_TOKEN_TTL_MS` = 7 days, same constant as path A), no lead action or SMS needed. Blocked if `ended_at` is already set (`"המעקב הסתיים."`, code `ended` — a shift lead already recorded a shift end time for that assignment) or the assignment is locked/cancelled/shift-born. `stopLiveTracking()` (`responder-api/index.ts:632`) is shared with `complete` — **finishing a report always stops tracking as a side effect**.

Both paths hand the resulting `track_token` to the same **`ping`** action in `responder-track`, so location writes are always the same code path (`handlePing`, `responder-track/index.ts:340`) regardless of who started the session. `ping` is authenticated purely by the opaque token (validated by hashing and comparing `track_token_hash`, checking `track_token_expires_at`, checking `event_responders.ended_at`) — the publishable anon key is sent but not meaningfully checked, by design (`docs/partner-api.md` §3 calls this out explicitly for partner integrators).

### Browser-side tracking page

`src/pages/LiveTrackPage.tsx` — a no-login page opened via the `?track_token=` link (see `parseTrackTokenFromSearch`/`buildTrackUrl` in `src/lib/liveTrack.ts`). Flow: `loadTrackByToken` on mount → ask for `navigator.geolocation` permission on a tap (not automatically — iOS Safari/WebKit and Chrome-on-iOS both require a direct user-gesture click for the permission prompt, handled with real care here: `liveTrackPositionOptions`, `isIosNonSafariBrowser`, `shouldRetryLiveTrackFirstFix`) → `watchPosition` loop → `pingTrackLocation` (`src/lib/liveTrackApi.ts:79`) on every fix, throttled client-side by `shouldEmitPing` (`src/lib/liveTrack.ts:126`: only send if ≥10s elapsed **or** ≥50m moved) → requests a Screen Wake Lock so the phone doesn't sleep and drop the GPS watch. A `pingTrackLocation` failure with `code: 'ended'` flips the page to a terminal "tracking ended" state; the volunteer must reopen a fresh link to resume.

### Live pins on the map

`src/lib/liveMapPins.ts` (`fetchLiveMapPins`, initial snapshot join across `event_responder_live_locations → event_responders → profiles/events/roads/event_types`) + `subscribeLiveMapPins` (realtime channel) feed `OpsMapPanel.tsx`. `src/lib/liveMapChannel.ts` turns raw realtime payloads into typed upsert/remove deltas (`liveDeltaFromChange`) and does client-side viewport culling (`cullLivePinsToBbox`). Pins are considered **stale after 30s without a new ping** (`LIVE_PIN_STALE_AFTER_MS`, checked every 2s — `freshLivePins` in `OpsMapPanel.tsx:162`) and are dropped from view, even though the DB row lingers until `stop`/`complete` deletes it. Visually, a moving pin **animates** between its last two known points over ~1s (`pushLiveMotion`/`liveMotionPosition`, driven by `requestAnimationFrame`) rather than jumping — cosmetic interpolation only, no path/trail is drawn (consistent with only the latest point being stored).

### Notable prior incident (context only)

Per project history, the `ended_at` check on `event_responders` (used by `tokenCode()`/`pingRefusal` here and by `standaloneOrError`/`canStartTracking` on the client) previously had a bug that was fixed; the current code paths described above reflect the fixed behavior.

---

## 4. "Junctions"

**Status: built and shipped (2026-09-08, branch `feature/highway-junctions`).** Everything below this point was written progressively as the feature was designed and then implemented in the same session — the "Not built" / "would look like" language in the earlier parts of this section is now historical (kept because the rejected-alternatives reasoning is still useful context), not current. Current state, for anyone landing here fresh:

- `public.highway_junctions` — 607 real junctions, one-time-seeded from `saariko/RoadsKMs` (migrations `20260908150000`–`20260908150200`), with a `highway_junctions_set_updated_at` trigger. Not synced going forward, per the design decided below.
- `search_highway_junctions(q)` RPC — fuzzy name/alias search, admin/shift_lead/super_admin only.
- `src/lib/highwayJunctions.ts` — client wrapper (`searchHighwayJunctions`, `junctionPlaceId`/`junctionIdFromPlaceId`).
- `location_pin_source = 'junction'` — a new locked pin source, alongside `places | geocode | shift_lead | responder` (`src/lib/locationPin.ts`).
- `LocationPlacesField` (`allowJunctions` prop) — merges junction search into the existing Places combobox; wired on live on `EventFormPage`'s event-location field only.
- `HighwayJunctionsPage` (`src/pages/HighwayJunctionsPage.tsx`) — super-admin-only alias/missing-junction management, routed as `highway_junctions` (`/highway-junctions`).
- `road_id`/`כביש` remains independently editable and required. Revised 2026-09-09: picking a junction sets the road from the first slash-delimited numeric token that has exactly one closed-list match, replacing the current selection; the lead may override it afterward.

Originally, confirmed with the repo owner (2026-09-08): the intended meaning of "junctions" is the geographic one — **a comprehensive reference list of Israeli highways and named junctions/interchanges (צמתים)**, maintained in a separate project, meant to be usable as a *location* here (i.e., a third canonical location source alongside a volunteer's home address and a Google-Places pick). For completeness, the two things the bare word "junction" turns up elsewhere in this codebase are:

1. **Generic DB usage** — "junction row"/"junction table" appears once, as the standard relational-database term for a many-to-many link table, in `docs/superpowers/specs/2026-08-19-yahpaz-event-media-upload-design.md` ("Plate deleted → Photo stays; **junction row** is removed"), describing the `event_media`↔`treated_plates` link. Unrelated — not geographic.
2. **Ad hoc free text today** — until the reference list is wired in, a junction name is just whatever a shift lead types into `events.location` (e.g. `route: "דרך צומת …"` in a partner-API sample request in `docs/partner-api.md`), or whatever Google Places happens to index as a POI/interchange and surfaces through `LocationPlacesField` — the app doesn't distinguish that from any other place type. The **kilometer marker ("mile post" / "אבן קילומטר")** static layer, §5, is adjacent (a fixed point along a numbered road) but marks distance, not an intersection with another road — it's not a junctions dataset.

### The external source: `saariko/RoadsKMs`

The reference list lives in a separate repo, **[saariko/RoadsKMs](https://github.com/saariko/RoadsKMs)** ("Israel Road KMs Locator"), inspected 2026-09-08. It is a small, already-working standalone service, not a raw dataset dump:

- **Stack**: single-process Python/FastAPI app (`main.py`), no DB — loads two CSVs into memory at startup via pandas. Frontend is one self-contained `index.html` using Leaflet, RTL Hebrew UI.
- **`junctions.csv`** (663 rows): `lat, lon, name_he, roads, name_en` — e.g. `32.7275…, 35.2841…, צומת אביהוא, 79/700, Avihu`. `roads` lists the intersecting route numbers/names (junctions and interchanges — צמתים ומחלפים — both included, not disambiguated by a type column).
- **`markers.csv`** (6,326 rows): `road, km, lat, lon` — a kilometer-marker point on a numbered road. This is the same *kind* of thing as op-yh-26's own "mile post" static layer (§5) but is a separate, much larger, independently-maintained dataset — not currently the same file.
- **API surface** (Hebrew error messages throughout):
  - `GET /api/marker?road=&km=` — road+km → lat/lon, interpolated between the nearest markers, plus perpendicular left/right-of-road offset coordinates (for correct-side Waze/Google Maps nav links) and the nearest junction within 5km.
  - `GET /api/nearest?lat=&lon=` — reverse lookup, nearest marker to a coordinate (rejects >50km away).
  - `GET /api/junction?name=` — fuzzy junction search (exact, then substring) against `junctions.csv`, returning either one match or a disambiguation list.
- **Deployment**: Docker image shipped by hand (SCP tarball, no registry) to a self-hosted Hetzner VPS, container `roads-locator` on host port `4965`. No public homepage/domain is recorded in the repo — it is not currently known to be reachable from op-yh-26's runtime environment (Netlify), and no auth/CORS story for a cross-project caller exists yet.
- Data provenance: junctions/markers were originally scraped/built from CKAN sources via one-off scripts in `tools/` (`search_ckan.py`, `build_junctions.py`, `add_road4_junctions.py`, …) — not an official live feed. `CLAUDE.md` there explicitly warns against adding user-typo aliases into the CSVs; fuzzy matching is meant to live in search code instead.
- **Aliases**: no dedicated column/table — a junction with multiple known names has them **packed into the same `name_he`/`name_en` string, slash-delimited**, e.g. `name_he = "צומת בן גוריון מערב / נתבג / חבד / כפר חבד"` (one row, one coordinate, four names). This is hand-curated directly in the CSV (commit history: *"add נתבג/חבד/כפר חבד aliases to Ben Gurion West"*, *"Deduplicate and unify Aba Hillel / Silver Junction into a single entry with aliases"*) — there's no canonical-vs-alias flag, just convention (primary name first). `GET /api/junction` (`main.py:488`) matches aliases only via its **substring fallback** (`n in name_he.lower()`, `main.py:510`) — an exact-match check runs first (`n == name_he.lower()`, `main.py:501`) but can't match a bare alias against the full packed string. Whichever alias you search, the response's `"junction"` field always returns the **entire packed string**, not just the matched alias — there's no per-alias result identity.

### What integrating it into op-yh-26 would look like (design record — see shipped-state summary above)

**Agreed direction (2026-09-08): a DB table, one-time-seeded from RoadsKMs** — not a live API call, not a static asset, and explicitly **not an ongoing sync**: RoadsKMs' CSV is imported exactly once to bootstrap the table, and from that point on `highway_junctions` is op-yh-26's own independently-owned data, maintained entirely through the admin UI below (§ "Managing junctions"). The two projects' junction lists diverge after the seed and that's expected — same spirit as the mile-post datasets (§ above), which are also two separate, independently-maintained copies. This is the cleanest fit as a **fourth location source**, parallel to how volunteer addresses (§1) and event locations (§2) already work: surface the table through an autocomplete field the same way `LocationPlacesField` wraps Google Places (§1), and write into `events.location_lat/lng` with a new `location_pin_source = 'junction'` value alongside the existing `places | geocode | shift_lead | responder` enum (§2) — letting junction-based locations use the same pin/auto-geocode/queue machinery events already have.

**Decided schema (2026-09-08)** — `text[]` alias columns, split from RoadsKMs' packed string at import time, rather than importing it as-is (which would replicate RoadsKMs' own UX wart of returning the whole slash-joined blob as the result) or a separate alias join-table (no per-alias metadata is ever needed, and array columns already have precedent in this schema — `event_freeze_report_lists`, `user_feedback_attachments`; at ~663 rows a plain `ilike` scan needs no trigram/GIN indexing either):

```sql
create table public.highway_junctions (
  id uuid primary key default gen_random_uuid(),
  name_he text not null,                     -- canonical: segment 0 of RoadsKMs' " / "-split name_he at seed time
  name_en text,                              -- canonical english name
  aliases_he text[] not null default '{}',    -- remaining " / "-split segments at seed time, then admin-managed
  aliases_en text[] not null default '{}',    -- usually empty — RoadsKMs rarely packs english aliases
  roads text,                                -- free-text intersecting roads, informational only
  lat double precision not null,
  lng double precision not null,
  created_by uuid references auth.users,      -- null for the one-time seed rows, set for anything added via the admin UI
  updated_at timestamptz not null default now()
);
create unique index on public.highway_junctions (name_he);
```
(As shipped: also gained a `highway_junctions_set_updated_at` before-update trigger, added in a follow-up migration after code review caught that `updated_at` was declared but never maintained — see `20260908150150_highway_junctions_updated_at_trigger.sql`.)

- **One-time seed**: a single import script/migration (`scripts/import-highway-junctions.py`) splits each RoadsKMs CSV row's `name_he`/`name_en` on `" / "` (segment 0 → canonical, rest → `aliases_*`) and bulk-inserts once. No ongoing job, no re-run, no `source` flag needed — after the seed, RoadsKMs is no longer referenced by the running app at all. **As actually run**: the live RoadsKMs snapshot had 662 data rows (one fewer than the 663 seen during design, above — the external repo moved by one row in the interim), and 607 distinct canonical junctions landed after `on conflict (name_he) do nothing` — 55 canonical-name collisions were dropped, each independently confirmed (by haversine distance) to be near-duplicate points of the same physical interchange, not distinct junctions losing data.
- **Search**: a `search_highway_junctions(q text)` `security definer` RPC (same pattern as `list_unit_map_pins()`, §1) — `where name_he ilike '%'||q||'%' or name_en ilike ... or exists(select 1 from unnest(aliases_he) a where a ilike ...) or exists(... aliases_en ...)`, always returning the **canonical** name/id, never a raw alias string, so `LocationPlacesField` always shows/selects a clean label regardless of which alias matched.
- Every later change — new aliases, a corrected coordinate, a wholly missing junction — goes straight into this table through the admin UI below; there is nothing to reconcile against an external source afterward.

### Managing junctions (add aliases / add a missing junction)

Needed per the repo owner (2026-09-08): since the table is a **one-time seed, not a synced mirror** (see above — all upkeep happens in-app from that point on), this admin surface is the *only* way the data ever changes going forward: (a) day-to-day, adding aliases to an existing junction; (b) rarely, adding a junction missing from the original RoadsKMs seed entirely. This doesn't fit the app's existing generic picklist admin (`AdminListsPage.tsx` + `closedLists.ts` — `districts | event_types | roads | vehicle_kinds`, a plain `{id, name, active, sort_order}` shape) since junctions carry lat/lng and alias arrays. The closer precedent is `EventLocationsList.tsx`/`EventLocationsPage.tsx` (§2) — a small **super-admin-only** dedicated page for a specialized geo-reference dataset. A `HighwayJunctionsPage` in that same spirit would need:
- A searchable list (reusing the same `search_highway_junctions` RPC the picker uses) with an inline editor for a row's `aliases_he`/`aliases_en` arrays (simple add/remove-string UI) — the main, frequent use of this page.
- A small "add missing junction" form — `name_he` (required), `name_en` (optional), `roads` (free text), and lat/lng captured via `LocationPlacesField` in Places mode (drop a pin the same way an event location is set) or manual entry.
- Gated the same way as `EventLocationsPage` (`isSuperAdmin`, not just `admin`/`shift_lead`), matching the low-frequency, geographically-sensitive nature of this edit surface.

### Who would actually query it

Asked directly: **today, nobody does — there is no location-entry surface for plain volunteers at all**, for any location type, not just junctions:

- **Event locations (§2)** — `LocationPlacesField`/`EventFormPage` (where a shift lead or admin types/searches a location and picks a Places result or drags the pin) is gated by `canManage = isAdmin || roles.includes('shift_lead')` (`src/App.tsx:266`, `EventFormPage.tsx:170`). A responder-role user cannot reach the create/edit event form at all — they can only *read* events they're assigned to (§2's RLS note).
- **Volunteer addresses (§1)** — same shape: only `admin` can INSERT/UPDATE a `user_addresses` row (§1's RLS); a volunteer can view but never edit or search-enter their own address.
- The `location_pin_source = 'responder'` enum value (§2, and the follow-up note below) is schema-reserved for a *future* "pin set from the responder's own device on arrival" flow, but no such UI exists yet — it's provisioned, not implemented.

So, as built, the junctions picker slots into the **existing shift-lead/admin-only** `LocationPlacesField` surface on `EventFormPage` — the same place a Google Places search already lives — as an additional/alternate search source a shift lead or admin uses when setting an event's location. It does **not** reach responders, per the above — location entry hasn't been separately opened up to that role.

**Confirmed scope (2026-09-08), and how it was actually built** — a shift lead/admin types a junction name into the event's location field, it's picked up, and the event is pinned on the map from it. End-to-end, reusing existing machinery with three additions:

1. **Entry** — `LocationPlacesField` currently only queries Google Places predictions. It would additionally match against the new junctions table (merged into, or offered alongside, the Places suggestion list) so a junction name resolves to a selectable result.
2. **Pick-up** — selecting a junction result writes `location_lat`/`location_lng` from the junction's coordinates and sets `location_pin_source = 'junction'` (new enum value), through the same `applyLocationFieldChange()` write path a Places pick already uses. Like `'places'`, this should be a **trusted, locked** source (`LOCKED_SOURCES`) — a human explicitly chose it — not a soft `'geocode'` guess.
3. **On the map** — no new rendering path is needed. `OpsMapPanel`'s event-pin layer (§5) already draws every event from `location_lat`/`location_lng` regardless of `location_pin_source`; a junction-sourced pin appears exactly like a Places-sourced or dragged one, including remaining draggable (a drag would flip its source to `'shift_lead'`, same as any other pin today).

Shipped as (a) the `highway_junctions` table + one-time import, (b) `LocationPlacesField` searching it (`allowJunctions` prop), (c) the `'junction'` pin-source value + `LOCKED_SOURCES` entry, and (d) the `HighwayJunctionsPage` management surface above — the map side needed no changes at all, exactly as predicted.

### The road picklist stays required after picking a junction

`validateEventMinimum` (`eventForm.ts:889`) requires `road_id` **unconditionally** — only the free-text `location` field's requirement is conditional (on `needsPlacesLocation`, §"System שלוחה" above). So picking a junction (which already fully determines the geographic pin) still leaves the `כביש` dropdown red/required, exactly as observed (2026-09-08 screenshot: `location` filled with "צומת מסובים", `road_id` still unselected and flagged "יש לבחור כביש.").

**Revised product decision (2026-09-09):** מיקום appears before כביש. Picking a junction scans its slash-delimited `roads` tokens in order, accepts numeric forms `4` / `כביש 4` / `כביש4`, and uses the first token with exactly one exact road-number match in the active `roads` closed list (`4` never matches `40`/`44`). A match replaces the current road because the junction is the source of truth; the select stays editable so the lead can override it. If no token resolves, the existing road stays unchanged without an error.

The earlier 2026-09-08 decision was to leave road completely manual because multi-road junctions are ambiguous. The 2026-09-09 revision makes location selection authoritative for the initial road while preserving manual control afterward. A dedicated `"צומת"` road-picklist entry remains rejected because it would lose route attribution in reports.

`validateEventMinimum` and `systemDistricts.ts` remain unchanged; the auto-fill is client-side form behavior and persists through the existing `road_id` field.

---

## 5. Map display

### Library & rendering approach

Google Maps **JavaScript API** (not Leaflet/Mapbox), loaded lazily via a single injected `<script>` tag (`loadGoogleMaps()`, `src/lib/googleMaps.ts:134`), keyed by `VITE_GOOGLE_MAPS_API_KEY` (present in Netlify + `.env.local`; length-only — never commit the key), `language=he&region=IL`. The same key is HTTP-referrer restricted. Local Vite is often **`http://localhost:5175`** (5173/5174 taken by other apps). If the Cloud key allowlist has only `localhost:5173` + `yahpz.com`, localhost Maps shows `RefererNotAllowedMapError` and Places New returns `403 API_KEY_HTTP_REFERRER_BLOCKED` while production still works. Add `http://localhost:5175/*` and `http://127.0.0.1:5175/*` (plus 5173–5179) in Google Cloud → APIs & Services → Credentials → that browser key. Rendering type is forced to `RASTER` (not vector) with a custom style hiding POI/business/attraction/transit icons (`OPS_MAP_BASE_STYLES`) — a deliberately "quiet" basemap so operational pins aren't lost in Google's default clutter. The same POI/transit suppression is duplicated for the Static Maps thumbnail (`staticMaps.ts`).

Pins are **not** `google.maps.Marker`/`AdvancedMarkerElement` — they're a hand-rolled `OverlayView` subclass (`createLabeledPin`, `googleMaps.ts:204`) rendering a styled `<div>` (dot + label + optional tooltip), supporting: click, drag-to-reposition (pointer events, with a small movement threshold to distinguish a click from a drag), a distinct "live" variant with an animated car icon (`LIVE_CAR_PATH`), and a "km marker" face variant for mile posts. This custom approach is what makes the live-pin motion interpolation (§3) and the "unavailable volunteer" dimmed styling possible.

### `OpsMapPanel` (`src/components/map/OpsMapPanel.tsx`) — the shared canvas

Two consumers render it: `CockpitPage.tsx` (shift-lead operational view — passes `eventPins` for draggable event markers, `onEventSelect`/`onEventPinMove`) and `UsersMapPage.tsx` (volunteer-only map, no event pins). It composes, in one Google `Map` instance:

| Layer | Source | Notes |
|---|---|---|
| Volunteer/address pins | `fetchActiveUserMapPins()` → `list_unit_map_pins()` RPC (§1) | Clustered at low zoom (`mapCatalogView.ts` — grid-bucket clustering below `CATALOG_CLUSTER_MAX_ZOOM = 10`, not a third-party clusterer); tone/dimming from `mapUserPinChrome` (phone-training vs. regular volunteer; dimmed + tooltip if unavailable per `availability`) |
| Event pins | `eventPins` prop (cockpit only) | Draggable when `onEventPinMove` is supplied → writes back through the pin-lock logic in §2 |
| Live GPS pins | `event_responder_live_locations` via realtime (§3) | Culled to the current viewport bbox, animated between fixes, dropped after 30s stale |
| Police station boundaries | static GeoJSON (`/data/police-station-boundaries.geojson`, `policeStationsMap.ts`/`policeStations.ts`) | Off by default; toggled via the layers menu; hover tooltip with station/מרחב/מחוז name, careful about not colliding with pin hover/focus |
| Kilometer markers ("mile posts") | static JSON (`/data/mile-posts.json`, `src/lib/milePosts.ts`) | On by default; only rendered at zoom ≥14 (or ≥15 if there are >400 in view, to avoid overload); label = km number, tooltip = "כביש X · ק״מ Y" |
| Search pin | Places pick in the "חיפוש כתובת" box | Drives the "מתנדבים קרובים" (nearby volunteers) list (§1) and reframes the map to a 30 km radius around it |

Viewport tracking (`mapCatalogView.ts`: `bboxFromGoogleMap`, `sameViewport`) feeds both the clustering and the mile-post/live-pin culling. View-refit logic (`opsMapView.ts`) is careful not to steal a pan/zoom the user just did: refits happen on init, on search, or on an explicit focus request, but a plain data refresh (`trigger === 'data'`) only refits if the user hasn't manually moved the map yet (`shouldRefitOpsMapView`).

### Static Maps thumbnail

`src/lib/staticMaps.ts` + `EventDetailPage.tsx` — a small non-interactive letterhead-style pin image via the classic Static Maps HTTP API (`maps.googleapis.com/maps/api/staticmap`), used for a compact "here's roughly where" preview on the event detail page. No JS SDK, no click/drag — just a rendered `<img>`.

### Access control on map data

The map itself has no dedicated RLS; each *layer's* data source carries its own access rules already described above: volunteer pins via `list_unit_map_pins()` (any active authenticated user, §1), live GPS pins via `event_responder_live_locations` SELECT policy (admin/shift_lead only, §3), event pins via ordinary event RLS. Police-station boundaries and mile posts are static public files under `/data`, not gated at all.

---

## Notes / possible follow-ups

- `location_pin_source = 'responder'` is defined in the CHECK constraint and in `LOCKED_SOURCES`, with the schema comment "reserved for native arrival (no client/RLS in this slice)" — no current code path actually sets it. It appears to be forward-provisioned for a future native-app "responder arrived, pin from their device" flow, not yet wired up.
- `event_responder_live_locations` keeps only the latest point per assignment; there's no server-side breadcrumb trail even though the client renders short cosmetic motion tweens between the last two points. If a route/trail view is ever wanted, that's a schema change (append-only log instead of upsert-by-PK), not just a UI change.
- "Junctions" (§4) — shipped 2026-09-08 (`feature/highway-junctions`): `public.highway_junctions`, `search_highway_junctions` RPC, `LocationPlacesField` integration, `'junction'` pin source, `HighwayJunctionsPage` admin UI. Revised 2026-09-09: a junction sets `road_id` from its first resolvable exact numeric road token and remains manually editable; client-side cached fuzzy matching works immediately without an RPC migration, and trailing direction text is preserved. No delete/deactivate UI was built for a bad junction row (not requested — remove manually in the DB if ever needed).
- The auto-geocode heuristic (§2) takes the **first** Places Autocomplete prediction for a `road + free text` query with no human confirmation step; it's explicitly treated as a soft/overridable guess (`location_pin_source: 'geocode'`, unlocked, replaceable by any human pin), so this is by design, not an oversight — worth knowing if the guess is ever visibly wrong on a specific event.
