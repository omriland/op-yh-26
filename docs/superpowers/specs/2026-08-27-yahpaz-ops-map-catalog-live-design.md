# Yahpaz — Ops map: catalog + live AVL

**Date:** 2026-08-27  
**Status:** Slices 1–2 implemented in web (`OpsMapPanel`). Slices 3–4 (spreadsheet import, server live fan-out) not started.  
**Repos:** web `op-yh-26` (ops maps). Android `yahpaz-android` is the future GPS **producer** (iOS on hold).  
**Depends on:** unit/cockpit מפה (`OpsMapPanel`), volunteer-status pin colors, live v1 (`2026-08-17-yahpaz-live-location-tracking-design.md`), police stations layer, רשומה.

## Problem

The ops map is a core product surface. It already shows hundreds of features and will take **thousands** (spreadsheet catalog) plus **live responder positions** updating continuously. Today every address is an HTML overlay, addresses load with one all-rows RPC, and live GPS is “Realtime poke → refetch the whole live table.” That will not stay smooth.

## Goal

One Google Map, **two pipes**:

1. **Catalog** — slow-changing points (addresses, stations, spreadsheet types): viewport + zoom, clusters when zoomed out, HTTP/RPC.
2. **Live (AVL)** — latest point per on-duty assignment: persistent channel, subscribe to current view, **deltas** only, interpolate on the animation frame.

Bulk features draw on a **GPU/data layer**. HTML overlays are only for the focused/hover chrome (tooltip, search pin).

## Decisions (locked)

| Topic | Choice |
|---|---|
| Approach | Industry hybrid **B** (not load-all HTML pins; not a full tile/Kafka platform) |
| Base map | **Keep Google Maps** (Places, existing key, מפה + cockpit). No MapLibre switch in this program |
| Catalog transport | Debounced viewport RPC after pan/zoom idle. Not WebSocket |
| Live transport | One channel; client **subscribe(bbox)**; snapshot + upsert/remove deltas |
| Live fan-out v1 | If live set stays small: all live deltas + **client bbox cull**. API shaped for later **server** tile/bbox filter (slice 4) |
| Renderer | GPU overlay on Google Maps (`WebGLOverlayView` or `deck.gl` `GoogleMapsOverlay`). Not `OverlayView` HTML pins for bulk catalog/live |
| Interpolation | Lerp between last two live points on `requestAnimationFrame`. Pause lerp when the tab is hidden; keep subscription |
| Stale live pin | Unchanged: gone after **30s** without ping; returns on next ping |
| Who sees live | `shift_lead` / `admin` on מפה + cockpit. Not responders. Impersonation follows effective JWT |
| Who publishes live | Unchanged table `event_responder_live_locations`. Web track page today; **Android** for pocket/on-duty in a later native slice. iOS not in scope |
| Addresses | Become catalog type `address`. Same visibility: hide `administration` / `basic_training` / `shifts_only`. Colors: `active_volunteer` + `personal_vehicle_training` white (`--text-on-accent` + `--stroke-strong`); `phone_training` `--status-done-tint` / `--status-done`. Unavailable `--status-draft` |
| Nearby 30 km | Unchanged meaning: query **origin + radius**, not “what is on screen” |
| Spreadsheet | Import into catalog tables **after** the file exists. Map never reads Excel at runtime. Geocode **once at import** |
| Events on cockpit | Stay an operational layer (open גלגלת pins). Small count; may keep current pins until a later viewport pass. Not on the live socket |
| Police stations | Stay a layer toggle; migrate onto the catalog/GPU path when convenient, not a blocker for slice 1 |
| Live payload | `{ assignmentId, lat, lng, recordedAt }` (+ heading later). No full event row on every tick |
| Padding | Subscribe/query bbox padded **~25%** so the screen edge is not empty |
| Idle debounce | Apply viewport fetch/subscribe after map **idle** (~200–300ms), not on every `bounds_changed` |

## Architecture

```
Google tiles
    ├── Catalog RPC (bbox, zoom, enabled types) → clusters | points → GPU layer
    ├── Live channel: subscribe(bbox) → snapshot + deltas → GPU sprites + lerp
    └── HTML: search pin, hover/focus tooltip only
```

Catalog and live **must not** share a socket. Spreadsheet rows are catalog.

### Catalog data

- Spatial points in Postgres (PostGIS when the table is added; until then existing `user_addresses` + RPC is enough for slice 1).
- Index on geography/point.
- RLS: catalog types visible to whoever can open **מפה** today (signed-in active user for addresses). Live remains lead/admin.
- Layer toggles omit types (same UX as שכבות).

**Zoom:** below an agreed Google zoom (implementation: cluster when zoom **≤ 10**, individuals when **≥ 11**, tunables in code). Cluster = centroid + count, not a fake volunteer. Cluster uses `--accent` / `--surface-raised` count chrome (רשומה; no new colors).

**RPC shape (catalog):** `bbox, zoom, types[]` → `{ clusters: {lat,lng,count}[], points: {id,type,lat,lng,attrs}[] }`. Cap payload (reject or cluster harder if over cap).

### Live data

- Keep **latest row only** per `event_responder_id` (v1 table). No breadcrumb in this program.
- Producers: `responder-track` `ping` (web); Android later posts the same upsert.
- Consumers: ops maps subscribe; reconnect → **snapshot for current bbox** (missed pings OK).
- Hidden tab: pause interpolation; do not tear down the channel.
- Do not broadcast spreadsheet POIs on this channel.

### Drawing / motion

- Coalesce live deltas per animation frame (one state apply per frame).
- Do not recreate overlay DOM on each ping.
- Hover: existing Hebrew tooltip pattern (`user-map-pin__tip` chrome / equivalent on the GPU hit-test). Live tooltip stays `{סוג · כביש מיקום} · HH:MM`, border `--status-done`. Live disc remains car / `--status-done` (distinct from light-green phone-training **address** pins).

### Error handling

| Failure | UX |
|---|---|
| Catalog RPC fail | Keep last successful catalog; Hebrew alert `טעינת השכבה נכשלה. בדקו את החיבור ונסו שוב.` Retry on next idle |
| Live channel drop | Reconnect with backoff; snapshot on resume; do not empty catalog |
| Missing Maps key | Unchanged empty: `המפה אינה זמינה` |
| Empty catalog in view | Map still shows; no fake pins. Existing empty copy only when there are **no** addresses in the unit at all (slice 1 may keep `אין כתובות להצגה` for that case) |
| Ping refused / assignment ended | Unchanged: delete live row; pin disappears |

### Testing

- Catalog: bbox + zoom returns clusters vs points; hidden volunteer statuses absent; 30 km nearby still origin-based.
- Live: snapshot + upsert + remove; stale 30s; reconnect snapshot; client cull ignores out-of-bbox units.
- Renderer: bulk features are not HTML `.user-map-pin` (except tooltip/search). Golden tests on RPCs/helpers; map panel tests for subscribe debounce if feasible without Google.

## Rollout

| Slice | Scope |
|---|---|
| **1** | GPU/data layer + viewport catalog for **existing address pins**; clusters at low zoom; drop load-all `list_unit_map_pins` as the map’s source of truth (RPC may be replaced or given bbox/zoom) |
| **2** | Live subscribe + deltas + interpolate; remove full-table refetch on every Realtime event |
| **3** | Spreadsheet → catalog types/columns (file required) |
| **4** | Server-side live bbox/tile fan-out if live cardinality requires it |

Slice 1 may ship without PostGIS if bbox filter on `lat`/`lng` columns is enough for Israel-scale addresses; add PostGIS when spreadsheet volume needs it.

## Out of scope

- Switching the ops map to MapLibre
- Kafka / NATS / custom edge WebSocket farm
- iOS producer or consumer
- Background/pocket GPS on web
- Live trails / history playback
- Responders viewing other people’s live positions
- Putting catalog features on the live channel
- Geocoding the spreadsheet on every map open
- Nearby list using live GPS (stays addresses / 30 km until a later product decision)

## Open until spreadsheet

Exact catalog **types**, labels, and layer names. Mechanism above does not change when those arrive.
