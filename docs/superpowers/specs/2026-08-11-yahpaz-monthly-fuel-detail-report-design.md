# Yahpaz (יחפ״צ) — Monthly fuel detail report (פירוט דלק) — Design

**Date:** 2026-08-11  
**Repo:** `yhpz-2026`  
**Status:** Approved in brainstorming (Approach B: segment on החזר דלק)  
**Depends on:** `2026-08-10-yahpaz-fuel-refund-report-design.md` (date range, km rule, admin gate)  
**Source request:** Moshe WhatsApp backlog item #5 (דוח דלק חודשי מצטבר — שורה לאירוע)

## Problem

Admins already have **החזר דלק**: one row per active user with summed km for a date range. Moshe needs the **detail grain** — one row per event participation — with callsign+name, date, time, location, event type, total km, and notes, filtered by entry/report date. Without it, monthly fuel review requires opening events one by one.

## Goals (v1)

- Same admin-only **החזר דלק** surface; add segment **סיכום** | **פירוט**
- Shared inclusive date range on event **`created_at`** (local calendar days; תאריך הזנה / when reported) — same helpers and defaults as the summary report
- **פירוט:** one row per `event_responders` participation with lead-entered **`total_km` not null**
- Columns: או״ק + שם · תאריך · שעה · מיקום · סוג אירוע · סה״כ ק״מ · הערות
- Client-side flatten from existing data; no schema changes
- Hebrew-only RTL UI in the רשומה design system

## Non-goals (v1)

- Replacing or removing the summary (**סיכום**) view
- CSV / spreadsheet export
- Odometer columns or odometer-based math
- Shift km
- Money / liters / fuel cards (Moshe item #6 — later)
- New nav item under ניהול (stay on החזר דלק)
- Responder or shift-lead access
- Editing from the report
- Schema migrations, RPCs, Netlify Functions

## Approach

**Segment on existing FuelRefundPage + pure detail builder.**  
Reuse date-range UI and `localDateRangeToUtcBounds` / default range from `fuelRefundReport.ts`. Fetch richer participation+event fields for the detail segment; `buildFuelDetailRows` flattens and sorts in TypeScript. Summary path unchanged.

## Related (not this feature)

| Spec | Relation |
|---|---|
| `2026-08-10-yahpaz-fuel-refund-report-design.md` | Parent surface; **סיכום** stays as shipped |
| Moshe #6 quarterly fuel request | Needs balances/cards; depends on trusting this detail first |

## Product rule (km)

Unchanged: canonical km is **`event_responders.total_km`** (shift-lead). Odometers are logging only — never shown or used here.

## Inclusion rules

| Rule | Detail |
|---|---|
| Row grain | One row per matching `event_responders` |
| Kilometers | `total_km != null` (`0` included) |
| Date filter | Parent `events.created_at` in shared local `from`–`to` range |
| Event / participation status | No filter |
| Cancelled | Included when km is set |
| Inactive profiles | Still show the row if the participation matches (historical); display name/callsign from joined profile |
| Shifts | Excluded |

### Sort

1. Event `created_at` descending  
2. Same instant: `callsign` ascending (Hebrew locale)

### Column mapping

| UI | Source |
|---|---|
| או״ק + שם | Same cell pattern as סיכום כונן: `full_name` primary + `callsign` caption mono |
| תאריך | Local calendar date from `events.created_at` |
| שעה | Local time from `event_responders.started_at`; empty if null |
| מיקום | `events.location` (empty if null) |
| סוג אירוע | `event_types` name via `events.event_type_id` |
| סה״כ ק״מ | `event_responders.total_km` |
| הערות | `events.notes` (empty if null) |

## UI

| Element | Hebrew |
|---|---|
| Page title (unchanged) | החזר דלק |
| Segment | סיכום · פירוט |
| סיכום helper (existing) | סיכום קילומטרים לפי כונן לפי תאריך דיווח האירוע |
| פירוט helper | פירוט אירועים לפי תאריך דיווח — שורה לכל השתתפות עם ק״מ |
| Start / end / invalid / load error | Same copy as summary |
| Empty (פירוט) | אין פירוט דלק בטווח שנבחר. |

**Desktop:** table with the seven columns above.  
**Mobile:** cards — head = או״ק + שם; body lines for date/time, location, type, km, notes.

- Shared date toolbar above the segment (changing dates refreshes the active segment).
- Default segment on open: **סיכום** (no behavior change for existing admins).
- Numbers: mono numeric style from רשומה.
- Read-only rows in v1 (no tap-to-event). Opening event detail from a row is a follow-up.

Visual system: `design-system-design-instructions/` (רשומה). Update `screens/admin.md` fuel section to document the segment.

## Architecture

### New / touched files

| File | Role |
|---|---|
| `src/lib/fuelDetailReport.ts` | Types, `buildFuelDetailRows`, fetch for detail fields |
| `src/lib/fuelDetailReport.test.ts` | Inclusion, sort, date/time formatting edges |
| `src/pages/FuelRefundPage.tsx` | Segment + render סיכום vs פירוט |
| Small segment component (optional) | Chips `סיכום` / `פירוט` (mirror `ExceptionsSegmentBar` / `AdminSegmentBar`) |
| `design-system-design-instructions/screens/admin.md` | Document segment |
| Date helpers | Reuse from `fuelRefundReport.ts` (do not duplicate bounds/default/validation) |

### Data flow (פירוט)

1. Admin opens החזר דלק → default range; segment סיכום.
2. Switch to פירוט (or stay on סיכום): on valid range, fetch participations with nested event + type + profile fields where `events.created_at` in range.
3. Filter `total_km != null` in pure builder (or in query with `.not('total_km', 'is', null)`).
4. `buildFuelDetailRows(...)` → sorted rows → table/cards.
5. Loading / error / empty as above.

### Permissions

- UI remains `admin` only.
- No new RLS for v1.

## Testing

- Unit: null km excluded; `0` included; sort by `created_at` then callsign; empty notes/location/started_at render as empty; cancelled + km still included.
- Manual: segment switches; shared dates apply to both; non-admin cannot open page.

## Error handling

- Query failure → same error + רענון as summary.
- Invalid range → inline only; no fetch.

## Open follow-ups (explicitly later)

- CSV export (likely high value for Moshe once screen ships)
- Tap row → event detail
- Quarterly fuel request report (Moshe #6)
- Filter by volunteer / search
