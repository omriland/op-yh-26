# Quarterly fuel request (דרישת דלק) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or implement task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin-only quarterly fuel workbook with draft save, lock, and balance carry.

**Architecture:** Migration `fuel_quarters` + `fuel_quarter_distributions`; pure math + row builder; page under ניהול; admin RLS only.

**Tech Stack:** Vite React TS, Vitest, Supabase

## Global Constraints

- Admin only; Hebrew RTL; `total_km` + `created_at`; KM_PER_LITER=6; LITERS_PER_CARD=15; floor cards; no unlock UI
- Spec: `docs/superpowers/specs/2026-08-11-yahpaz-quarterly-fuel-request-design.md`

---

### Task 1: Math + row builder (TDD)

- [x] `fuelQuarterMath.ts` + tests
- [x] `fuelQuarterReport.ts` pure builders (months, inclusion, merge) + tests

### Task 2: Migration

- [x] `supabase/migrations/20260811120000_fuel_quarters.sql` + admin RLS

### Task 3: Fetch/save/lock + UI + nav

- [x] Load/save/lock in `fuelQuarterReport.ts`
- [x] `FuelQuarterPage.tsx`
- [x] AppView `fuel_quarter`, AdminSegmentBar, App.tsx, AppShell icon
- [x] Update `admin.md`
- [x] `vitest` + `tsc --noEmit`
