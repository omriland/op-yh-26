# Yahpaz (יחפ״צ) — KM exceptions report (דוח חריגי קמ) — Design

**Date:** 2026-08-10  
**Repo:** `yhpz-2026`  
**Status:** Approved in brainstorming (Approach 1: client filter + dedicated lead-tools page)  
**Depends on:** `2026-08-09-yahpaz-volunteers-events-design.md` (events, `event_responders`, roles)

## Problem

Shift leads need a quick list of **high-mileage participations** — cases where a responder finished logging with **60 ק״מ or more** — so they can review outliers without scanning every event.

## Goals (v1)

- New nav item under **כלים לאחמ״ש**: **דוח חריגי קמ**
- Visible to `shift_lead` and `admin` (same gate as אירועים / משמרות unit lists)
- One row per exceptional **responder participation** (not one row per event)
- Inclusion: lead-entered `total_km >= 60` (field `event_responders.total_km` only — never odometer)
- Participation status and event status do **not** filter (pending / in_progress / done all count once lead km is set)
- Cancelled events **are included** when a participation matches
- Tap opens existing event detail
- Client-side filter from existing data; no schema change
- Hebrew-only RTL UI in the רשומה design system

## Non-goals (v1)

- Shifts / shift `total_km`
- Configurable threshold (hardcode **60**)
- Date-range filter, search, export/print
- Aggregating kilometers across responders on one event
- New DB views, RPCs, or Netlify Functions
- Responder-only access to the report

## Related (not this feature)

`2026-08-10-yahpaz-fuel-refund-report-design.md` is an **admin** period summary (החזר דלק) with date range and per-user totals. This report is a **lead-tools** exception list of high single-participation km.

## Approach

**Dedicated page + client-side filter.**  
Fetch events with the responder fields needed for the report; flatten to participation rows; keep those with lead-entered `total_km >= 60`; sort and render. Fits the existing RLS-only client model.

## Inclusion rules

| Rule | Detail |
|---|---|
| Row grain | One row per `event_responders` matching the criteria |
| Responder status | Any — not used for inclusion |
| Kilometers | Lead-entered `total_km != null` and `total_km >= 60` (constant `KM_EXCEPTION_THRESHOLD = 60`). Odometer start/end never count. |
| Event status | Any |
| Cancelled | Include when `events.is_cancelled = true` |
| Null / low km | Exclude (`null`, or numeric value &lt; 60) |

### Sort

1. `event_date` descending  
2. Same day: `total_km` descending  

## Data source

Select from `events` with nested `event_responders` (and related lookups/profiles), then filter in TypeScript. Fields needed per matching row:

| Field | Source |
|---|---|
| event id | `events.id` |
| event date | `events.event_date` |
| cancelled | `events.is_cancelled` |
| police event id | `events.police_event_id` |
| location | `events.location` |
| event type | `event_types.name` |
| road | `roads.name` |
| shift lead | `profiles` of `shift_lead_id` (`full_name`, `callsign`) |
| responder | participation profile (`full_name`, `callsign`) |
| kilometers | `event_responders.total_km` |

No new RLS policies for v1 (leads/admins already can read unit events and nested responders).

## UI

| Element | Hebrew |
|---|---|
| Nav + page title | דוח חריגי קמ |
| Empty | אין חריגי ק״מ להצגה |
| Load error | טעינת הדוח נכשלה. בדקו את החיבור ונסו שוב. |
| Retry | רענון |

### Access & shell

- New `AppView` (e.g. `km_exceptions`)
- Nav under **כלים לאחמ״ש**, after אירועים / משמרות
- Theme: **Command** on desktop lead tools (same as unit events/shifts); Field on mobile with bottom/side nav as today
- Row/card click → existing event detail surface for that `event_id` (same pattern as unit אירועים)

### Mobile

- Cards grouped by `event_date` (day headings like events/shifts)
- Card content: ק״מ (mono, emphasized) · כונן (שם · אות קריאה) · סוג אירוע · כביש / מיקום · אחמ״ש · מספר אירוע משטרה when present
- If cancelled: show the cancelled stamp/label used elsewhere on event lists

### Desktop (Command)

Table columns (logical order):

| Column | Content |
|---|---|
| תאריך | `event_date` mono |
| כונן | full name · callsign |
| ק״מ | `total_km` mono |
| סוג אירוע | lookup name |
| כביש / מיקום | road + location |
| אחמ״ש | shift-lead name |
| מספר אירוע | `police_event_id` mono (or `—`) |

Visual system: `design-system-design-instructions/` (רשומה). No new tokens; reuse list/table/empty/skeleton patterns. Numbers use `--type-numeric` / mono.

### States

- **Loading:** list/table skeletons (same family as events)
- **Empty:** empty state with clipboard-style icon + `אין חריגי ק״מ להצגה`
- **Error:** empty-state pattern + secondary `רענון`

No create button. No status filter chips in v1.

## Architecture

### New files

- `src/lib/kmExceptionsReport.ts` — fetch + pure flatten/filter/sort (`KM_EXCEPTION_THRESHOLD`, unit-tested)
- `src/lib/kmExceptionsReport.test.ts`
- `src/pages/KmExceptionsPage.tsx` — page UI
- Small card/table presentational helpers under `src/components/` if needed (prefer reuse)

### App wiring

- Extend `AppView` + `NAV_ICONS` in `AppShell`
- Add nav entry when `manages` (admin or shift_lead)
- Render page in `App.tsx`; opening a row sets the existing event detail surface (reuse unit-events navigation pattern)

### Data flow

1. Lead opens **דוח חריגי קמ**
2. Fetch events + responder fields needed for the report
3. Flatten → filter (lead `total_km >= 60`) → sort
4. Render cards (mobile) or table (desktop)
5. Click → event detail for `event_id`

### Permissions

- UI gated to shift-lead tools (`manages`)
- Responder-only users never see the nav entry

## Testing

- Unit: threshold 59 excluded / 60 included; null km excluded; pending/in_progress with lead km ≥ 60 included; cancelled included; two responders ≥ 60 on one event → two rows; sort by date then km
- Manual: lead/admin see nav; responder-only does not; row opens the correct event

## Error handling

- Query failure → error state + `רענון`
- No partial “soft fail” empty list when the query threw

## Open follow-ups (explicitly later)

- Date-range filter
- Search
- Configurable threshold
- CSV export
- Shift high-km exceptions (needs a separate product rule)
