# Reports library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the reports placeholder and חריגים hub with a code-only report registry, library catalog, and generic runner (filters, search, CSV).

**Architecture:** Pure registry + visibility/search/CSV helpers. Four v1 kinds wrap existing load libs (no new math). One `ReportsPage` (library + runner). Two nav doors, one `AppView` `reports`. Event drill-in keeps the runner mounted (`hidden`) so inputs survive.

**Tech Stack:** Vite React TS, Vitest, existing Supabase report libs, רשומה UI.

**Spec:** `docs/superpowers/specs/2026-08-14-yahpaz-reports-library-design.md`

## Global Constraints

- Hebrew RTL only; no in-app report builder
- Km math unchanged: `event_responders.total_km` only; date range on `events.created_at`
- Audience: admin sees all; אחמ״ש sees `admin_and_shift_lead` only
- Admin+אחמ״ש: ניהול door only (no duplicate under כלים לאחמ״ש)
- No KPI strip in v1; no schema/RPC/Functions

---

### Task 1: Registry primitives (TDD)

**Files:**
- Create: `src/lib/reports/access.ts`, `src/lib/reports/access.test.ts`
- Create: `src/lib/reports/search.ts`, `src/lib/reports/search.test.ts`
- Create: `src/lib/reports/csv.ts`, `src/lib/reports/csv.test.ts`
- Create: `src/lib/reports/types.ts`

**Produces:** `ReportKind`, `ReportTableRow`, `reportsNavPlacement`, `visibleReportKinds`, `filterReportRows`, `toCsv`, `csvWithBom`

- [ ] Types: `ReportAudience`, `ReportInputs`, `ReportColumn`, `ReportTableRow` (`id`, `values: string[]`, optional `eventId` / `groupKey` / `groupLabel`), `ReportKind` (`id`, `title`, `includes`, `audience`, `hasDateRange`, `csvFilename`, `columns`, `load`)
- [ ] `reportsNavPlacement(roles)` → `'admin' | 'shift_lead' | 'none'` (admin wins)
- [ ] `visibleReportKinds(kinds, roles)` — admin all; shift_lead only `admin_and_shift_lead`; responder none
- [ ] `filterReportRows(rows, query)` — trim, case-insensitive substring on `values`; empty query = all
- [ ] `toCsv(headers, rows)` + `csvWithBom` (UTF-8 BOM prefix `\uFEFF`); escape quotes/commas/newlines

### Task 2: Four v1 kinds + registry

**Files:**
- Create: `src/lib/reports/registry.ts`, `src/lib/reports/registry.test.ts`

**Consumes:** Task 1 types; `loadFuelRefundReport`, `loadFuelDetailReport`, `fetchKmExceptionRows`, `fetchDuplicateClusters`; `formatDate`, `formatNumber`, `formatTime`

- [ ] `REPORT_KINDS`: `km_summary`, `km_detail`, `km_exceptions`, `duplicate_events` with spec titles/includes/audience/inputs
- [ ] Map existing rows → `ReportTableRow` (columns per old tables). Duplicates flatten members; `groupKey` = cluster id; `groupLabel` = `date · sizeLabel`. Exceptions `groupKey` = `event_date`
- [ ] Tests: ids + audiences; visibility counts (admin 4, shift_lead 2, responder 0)

### Task 3: Library + runner UI

**Files:**
- Modify: `src/pages/ReportsPage.tsx`
- Create: `src/components/reports/ReportRunner.tsx`
- Modify: `src/lib/adminSegments.ts` + test — library empty is title only (`אין דוחות להצגה`); drop “יופיעו כאן בהמשך”

- [ ] Library: cards (title + includes) from `visibleReportKinds(REPORT_KINDS, roles)`
- [ ] Runner: back `חזרה לדוחות`; date range via `defaultFuelRefundRange` / `isValidFuelRefundRange`; search `חיפוש בדוח`; `ייצוא CSV` (disabled if no filtered rows); desktop table / mobile cards; group-head when `groupKey` set; row click → `onOpenEvent` if `eventId`
- [ ] Copy: load fail + `רענון`; empty `אין נתונים להצגה`

### Task 4: Nav two doors + App wiring

**Files:**
- Modify: `src/App.tsx`, `src/components/shell/AppShell.tsx`
- Modify: `design-system-design-instructions/screens/admin.md`

- [ ] `reports` allowed for `manages` (admin or shift_lead), not admin-only
- [ ] Replace חריגים with דוחות under כלים לאחמ״ש when `!isAdmin`; mobile tab `דוחות` for אחמ״ש only
- [ ] Remove `exceptions` AppView / `ExceptionsPage` from App (pages/libs stay)
- [ ] Event form/fill/detail host includes `onReports`; keep `ReportsPage` mounted with `hidden` while detail is open
- [ ] Admin mobile segment still includes reports; admin hub wrapper only when `isAdmin`

### Task 5: Verify

- [ ] `npx vitest run` all green
- [ ] `npx tsc --noEmit -p tsconfig.app.json` exit 0
