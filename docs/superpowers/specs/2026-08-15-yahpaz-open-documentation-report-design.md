# Yahpaz (יחפ״צ) — Open documentation report (אירועים שהוזנו ע״י אחמ״ש ולא נסגרו ע״י מתנדב) — Design

**Date:** 2026-08-15  
**Repo:** `yhpz-2026`  
**Status:** Approved in brainstorming (Approach 1: extend generic runner)  
**Depends on:** Reports library (`2026-08-14-yahpaz-reports-library-design.md`), PeriodPicker (`periodRange` / שימוש בדלק)

## Problem

Admins and אחמ״ש need a chase-down list: events the shift lead finished entering, where a volunteer still has not completed their documentation (never started, or only a saved draft).

## Goals (v1)

- New report kind in **דוחות וסטטיסטיקות**
- One row per **open participation** (same event may appear more than once)
- PeriodPicker on **`events.event_date`** (same control as שימוש בדלק)
- Fuzzy search on מתנדב, מספר אירוע, כביש ומיקום
- אחמ״ש-only sees events they entered; admin (including admin+אחמ״ש) sees all
- Tap → existing event detail; back keeps period + search
- Hebrew-only RTL, רשומה
- Code-only kind: lib + registry line. No in-app report builder. No schema / RPC / Netlify Functions

## Non-goals (v1)

- Changing app-wide event or participation stamp vocabulary
- Migrating existing reports (`km_summary`, `km_detail`, …) to PeriodPicker
- Changing those reports’ search (they stay substring-on-all-cells)
- Filtering on `created_at`
- Including `draft`, `done`, or cancelled events
- Money, km, shifts
- Responder-only access
- Configurable status rules

## Kind

| Field | Value |
|---|---|
| `id` | `open_documentation` |
| Title | אירועים שהוזנו ע״י אחמ״ש ולא נסגרו ע״י מתנדב |
| Includes | אירועים שהוזנו על ידי אחמ״ש ומתנדב טרם השלים את התיעוד שלהם |
| Audience | `admin_and_shift_lead` |
| Date input | PeriodPicker → inclusive `{ from, to }` on `events.event_date` |
| Default period | 1st of current local month → today (existing `defaultPeriod()`) |
| Drill-in | `eventId` on every row |
| CSV filename | `אירועים-פתוחים-לתיעוד.csv` |

Catalog visibility is unchanged: user sees the kind iff they are `admin`, or they are `shift_lead` and audience is `admin_and_shift_lead`. `super_admin` is not a separate audience.

## Inclusion

A source participation becomes a row when **all** are true:

| Rule | Detail |
|---|---|
| Event status | `in_progress` or `partial` only |
| Cancelled | `is_cancelled = false` |
| Event date | `event_date` inclusive in the resolved period `{ from, to }` |
| Participation | `pending` or `in_progress` (not `done`) |
| Viewer | If viewer is **admin** (role `admin`, with or without `shift_lead`): no extra cut. If viewer is **אחמ״ש-only**: `events.shift_lead_id = viewer.userId`. “Entered” means `shift_lead_id` (creator), not last editor. |

`draft` and `done` events never appear. A `partial` event appears only for the volunteers who are still open.

## Columns

| Header | Source | Empty |
|---|---|---|
| מס אירוע | `police_event_id` | `—` |
| תאריך | `event_date` (existing `formatDate`) | — |
| מתנדב | `full_name · callsign` | `—` if both missing |
| אחמ״ש | shift-lead `full_name · callsign` | `—` if both missing |
| כביש ומיקום | `road_name · location` (skip blanks) | `—` |
| סטטוס תיעוד | see labels below | never empty for included rows |

**סטטוס תיעוד** is report-only. Do not change `status.ts` stamps.

| Participation | Label |
|---|---|
| `pending` | טרם הוזן |
| `in_progress` | נשמרה טיוטה |

## Filters and search

**Period.** Same `PeriodPicker` as שימוש בדלק (טווח / חודש / שנה / אחרונים). Runner resolves via `periodToRange` and passes `{ from, to }` into `load`. Invalid range (`from > to`) → `טווח תאריכים לא תקין`, do not fetch. Other kinds keep their existing from/to date fields.

**Search.** Live, client-side, after load. Reuse the catalog fuzzy matcher (`normalizeReportQuery` + token match / 1-edit / subsequence). Match **only** מתנדב, מס אירוע, and כביש ומיקום — not אחמ״ש, not סטטוס תיעוד, not תאריך. Placeholder: `חיפוש לפי מתנדב, מספר אירוע או מיקום`.

**Sort.** `event_date` desc, then מתנדב display name asc.

**CSV.** Six columns above; rows after period + search; UTF-8 BOM; disabled when no rows.

## Runner

Desktop table (Command) / mobile cards (Field), same generic runner as other kinds.

| State | Copy |
|---|---|
| Invalid period | `טווח תאריכים לא תקין` |
| Load fail | `טעינת הדוח נכשלה. בדקו את החיבור ונסו שוב.` + `רענון` |
| No rows | `אין נתונים להצגה` |
| Loading | existing table/card skeletons |

Tap row → existing event detail. Back to runner with period + search preserved (in-view state, same as today).

## Architecture

Extend the generic runner; do not add a one-off page.

1. **`src/lib/openDocumentationReport.ts`** (+ tests) — fetch, inclusion, grain, labels, viewer cut, sort. Registry only maps rows → `ReportTableRow`.
2. **`ReportKind` / `ReportInputs`** — a kind may opt into PeriodPicker. `load` receives `{ from, to, viewer: { userId, isAdmin } }`. `load` does not call `useAuth` or read session itself. Runner supplies `viewer` from current auth. Existing four kinds ignore the new fields.
3. **Query** — events in range with status `in_progress` \| `partial` and not cancelled; join open participations (`pending` \| `in_progress`) plus responder profile, shift-lead profile, and road. Client-side filter is allowed if the join is simpler; tests own the rules. No new tables, RPCs, or migrations. RLS unchanged; the אחמ״ש-only cut is in `load()`.
4. **Search helper** — extract the catalog fuzzy matcher so `librarySearch` and this report’s row filter share it. Other reports keep `filterReportRows` substring-on-all-cells.

## Testing

- Include: `in_progress` / `partial` + open participation + in-range `event_date`
- Exclude: `draft`, `done`, cancelled, participation `done`, `event_date` outside range
- Grain: two open volunteers on one event → two rows; one done + one open on `partial` → one row
- Labels: `pending` → `טרם הוזן`; `in_progress` → `נשמרה טיוטה`
- Viewer: אחמ״ש-only sees only `shift_lead_id === userId`; admin and admin+אחמ״ש see all
- Search: fuzzy hit on responder / police id / location; no hit on אחמ״ש name or status alone
- Existing lib tests for km / duplicates stay the source of truth for those reports

## Later (not v1)

- PeriodPicker on other report kinds
- Fuzzy search as the default runner search
- Date-range on חריגי ק״מ / אירועים כפולים
