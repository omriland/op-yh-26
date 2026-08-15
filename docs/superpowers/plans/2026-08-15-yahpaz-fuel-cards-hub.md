# Fuel cards hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Split ניהול כרטיסי דלק into a two-card hub (allocate vs usage) with a רשומה-skinned period picker and a liters usage export.

**Architecture:** In-view hub on existing `fuel_quarter`. Pure `periodRange` + `fuelUsage` libs. Usage reuses `loadFuelRefundReport`. Calendar via react-day-picker (Gregorian, RTL).

**Tech Stack:** Vite + React + TS, vitest, react-day-picker, existing Supabase client libs.

## Global Constraints

- Hebrew-only UI, `dir=rtl`, רשומה semantic tokens only
- CSS logical properties; no physical left/right
- Km = `event_responders.total_km`; liters = km / 6
- No schema / RLS / report-runner changes
- Do not use `react-day-picker/hebrew` (Jewish calendar)

---

### Task 1: Period math

**Files:**
- Create: `src/lib/periodRange.ts`
- Test: `src/lib/periodRange.test.ts`

**Produces:** `PeriodValue`, `periodToRange(value, now)`, `formatPeriodLabel(value, now)`, `defaultPeriod(now)`, `RECENT_PRESETS`

- [ ] TDD `periodToRange` / labels with `now = 2026-08-15`
- [ ] Implement clamp-to-today and inclusive day/month presets

### Task 2: Usage liters + totals

**Files:**
- Create: `src/lib/fuelUsage.ts`
- Test: `src/lib/fuelUsage.test.ts`

**Produces:** `litersFromKm`, `formatLiters`, `usageTotals`, `toUsageRows`

- [ ] TDD liters (one decimal) and totals (`withKm` = `total_km > 0`)

### Task 3: PeriodPicker + usage panel + hub

**Files:**
- Create: `src/components/admin/PeriodPicker.tsx`, `src/components/admin/FuelUsagePanel.tsx`, `src/components/admin/FuelQuarterWorkbook.tsx`
- Modify: `src/pages/FuelQuarterPage.tsx`, `src/styles/components.css`, `design-system-design-instructions/screens/admin.md`
- Add dep: `react-day-picker`

- [ ] Extract workbook; hub chooser with two cards
- [ ] Usage panel: picker, totals, search, CSV, table/cards
- [ ] Skin DayPicker with semantic tokens

### Task 4: Verify

- [ ] `npm test` and `npm run build` exit 0
