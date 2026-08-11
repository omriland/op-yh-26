# Monthly fuel detail (פירוט דלק) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add סיכום | פירוט segment on החזר דלק with one row per participation (`total_km` set) filtered by `events.created_at`.

**Architecture:** Pure `buildFuelDetailRows` + fetch in `fuelDetailReport.ts`; reuse date helpers from `fuelRefundReport.ts`; segment UI on `FuelRefundPage`.

**Tech Stack:** Vite + React + TS, Vitest, Supabase client, רשומה UI

## Global Constraints

- Hebrew-only RTL UI; admin only
- Canonical km = `event_responders.total_km` only
- No schema / CSV / row tap / odometers / shifts
- Spec: `docs/superpowers/specs/2026-08-11-yahpaz-monthly-fuel-detail-report-design.md`

---

## File map

| File | Responsibility |
|---|---|
| `src/lib/fuelDetailReport.ts` | Types, builder, fetch, load |
| `src/lib/fuelDetailReport.test.ts` | Unit tests for builder |
| `src/components/admin/FuelRefundSegmentBar.tsx` | סיכום / פירוט chips |
| `src/pages/FuelRefundPage.tsx` | Segment + both views |
| `design-system-design-instructions/screens/admin.md` | Document segment |

---

### Task 1: Pure detail builder (TDD)

**Files:** `src/lib/fuelDetailReport.ts`, `src/lib/fuelDetailReport.test.ts`

- [x] Write failing tests: exclude null km; include 0; sort created_at desc then callsign; empty location/notes/started_at
- [x] Implement `buildFuelDetailRows` + types (row carries ISO created_at / started_at; UI formats with `formatDate` / `formatTime`)
- [x] Add `fetchFuelDetailParticipations` + `loadFuelDetailReport` (reuse `localDateRangeToUtcBounds`)
- [x] `npx vitest run src/lib/fuelDetailReport.test.ts`

### Task 2: Page UI + segment

**Files:** `FuelRefundSegmentBar.tsx`, `FuelRefundPage.tsx`, `admin.md`

- [x] Segment bar; default סיכום
- [x] פירוט table/cards + empty/error/loading
- [x] Update admin.md fuel section
- [x] `npx tsc --noEmit` + vitest for fuel detail
