# Yahpaz — Android מפה (ops map parity)

**Date:** 2026-09-06  
**Status:** Design approved (approach A)  
**Repos:** Android `yahpaz-android` only. Web `OpsMapPanel` / `UsersMapPage` already shipped. iOS on hold — do not touch.  
**Depends on:** web מפה behavior (`OpsMapPanel`), `list_unit_map_pins`, live AVL (`2026-08-17-yahpaz-live-location-tracking-design.md`), police + mile-post layers, volunteer status / availability chrome, Field theme (`#1D4E89`).

## Problem

Web has a full **מפה** tab (address catalog, Places search-near, layer toggles, pin legend, live AVL for lead/admin). Android intentionally skipped `map` in `mobileNavEntries` because there was no Maps SDK. Responders and leads on the phone cannot use the same ops surface.

## Goal

Ship the standalone **מפה** tab on Android with feature parity to web `UsersMapPage` / `OpsMapPanel` (without the cockpit event drawer).

## Decisions (locked)

| Topic | Choice |
|---|---|
| Scope | Approach **A**: standalone מפה tab = web `UsersMapPage` + shared `OpsMapPanel` features |
| Out of scope | Cockpit open-event pins / drag-to-save; publishing device GPS to AVL; iOS; MapLibre |
| Who opens מפה | Every signed-in active user (same as web — not role-gated) |
| Who sees live AVL | `shift_lead` / `admin` only (RLS on `event_responder_live_locations`). Responders mount the map; live layer is empty |
| Nearby list | Addresses only, **30 km**, best address per user — not live GPS |
| Base map | Google Maps SDK for Android (Maps Compose). Key via `local.properties` `MAPS_API_KEY` → Manifest `com.google.android.geo.API_KEY` |
| Places | Places SDK / Autocomplete — pick from suggestions only (no free-text origin) |
| Catalog source | Existing RPC `list_unit_map_pins()` (load-all + client viewport cull/cluster — match current web, not future bbox RPC) |
| Live transport | Prefer Supabase Realtime on Android if wired cheaply; else **poll every ~5s** while the tab is visible (same SELECT shape as web). Stale after **30s** without ping |
| Layer defaults | תחנות משטרה **off**; אבני קילומטר **on** |
| Static assets | Bundle or fetch the same police GeoJSON + mile-posts JSON used on web (`public/data/…`) |
| Nav | Add `"map"` / `"מפה"` after אנשי קשר; include `map` in secondary rank list after `contacts` (mirror web `mobileNav.ts`) |
| Hebrew / RTL | All UI copy Hebrew; RTL layout |
| Visual | Field theme colors; pin chrome matches web volunteer / phone training / unavailable |

## Product surface

### Tab

- Label: **מפה**
- Placement: after **אנשי קשר** in `mobileNavEntries`
- Ranking: secondary (`shifts`, `contacts`, `map`, `reports`) so responders often keep it in the bar; leads/admins often under **עוד**

### Screen contents

1. Google Map centered on Israel (~31.5, 34.85), zoom ~8  
2. Address catalog pins from `list_unit_map_pins`  
3. Client cluster when zoom ≤ 10; tap cluster → zoom in  
4. Viewport cull with ~25% bbox pad (catalog + live + mile posts)  
5. Places address search → origin pin + **מתנדבים קרובים** list within 30 km  
6. Layer control: police polygons, kilometre posts (zoom gates: show posts at zoom ≥ 14; denser at ≥ 15 if >400 in view — match web)  
7. Pin legend (active / phone training / unavailable)  
8. Live AVL pins + light motion when the viewer manages the unit  
9. Empty / missing-key Hebrew states (aligned with web: map unavailable copy)

### Explicit non-goals (this slice)

- Event pins on the map (cockpit)  
- Dragging / writing `location_lat` / `location_lng`  
- Android as AVL **producer** (already has live-track flow elsewhere; not required for consuming the map)  
- GPU/deck catalog rewrite from the Aug 27 web program  

## Data & auth

| Source | Use | Auth notes |
|---|---|---|
| `list_unit_map_pins` | Address pins | Authenticated active profile; RPC already filters invitees / non-map statuses |
| `event_responder_live_locations` (+ joins for labels as web does) | Live pins | SELECT only for admin / shift_lead |
| Police GeoJSON | Layer | Bundled asset (no auth) |
| Mile-posts JSON | Layer | Bundled asset (no auth) |
| Google Maps / Places | Map + search | Android-restricted API key |

No new tables, RPCs, or RLS for this slice.

## Domain ports (pure Kotlin in `:domain`)

Port web helpers with tests (names can mirror web):

- Pin chrome / visibility from volunteer status + availability  
- Haversine nearby (30 km, one address per user)  
- Catalog viewport pad / cluster / cull  
- Mile-post visibility rules  
- Live stale (30s) + optional lerp helpers  

UI (`MapScreen`) + `YahpazAPI` stay in `:app`.

## App wiring

- `AppTab.MAP` + `appTabForMobileView("map")`  
- `TabBody` → `MapScreen`  
- Tab icon (map/place style, consistent with existing Material icons)  
- Update `MobileNavTest` — stop asserting map is skipped; assert web-like order  

## Success criteria

1. Signed-in responder sees **מפה** and address pins + search-near + layers + legend.  
2. Lead/admin sees the above **plus** live AVL when assignments are tracking.  
3. No Maps key / Maps failure → Hebrew empty state, no crash.  
4. `./gradlew :domain:test` and `:app:assembleDebug` pass.  
5. Key never committed (only `local.properties`).  

## Open implementation notes (not product blockers)

- Realtime vs poll for live: prefer Realtime if the Supabase Kotlin client already supports it with little glue; otherwise poll while tab visible.  
- Cluster library: Maps Utils `ClusterManager` or domain-side cluster + Compose markers — pick whichever stays smaller.  
- Exact Places API (legacy Autocomplete vs Places API New) — follow current Google Android guidance; behavior must remain “pick suggestion only.”  
