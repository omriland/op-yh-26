# KM Exceptions Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lead-tools page **דוח חריגי קמ** listing each `done` responder participation with `total_km >= 60`, tap opens event detail.

**Architecture:** Pure flatten/filter/sort in `kmExceptionsReport.ts` + Supabase fetch; `KmExceptionsPage` (cards mobile / table desktop); wire `km_exceptions` under כלים לאחמ״ש. No schema changes.

**Tech Stack:** Vite + React + TS, Supabase client, Vitest, רשומה design system

## Global Constraints

- Hebrew-only UI, full RTL (`lang=he`, `dir=rtl`)
- Visible to `shift_lead` + `admin` (`manages`)
- Threshold hardcoded `KM_EXCEPTION_THRESHOLD = 60`
- Cancelled events included; one row per exceptional responder
- Spec: `docs/superpowers/specs/2026-08-10-yahpaz-km-exceptions-report-design.md`

---

## File map

| File | Responsibility |
|---|---|
| `src/lib/kmExceptionsReport.ts` | Types, threshold, `buildKmExceptionRows`, `fetchKmExceptionRows` |
| `src/lib/kmExceptionsReport.test.ts` | Filter/sort unit tests |
| `src/pages/KmExceptionsPage.tsx` | List UI + states |
| `src/components/shell/AppShell.tsx` | `AppView` + `NAV_ICONS` |
| `src/App.tsx` | Nav entry + page + event detail from report |

---

### Task 1: Pure report builder (TDD)

**Files:**
- Create: `src/lib/kmExceptionsReport.ts`
- Test: `src/lib/kmExceptionsReport.test.ts`

**Produces:**
- `KM_EXCEPTION_THRESHOLD = 60`
- `buildKmExceptionRows(events: KmExceptionEventSource[]): KmExceptionRow[]`
- `KmExceptionRow`: `{ event_id, event_date, is_cancelled, police_event_id, location, event_type_name, road_name, shift_lead_name, shift_lead_callsign, responder_name, responder_callsign, total_km }`

- [x] **Step 1: Write failing tests** covering: 59 excluded / 60 included; null km excluded; non-done excluded; cancelled included; two responders ≥60 → two rows; sort date desc then km desc

- [x] **Step 2: Run** `npm test -- src/lib/kmExceptionsReport.test.ts` — expect FAIL (module missing)

- [x] **Step 3: Implement** `buildKmExceptionRows` + types + constant

- [x] **Step 4: Run tests** — expect PASS

- [x] **Step 5: Add** `fetchKmExceptionRows()` selecting events with nested responders/profiles/lookups needed for rows

---

### Task 2: KmExceptionsPage UI

**Files:**
- Create: `src/pages/KmExceptionsPage.tsx`
- Consumes: `fetchKmExceptionRows`, `KmExceptionRow`, format helpers, EmptyState, skeletons, EventTypeLabel pattern for cancelled

- [x] **Step 1: Page** title `דוח חריגי קמ`; load on mount; loading / error+רענון / empty `אין חריגי ק״מ להצגה`
- [x] **Step 2: Mobile** cards grouped by date; show km, responder, type, place, אחמ״ש, police id; cancelled via EventTypeLabel-compatible props
- [x] **Step 3: Desktop** `asTable` table with columns from spec; row click → `onOpen(event_id)`

---

### Task 3: App wiring

**Files:**
- Modify: `src/components/shell/AppShell.tsx` — add `km_exceptions` to `AppView` + icon (e.g. `Gauge` or `Route` from lucide)
- Modify: `src/App.tsx` — nav under כלים לאחמ״ש after shifts; render page; when view is `km_exceptions` and eventSurface is detail, show EventDetailPage with back to report list

- [x] **Step 1: AppView + icon + nav label** `דוח חריגי קמ`
- [x] **Step 2: Render** KmExceptionsPage when view active and list surface
- [x] **Step 3: Detail** from report uses same EventDetailPage; `onBack` → list on km_exceptions

---

### Task 4: Verify

- [x] `npm test -- src/lib/kmExceptionsReport.test.ts`
- [x] `npm run build` exit 0
- [x] Update `.cursor/memory/MEMORY.md` if status changes (design → implemented)
