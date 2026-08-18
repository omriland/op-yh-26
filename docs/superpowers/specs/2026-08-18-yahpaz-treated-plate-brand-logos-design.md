# Yahpaz — Treated plate brand logos

**Date:** 2026-08-18  
**Repos:** `op-yh-26` (web + Edge + DB) · `yahpaz-android`  
**Status:** Approved in brainstorming (Approach A: vendored curated logos + persisted manufacturer/slug)  
**Depends on:** `2026-08-18-yahpaz-treated-plates-design.md`  
**Out of scope:** `yahpaz-ios` (native iOS on hold — do not touch)

## Problem

Treated-plate rows already show plate mark + `model · color · left_where` from data.gov.il. Responders also want a **manufacturer logo** on fill and event detail so the row is scannable at a glance. Registry manufacturer names are Hebrew (`tozeret_nm`, often with a country suffix); logo assets are English slugs.

## Goals

- On plate **commit** lookup, also fetch and persist manufacturer from data.gov.il (`tozeret_nm`)
- Resolve a logo slug via a curated Hebrew→slug map; persist the slug when known
- Show a small logo **only** (no brand text) next to the plate on:
  - Web fill (committed rows + read-only stack)
  - Web event detail (`TreatedPlateStack`)
  - Android fill (committed / read-only rows)
- Vendor optimized PNGs from [car-logos-dataset](https://github.com/filippofilip95/car-logos-dataset) (`logos/optimized`) for an Israeli-common curated set
- Miss (unknown maker / no file) → no logo; plate + caption unchanged

## Non-goals

- Showing manufacturer / brand as text in the caption
- Full 387-logo dump
- Hotlinking `raw.githubusercontent.com`
- iOS native port (on hold)
- Logo on the volunteer’s own `לוחית רישוי` select / profile vehicles (unless already out of scope)
- Perfect matching of every exotic `tozeret_nm` string on day one

## Decisions (locked)

| Topic | Choice |
|---|---|
| Logo source | Vendored `optimized` PNGs (curated Israeli set) |
| UI | Logo only — no brand text |
| Clients | Web + Android; skip iOS |
| Registry field | `tozeret_nm` |
| Storage | `manufacturer text` + `logo_slug text` on `event_treated_plates` |
| Resolve | At lookup/commit; store slug; render from slug |
| Caption line | Unchanged: `model · color · left_where` (skip empty parts) |
| Placement | Inline before the plate mark: `[logo] [plate] meta…` |

## Data model

```sql
alter table public.event_treated_plates
  add column if not exists manufacturer text,
  add column if not exists logo_slug text;
```

- `manufacturer` — raw trimmed `tozeret_nm` from the registry (Hebrew/English as returned). Nullable.
- `logo_slug` — English slug matching a vendored file stem (e.g. `volkswagen`). Nullable when unmapped.
- Existing replace-the-list save paths (web, Edge, shift-born RPC, Android) must include both columns.
- Lookup `fields` add `tozeret_nm` alongside `kinuy_mishari`, `tzeva_rechev`.

## Brand → logo map

- Pure helper (web `src/lib/carLogoMap.ts`, Android `:domain` equivalent): given `tozeret_nm`, return `logo_slug | null`.
- Matching strategy (v1):
  1. Normalize: trim, collapse spaces, strip common country suffixes (`גרמנ`, `ד.קור`, `יפן`, `סין`, …) and trailing punctuation.
  2. Prefix / contains table of Hebrew (and occasional Latin) keys → slug, ordered longest-first (e.g. `סאנגיונג` → `ssangyong`, `פולקסווגן` → `volkswagen`, `יונדאי` → `hyundai`).
  3. Optional Latin fallback: if normalized string contains a known English brand token, map it.
- Start with ~40–80 Israeli-common brands present in the dataset; extend the map when production misses appear (log optional later — not required in v1).
- Asset path convention:
  - Web: `/car-logos/{slug}.png` under `public/car-logos/`
  - Android: `res/drawable/car_logo_{slug_with_underscores}.png` (or assets folder with slug filenames — pick one style in the plan and keep consistent)

## UI

- Logo size ~24–28 px square (or height matching the compact plate), `object-fit: contain`, no border unless needed for contrast on Field surface.
- If `logo_slug` is null or the asset 404s, omit the image (no broken-icon placeholder).
- Fill edit row and `TreatedPlateStack` / Android row share the same order: logo → plate → meta.

## Clients / API

| Surface | Change |
|---|---|
| Web `plateLookup` | Request + parse `tozeret_nm`; return `{ model, color, manufacturer }` |
| Web commit path | Set `manufacturer`, resolve `logo_slug`, patch row after lookup |
| Web save / Edge / shift-born RPC | Persist `manufacturer`, `logo_slug` |
| Web UI | `CarLogo` / img next to `LicensePlate` |
| Android domain + Fill | Same fields, map, drawable/assets, Compose `Image` |
| iOS | **No changes** |

## Licensing note

Logos remain property of their respective owners (dataset MIT for packaging; trademark use is display-only in-app). Do not claim ownership in UI copy.

## Acceptance

1. Commit plate `71386301` → model/color as today; manufacturer stored; SsangYong (or mapped) logo appears beside the plate on fill.
2. Commit `37353501` → VW logo + Tiguan meta.
3. Unmapped `tozeret_nm` → no logo; plate still commits.
4. Event detail stack shows the same logo when `logo_slug` is set.
5. Android fill matches web behavior.
6. No edits under `yahpaz-ios`.

## Open follow-ups (not this slice)

- Expand map from real miss list
- Optional admin tooling to alias Hebrew strings → slugs
- Resume iOS when hold lifts
