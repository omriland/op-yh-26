# Treated plate brand logos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist manufacturer + logo slug from data.gov.il on treated plates, vendor curated car logos, show logo (no brand text) before the plate on web fill/detail and Android fill.

**Architecture:** Extend `event_treated_plates` with `manufacturer` / `logo_slug`. Client lookup adds `tozeret_nm`; pure `resolveCarLogoSlug` maps Hebrew manufacturer → slug. Optimized PNGs live in `public/car-logos/` (web) and Android `assets/car-logos/`. UI renders `<img>` / Coil from slug; miss omits logo.

**Tech Stack:** Vite/React/TS, Vitest, Supabase, Compose Kotlin, curated PNGs from filippofilip95/car-logos-dataset.

**Spec:** `docs/superpowers/specs/2026-08-18-yahpaz-treated-plate-brand-logos-design.md`

## Global Constraints

- Hebrew-only UI, full RTL
- Do not touch `yahpaz-ios` (on hold)
- Do not kill/restart Vite on `:5173`
- Logo only — no manufacturer text in caption
- Caption stays `model · color · left_where`
- GitHub user `omriland`

## File map

**Create (op-yh-26)**
- `src/lib/carLogoMap.ts` + `carLogoMap.test.ts`
- `src/components/events/CarLogo.tsx`
- `public/car-logos/*.png` (curated)
- `supabase/migrations/20260818130000_treated_plates_manufacturer_logo.sql`

**Modify (op-yh-26)**
- `src/lib/treatedPlates.ts` / tests — `manufacturer`, `logo_slug`
- `src/lib/plateLookup.ts` / tests — `tozeret_nm`
- `src/lib/responderFill.ts`, `events.ts`, `shiftBornFill.ts` — select/insert
- `TreatedPlatesField.tsx`, `TreatedPlateStack.tsx`, CSS
- Fill pages lookup patch
- `supabase/functions/responder-fill/index.ts` + redeploy
- shift-born RPC in same migration

**Create/modify (yahpaz-android)**
- `domain/.../CarLogoMap.kt` + test
- `TreatedPlates.kt` fields
- `PlateLookup.kt` manufacturer
- Assets + FillScreen `CarLogo` composable
- Models / YahpazAPI select+insert

---

### Task 1: Logo map + assets (web)

**Files:** Create `src/lib/carLogoMap.ts`, test, `public/car-logos/`

- [ ] Failing tests: `פולקסווגן גרמנ` → `volkswagen`; `סאנגיונג ד.קור` → `ssangyong`; unknown → null
- [ ] Implement normalize + longest-first Hebrew map + Latin fallback
- [ ] Sparse-checkout/copy curated optimized PNGs for mapped slugs into `public/car-logos/{slug}.png`
- [ ] Commit

### Task 2: Lookup + treated plate types

**Files:** `plateLookup.ts`, `treatedPlates.ts` + tests

- [ ] Lookup returns `manufacturer`; commit/map rows include `manufacturer` + `logo_slug`
- [ ] Helper or call site: after lookup, set `logo_slug = resolveCarLogoSlug(manufacturer)`
- [ ] Commit

### Task 3: Migration + save paths + Edge

**Files:** migration, responderFill, events, shiftBornFill, Edge, RPC

- [ ] Add columns; update RPC insert; wire selects/inserts; deploy Edge
- [ ] Commit

### Task 4: Web UI

**Files:** `CarLogo.tsx`, TreatedPlatesField, TreatedPlateStack, CSS

- [ ] Logo before plate (24–28px); hide on miss/error
- [ ] Commit

### Task 5: Android parity

**Files:** domain map + TreatedPlates + PlateLookup + assets + FillScreen + API

- [ ] Same behavior; assets under `app/src/main/assets/car-logos/{slug}.png`
- [ ] Commit

### Task 6: Verify

- [ ] Web vitest + tsc; Android `:domain:test`
- [ ] Smoke: 71386301 / 37353501 logos; no iOS edits
