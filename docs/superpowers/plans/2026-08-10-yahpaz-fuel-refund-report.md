# Fuel Refund Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin-only page החזר דלק that filters by date range and shows per-active-user km / first-last odometer / event counts from done event participations.

**Architecture:** Client-side aggregation in `fuelRefundReport.ts` (pure + fetch); `FuelRefundPage.tsx` UI; wire `fuel_refund` into App nav under ניהול. No schema changes.

**Tech Stack:** Vite + React + TS, Supabase client, Vitest, רשומה design system

## Global Constraints

- Hebrew-only UI, full RTL
- Admin role only
- Source: `done` event_responders + event_date range; all active profiles as rows
- Spec: `docs/superpowers/specs/2026-08-10-yahpaz-fuel-refund-report-design.md`

---

## File map

| File | Responsibility |
|---|---|
| `src/lib/fuelRefundReport.ts` | Types, date helpers, `buildFuelRefundRows`, fetch |
| `src/lib/fuelRefundReport.test.ts` | Aggregation unit tests |
| `src/pages/FuelRefundPage.tsx` | Filters + table |
| `src/App.tsx` | View + nav + render |
| `src/components/shell/AppShell.tsx` / icons if needed | Nav icon |

## Task 1: Aggregation lib (TDD)

- [ ] Write failing tests for buildFuelRefundRows (idle, sum, null km, chronological first/last, sort)
- [ ] Implement until green
- [ ] Add fetch helpers + default date range

## Task 2: Page UI

- [ ] FuelRefundPage with date filters, table, loading/error/empty
- [ ] Follow existing admin list page patterns

## Task 3: Wire app

- [ ] AppView `fuel_refund`, admin nav, mobile hub
- [ ] Gate non-admin

## Task 4: Verify

- [ ] `npm test` / `npx vitest` for fuelRefundReport
- [ ] `npm run build` exit 0
