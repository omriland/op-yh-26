# Yahpaz (יחפ״צ) — Reports library (דוחות וסטטיסטיקות) — Design

**Date:** 2026-08-14  
**Repo:** `yhpz-2026`  
**Status:** Approved in brainstorming (Approach 1: typed registry + generic runner)  
**Depends on:** fuel refund / detail, km exceptions, duplicate events specs (calc rules unchanged)

## Problem

Admins and אחמ״ש need a single place to **find** a report, set its inputs, read a table, search it, and export CSV. Today those surfaces are split (retired טבלה מסכמת, חריגים hub) and each new report would be a one-off page. Reports are calculation-heavy; they must be added in code with an agent, not authored in the product UI.

## Goals (v1)

- One **library** (catalog) + one **generic runner** for all reports
- **Code-only** report kinds: TypeScript registry. No “דוח חדש”, no in-app report builder
- Each kind declares title, what it includes, audience, inputs, `load`, columns, CSV
- **Two doors, one engine:**
  - Admin: **ניהול → דוחות וסטטיסטיקות** (full library)
  - אחמ״ש only: **כלים לאחמ״ש → דוחות וסטטיסטיקות** (filtered)
  - Admin + אחמ״ש: **one** door (ניהול), full library — not listed twice
- Per-kind **אחמ״ש visibility** flag; admins always see every kind
- v1 kinds: rebuilt km summary + km detail, חריגי ק״מ, אירועים כפולים
- Remove standalone **חריגים** nav (those two reports live in the library)
- Hebrew-only RTL, רשומה. Existing km/inclusion rules stay (no new math)

## Non-goals (v1)

- Creating, editing, or deleting report *kinds* in the UI
- Stats / KPI strip on the library (add when numbers are specified)
- Custom result bodies (maps, charts, workbooks). Non-table later = new runner mode
- **ניהול כרטיסי דלק** as a report (stays an operational workbook)
- Configurable exception threshold, duplicate window, or new calc rules
- Money, liters, shift km in these reports
- Schema migrations, RPCs, Netlify Functions
- Responder-only access

## Approach

**Typed report registry + generic runner.**  
A report is a definition file plus a `load()` that reuses existing libs (`fuelRefundReport`, `fuelDetailReport`, `kmExceptionsReport`, `duplicateEventsReport`). The shell does not know any report by name. Adding a kind = new definition + one registry line, done from Cursor — never from the running app.

## Authoring rule

Operators **run** reports. Developers/agent **register** reports. If a calculation is complex, it belongs in `load()` / a lib with tests, not in the UI.

## Screens

### Library

Landing for `reports`. Title `דוחות וסטטיסטיקות`. No KPI strip in v1.

List of kinds the current user may see (see Audience). Each card:

- **Title** (Hebrew)
- **Includes** — one line of what the report contains

Empty (role has zero kinds): `אין דוחות להצגה`.

Tap a card → runner for that `id`.

### Runner

Back control returns to the library (same catalog, not a different door).

- Title + the same includes line
- **Filter bar** = the kind’s inputs. First run and later edits are the same fields (no separate wizard)
- No inputs → load immediately
- Date range (when declared): default **1st of current month → today** (local), same validation as the old טבלה מסכמת (`טווח תאריכים לא תקין` → do not fetch)
- **Search** — live, client-side, over visible cell text of loaded rows
- **CSV** — current rows after inputs + search; Hebrew headers; filename from the definition
- **Results:** desktop table (Command); mobile cards from the same columns (Field), matching list reports
- Optional **group-by** from the definition (date sections like today’s חריגים)
- If a row has `eventId`, tap opens existing event detail; back returns to the runner with inputs preserved
- Loading: table/card skeletons. Error: `טעינת הדוח נכשלה. בדקו את החיבור ונסו שוב.` + `רענון`. Empty: `אין נתונים להצגה`

## Registry

Each kind:

| Field | Role |
|---|---|
| `id` | Stable English key |
| `title` / `includes` | Card + runner copy |
| `audience` | `admin` or `admin_and_shift_lead` |
| `inputs` | v1: none, or inclusive date range on `events.created_at` |
| `defaults` | Date range: current month → today |
| `load(inputs)` | Fetch + shape rows (existing libs) |
| `columns` | Header, display, CSV, search text |
| `groupBy` | Optional section key (e.g. event date) |
| `eventId` | Optional per row — enables drill-in |
| `csvFilename` | Download name |

Visibility: user sees a kind iff they are `admin`, or they are `shift_lead` and `audience === 'admin_and_shift_lead'`. `super_admin` is not a separate audience.

The runner is generic: render inputs → `load` → table/cards → search → CSV.

## Navigation

| Who | Desktop | Mobile |
|---|---|---|
| Admin (with or without אחמ״ש) | ניהול → דוחות. Do **not** also list דוחות under כלים לאחמ״ש. Remove **חריגים**. | ניהול segment (already): דוחות וסטטיסטיקות |
| אחמ״ש only | כלים לאחמ״ש → דוחות (where **חריגים** was). Remove **חריגים**. | Tab **דוחות** (leads cannot open ניהול) |

`AppView` stays `reports`. Library vs runner is in-view state (like event list vs detail), not two nav items.

## v1 kinds

Calc rules **do not change**; only the shell does. Pointers: `2026-08-10-yahpaz-fuel-refund-report-design.md`, `2026-08-11-yahpaz-monthly-fuel-detail-report-design.md`, `2026-08-10-yahpaz-km-exceptions-report-design.md`, `2026-08-11-yahpaz-duplicate-events-report-design.md`.

| id | Title | Includes | Audience | Inputs | Drill-in |
|---|---|---|---|---|---|
| `km_exceptions` | חריגי ק״מ | אירועים עם 60 ק״מ ומעלה | admin + אחמ״ש | PeriodPicker on `event_date` | event detail |
| `duplicate_events` | אירועים כפולים | אירועים עם אותו הכונן, באותו מקום בחלון זמן של חצי שעה | admin + אחמ״ש | none | event detail |

Retired from the catalog (2026-08-15): `km_summary` / `km_detail` — km usage lives under ניהול דלק.

Retired UI: `FuelRefundPage` / `FuelRefundSegmentBar` / `ExceptionsPage` segment hub are unhooked. Libs stay. **ניהול כרטיסי דלק** unchanged.

## CSV

- UTF-8 with BOM so Excel opens Hebrew
- Columns = definition columns, values after search filter
- Grouping is visual only; CSV is flat
- Disabled when there are no rows to export

## Error / empty copy

| State | Copy |
|---|---|
| Library empty | `אין דוחות להצגה` |
| Invalid date range | `טווח תאריכים לא תקין` |
| Load fail | `טעינת הדוח נכשלה. בדקו את החיבור ונסו שוב.` + `רענון` |
| No rows | `אין נתונים להצגה` |

## Testing

- Audience filter: admin sees four kinds; אחמ״ש sees only `km_exceptions` + `duplicate_events`; responder sees none
- Combo admin+אחמ״ש: full library; nav does not duplicate דוחות
- Date range: invalid `from > to` does not call `load`
- Search: filters rows; CSV matches the filtered set
- Existing lib tests stay the source of truth for km / duplicates math

## Added after v1

| id | Title | Spec |
|---|---|---|
| `open_documentation` | אירועים שהוזנו ע״י אחמ״ש ולא נסגרו ע״י מתנדב | `2026-08-15-yahpaz-open-documentation-report-design.md` |

## Later (not v1)

- Stats strip on the library (content TBD)
- More kinds (we add definitions here)
- Date range on exceptions / duplicates
- Custom result views
- `yahpz.com` / Resend unrelated
