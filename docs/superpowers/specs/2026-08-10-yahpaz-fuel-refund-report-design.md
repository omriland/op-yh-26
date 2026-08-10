# Yahpaz (יחפ״צ) — Fuel refund report (החזר דלק) — Design

**Date:** 2026-08-10  
**Repo:** `yhpz-2026`  
**Status:** Approved in brainstorming (Approach 1); **revised 2026-08-10** — `total_km` only; filter by `events.created_at`; no odometer columns.  
**Depends on:** `2026-08-09-yahpaz-volunteers-events-design.md` (profiles, events, `event_responders`)

## Problem

Responders receive a fuel refund based on kilometers driven in a chosen period. Admins need a single screen that lists users, filters by start/end date (by **when the event was reported**), and shows per-user lead-entered km plus how many events they were on in that period.

## Goals (v1)

- Admin-only report page under **ניהול**
- Inclusive date range filter on event **`created_at`** (local calendar days; when the shift-lead created/reported the event)
- Table of **all active users** with:
  - total kilometers (`sum` of `event_responders.total_km` only)
  - event count (participations on events reported in range)
- Client-side aggregation from existing event participation data
- Hebrew-only RTL UI in the רשומה design system

## Non-goals (v1)

- Using `odometer_start` / `odometer_end` for any calculation or display on this page (logging only)
- Shift odometer / shift km (shifts are vehicle-level, not per responder)
- Money calculation (rate × km)
- CSV / spreadsheet export
- Responder or shift-lead access to the report
- Editing km or events from this page
- Schema migrations or RPCs
- Netlify Functions

## Approach

**Admin report page + client-side aggregation.**  
Fetch active profiles and **all** `event_responders` joined to events whose `created_at` falls in the date range; aggregate in TypeScript. No new tables. Fits the existing RLS-only client model.

## Data source

| Metric | Source |
|---|---|
| Users | `profiles` where `active = true` |
| Participations | `event_responders` with **`total_km` not null** on matching events (any participation / event status / cancelled) |
| Date filter | Parent `events.created_at` inclusive between local `from` 00:00:00 and `to` 23:59:59.999 |
| Kilometers | `event_responders.total_km` only. **Never** odometer fields |

Shifts are **not** included.

## Product rule (km)

**Canonical km for refunds and any future km math:** `event_responders.total_km` (entered by the shift-lead). Odometer start/end are for logging/audit only.

## Aggregation rules

### Rows

- One row per active profile (`active = true`), including invite-pending users who are still active.
- Inactive users never appear.
- Sort: `full_name` ascending (Hebrew locale collation in UI is fine; default string sort acceptable for v1).

### Date range

- Inclusive local calendar days on `events.created_at`.
- Default when opening the page: **1st of current calendar month → today** (local date).
- If `from > to`: show inline error `טווח תאריכים לא תקין`; do not fetch.

### Included participations

- `event_responders` where **`total_km` is not null** (shift-lead entered km; `0` counts)
- Parent event’s `created_at` is in range
- **No** filter on event `status`, participation `status`, or `is_cancelled`
- Unique `(event_id, responder_id)` already guarantees one participation per event per user

### Per-user metrics

| UI column | Rule |
|---|---|
| קילומטרים | `sum(total_km)` over included rows |
| אירועים | Count of included participations (only those with km entered) |

Idle users (no included participations): `0` / `0`.

## UI

| Element | Hebrew |
|---|---|
| Nav + page title | החזר דלק |
| Helper | סיכום קילומטרים לפי כונן לפי תאריך דיווח האירוע |
| Start date | מתאריך |
| End date | עד תאריך |
| Invalid range | טווח תאריכים לא תקין |
| Load error | לא הצלחנו לטעון את הדוח. |
| No active users | אין משתמשים פעילים. |

**Table columns (logical order):** כונן (שם מלא + אות קריאה) · קילומטרים · אירועים

- Numbers use mono numeric style from רשומה.
- Filters apply when both dates are set and valid (on change).
- No row actions; read-only.
- Non-admin access: same unavailable/redirect pattern as other admin pages.
- Placement: ניהול (desktop sidebar + mobile admin hub), alongside משתמשים / הגדרות.

Visual system: `design-system-design-instructions/` (רשומה). No new tokens; reuse existing list/table/filter patterns.

## Architecture

### New files

- `src/lib/fuelRefundReport.ts` — fetch helpers + pure `buildFuelRefundRows` (unit-tested)
- `src/lib/fuelRefundReport.test.ts` — aggregation edge cases
- `src/pages/FuelRefundPage.tsx` — page UI

### App wiring

- New `AppView` value (e.g. `fuel_refund`)
- Admin-only nav entry under ניהול
- Mobile hub: include next to other admin entries

### Data flow

1. Admin opens page → default date range set.
2. On valid range: parallel fetch active profiles + participations on events with `created_at` in range (fields: `responder_id`, `total_km`, `event_id`).
3. `buildFuelRefundRows(profiles, participations)` → table rows.
4. Render table; loading / error / empty states as above.

### Permissions

- UI gated to `admin` role only.
- No new RLS policies required for v1 (admins already can select the needed rows).

## Testing

- Unit: null km → 0; idle user zeros; multiple events sum and count; local day UTC bounds.
- Manual: admin sees nav + report; shift-lead and responder do not.

## Error handling

- Query failure → error state + retry.
- Invalid date range → inline validation only; no query.

## Open follow-ups (explicitly later)

- CSV export
- Rate × km money column
- Optional inclusion of shift km (would need a product rule for attributing vehicle km to people)
