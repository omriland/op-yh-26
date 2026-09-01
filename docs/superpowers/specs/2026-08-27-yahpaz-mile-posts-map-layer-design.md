# Yahpaz — Kilometre posts on מפה

**Date:** 2026-08-27  
**Status:** Approved for implementation  
**Repos:** web `op-yh-26` only (ops מפה + cockpit map). Not Android; iOS on hold.  
**Depends on:** `OpsMapPanel` layers control, catalog viewport helpers, רשומה.

## Problem

Gov.il `MILE_POST` is **6,504** integer kilometre markers in **Israel TM**. Drawn like volunteer discs they bury the map.

## Goal

A **reference overlay**: layer **אבני קילומטר**, on by default; still only at useful zoom, only in view, as small km numerals.

## Decisions (locked)

| Topic | Choice |
|---|---|
| Layer copy | `אבני קילומטר` in שכבות (same menu as `תחנות משטרה`) |
| Default | **On**. `תחנות משטרה` default **off** |
| Who sees | Same as מפה today (every signed-in user on unit map + cockpit drawer) |
| Geometry | Import **כביש** only (**6,325**). **רמפה** (179) out of v1 |
| CRS | Convert **EPSG:2039** (Israel TM + Israel 1993→WGS84) via PROJ `cs2cs`; map never reads the shapefile. Use **SHP** xy, not rounded DBF X/Y |
| Runtime source | Bundled `public/data/mile-posts.json` `{ road, km, lat, lng }[]`. Not Postgres v1. Not the live channel |
| Zoom ≤ 13 | Draw **nothing** (no cluster bubbles — those look like volunteer groups) |
| Zoom ≥ 14 | Viewport-padded posts as **km numerals**, not 16px volunteer discs |
| Dense cap | If in-view count **> 400** and zoom **< 15**, draw nothing until zoom ≥ 15. No extra Hebrew copy |
| Hover / focus | `כביש {ROAD} · ק״מ {KM}` — existing pin tooltip chrome (`--surface-raised`, `--accent` border) |
| Chrome | IL roadside stone, **fixed screen size** (OverlayView CSS px — does not scale with map zoom): landscape `--space-10` × `--space-6` plate, 2px `--km-post-border` rim, white `--km-post-face`, black `--km-post-ink` 12/16 mono km. **No post, no chevron.** Hit slop 44×44 around the plate. Toggle the layer to rebuild pins. |
| Legend | Do **not** add a volunteer swatch. Toggle is the checkbox only |
| Closed-list roads | Do not join `roads` UUIDs. Display `כביש ${road}` from the gov number string |

## Architecture

```
SHP (Israel TM) → import script → public/data/mile-posts.json
OpsMapPanel: fetch JSON when layer first enabled
  → pad bbox + zoom gate + 400 cap
  → OverlayView chips (user-map-pin--km)
```

Volunteer catalog, live AVL, and police GeoJSON stay separate.

## Error handling

| Failure | UX |
|---|---|
| JSON fetch fail | Toast `טעינת השכבה נכשלה. בדקו את החיבור ונסו שוב.` Layer stays checked; map otherwise unchanged |
| Empty in view / zoom too low / cap | Map unchanged; no empty-state copy for this layer |

## Out of scope

Ramps, snap-to-km for events, search-by-km, Android, live channel, PostGIS, GPU/WebGL unless the 400-cap still janks.

## Testing

- Ramp rows excluded; bundled JSON count and Israel bbox
- `shouldShowMilePosts`: off / zoom 13 / zoom 14 with 400 vs 401 / zoom 15 with 401
- Tooltip copy; viewport cull uses padded bbox
- Default layers: `policeStations: false`, `milePosts: true`
