# Ops map catalog + live AVL — Implementation Plan

> **For agentic workers:** Execute inline. Slices 3–4 (spreadsheet, server live fan-out) are out of this plan.

**Goal:** Viewport-clustered address catalog and live GPS deltas with interpolation on מפה / cockpit, without HTML overlay per unit-wide pin.

**Architecture:** Keep one address snapshot in memory for nearby-30km. On map idle, pad bbox and either cluster (zoom ≤ 10) or render in-view address pins only. Live: snapshot on connect/reconnect; Realtime payloads upsert/remove; client bbox cull; lerp on rAF.

**Tech Stack:** Vite React TS, Google Maps OverlayView, Supabase Realtime, Vitest.

## Global Constraints

- Hebrew UI only; existing pin color tokens; no new palette.
- Nearby 30 km stays origin+radius, not viewport.
- Live viewers: shift_lead/admin only (unchanged RLS).
- Do not add deck.gl / MapLibre.
- Do not commit unless the user asks.

### Task 1: Catalog viewport helpers

**Files:** `src/lib/mapCatalogView.ts`, `src/lib/mapCatalogView.test.ts`

- [x] Implement `padBbox`, `pointInBbox`, `shouldClusterCatalog`, `catalogViewForViewport`

### Task 2: Live delta + motion helpers

**Files:** `src/lib/liveMapChannel.ts`, `src/lib/liveMapChannel.test.ts`

- [x] Implement delta parse/apply, bbox cull, lerp / motion

### Task 3: Wire maps

**Files:** `src/lib/liveMapPins.ts`, `src/lib/googleMaps.ts`, `src/components/map/OpsMapPanel.tsx`, CSS as needed

- [x] Realtime delta callback; idle viewport; cluster pins; live rAF; pause lerp when `document.hidden`
