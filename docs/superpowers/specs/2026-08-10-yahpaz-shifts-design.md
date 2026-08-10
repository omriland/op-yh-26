# Yahpaz (יחפ״צ) — Shifts (משמרות) — Design

**Date:** 2026-08-10  
**Repo:** `yhpz-2026`  
**Status:** Approved in brainstorming (Approach 1: independent Shift log + optional Event links)  
**Depends on:** `2026-08-09-yahpaz-volunteers-events-design.md` (profiles, vehicles, roles, `event_types`, `vehicle_kinds`, events)

## Problem

The unit runs **shifts** with a duty vehicle (ניידת צפון, ניידת מרכז, or a personal car) and assigned responders. After the shift, the lead needs a structured **post-shift log**: mileage, how many events (by type), how many cars treated (by kind), and general notes. Events already capture the recovery work itself; shifts must not replace them.

## Goals (v1)

- New entity **Shift** (`shifts`) independent of Events
- Vehicle: ניידת צפון | ניידת מרכז | אישי (personal → plate from an assigned responder’s `vehicles`)
- Assign responders to a shift (no open signup / “who registered for which day”)
- Optional link of Events to a Shift for **suggested** rollups (editable before close)
- Manual mileage + general notes
- Role-aware: `admin` / `shift_lead` manage; `responder` read-only on assigned shifts
- Hebrew-only RTL UI in the רשומה design system

## Non-goals (v1)

- Open shift registration / bidding by day
- Payroll, hours totals, fuel reimbursement math
- Live GPS / en-route tracking (stays on Events)
- Forcing every Event to belong to a Shift
- Per-responder debrief fields on the shift
- Auto-calc `total_km` from odometer (manual, same spirit as events)
- Push notifications

## Approach

**Independent Shift log + optional Event links.**  
Events remain first-class. Linking is for rollup helpers only. Stored count snapshots on the shift are the source of truth once closed (not a forever-live join).

## Data model

### `shifts`

| EN column | HE (UI) | Notes |
|---|---|---|
| `id` | | uuid |
| `shift_date` | תאריך | date; default today |
| `shift_lead_id` | אחמ״ש | FK → profiles; creator by default |
| `vehicle_type` | סוג רכב | `patrol_north` \| `patrol_center` \| `personal` |
| `personal_vehicle_id` | לוחית (אישי) | nullable FK → `vehicles`; required when `personal` |
| `status` | סטטוס | `draft` \| `in_progress` \| `closed` |
| `odometer_start` | ק"מ התחלה | nullable until debrief |
| `odometer_end` | ק"מ סיום | nullable until debrief |
| `total_km` | קילומטרים | nullable; lead-entered in v1 |
| `notes` | הערות כלליות | text, optional |
| `created_at` / `updated_at` | | |

**Vehicle type labels**

| Enum | HE |
|---|---|
| `patrol_north` | ניידת צפון |
| `patrol_center` | ניידת מרכז |
| `personal` | אישי |

### `shift_responders`

| Column | Notes |
|---|---|
| `shift_id` | FK → shifts |
| `responder_id` | FK → profiles |
| unique (`shift_id`, `responder_id`) | |

Assignment only — no per-person status in v1.

### `shift_events`

| Column | Notes |
|---|---|
| `shift_id` | FK → shifts |
| `event_id` | FK → events |
| unique (`shift_id`, `event_id`) | |
| v1 rule | An Event links to **at most one** Shift |

### Editable summary snapshots

**`shift_event_type_counts`**

| Column | Notes |
|---|---|
| `shift_id` | |
| `event_type_id` | FK → `event_types` |
| `count` | integer ≥ 0 |
| unique (`shift_id`, `event_type_id`) | |

**`shift_treated_vehicle_counts`**

| Column | Notes |
|---|---|
| `shift_id` | |
| `vehicle_kind_id` | FK → `vehicle_kinds` |
| `count` | integer ≥ 0 |
| unique (`shift_id`, `vehicle_kind_id`) | |

**Rollup suggestion:** From linked Events: count by `event_type_id`; sum `event_treated_vehicles` by `vehicle_kind_id`. Triggered on link/unlink or explicit **רענן מהאירועים**. Lead may edit before close. Closing persists whatever is in the snapshot tables.

## Post-shift fields

| HE | Source |
|---|---|
| ק"מ התחלה | manual |
| ק"מ סיום | manual |
| קילומטרים | manual |
| מספר אירועים לפי סוג | suggested → editable |
| רכבים שטופלו | suggested → editable |
| הערות כלליות | manual |

Create-time (not only post-shift): תאריך, סוג רכב, לוחית אם אישי, אחמ״ש, כוננים, אירועים מקושרים.

### Close validation (v1)

To move to `closed`:

- `vehicle_type` set
- if `personal` → `personal_vehicle_id` set (must belong to an assigned responder’s vehicles)
- ≥ 1 row in `shift_responders`
- `odometer_start` and `odometer_end` set
- count snapshots may be empty or zero if lead confirms (zeros allowed)
- `notes` optional

## Status / lifecycle

```
draft → in_progress → closed
```

| Status | Meaning | UI chip |
|---|---|---|
| `draft` | Being set up | טיוטה |
| `in_progress` | Live / working; links + debrief allowed | במשמרת |
| `closed` | Debrief saved; snapshots frozen | נסגרה |

**Transitions**

1. Create → `draft` (date = today, lead = creator)
2. Set vehicle + responders; save stays `draft`, or **התחל משמרת** → `in_progress`
3. While `in_progress`: link/unlink Events, edit crew/vehicle, fill mileage/notes, refresh/edit counts
4. **סגור משמרת** → validate → `closed`
5. Admin / shift_lead may reopen `closed` → `in_progress` to fix mistakes (no separate archived state in v1)

**Independence from Events:** Linking does not change Event status. An Event may be `done` while the Shift is still `in_progress`, and vice versa.

## Relation to Events

- Events are **not** required to have a Shift
- Shift is **not** a parent container that blocks Event creation
- Optional many Events → one Shift via `shift_events`
- Rollups are helpers; closed Shift stores its own counts

## Roles & RLS (intent)

| Role | Capability |
|---|---|
| `admin` | Full CRUD on shifts and join tables |
| `shift_lead` | Create/edit/close shifts; assign responders; link Events; edit debrief |
| `responder` | Read shifts where they appear in `shift_responders` |

Combo roles follow existing product rules (same user may be lead and responder).

## Screens / UX (רשומה, HE/RTL, mobile-first)

### Flow A — Lead creates and runs a shift

1. Home / nav: **משמרות** list (filter by status chips)
2. **משמרת חדשה** → date, vehicle type, personal plate if needed, assign responders
3. Save as טיוטה or **התחל משמרת**
4. Detail: link Events from a picker (recent / same-day); show suggested counts + **רענן מהאירועים**; edit counts; enter mileage + notes
5. **סגור משמרת**

### Flow B — Responder views

1. **המשמרות שלי** — assigned shifts only
2. Detail read-only (vehicle, crew, status, closed summary if closed)

### List card content (proposal)

Date · vehicle label (+ plate if personal) · status chip · responder count · linked event count

## Errors

- RLS / forbidden → אין הרשאה
- Close validation failures → clear Hebrew field errors
- Personal vehicle not on an assigned responder → block save/close with Hebrew message
- Linking an Event already on another Shift → clear conflict message

## Testing (v1)

- `tsc` + production build pass
- Manual smoke: create shift → assign → link events → refresh counts → edit → close
- Responder sees only assigned shifts
- RLS under admin / shift_lead / responder

## Open decisions (non-blocking)

- Exact Hebrew copy for empty states and validation strings
- Whether list default filter is “today” vs “open shifts”
- Whether Event detail shows a back-link to its Shift (nice-to-have)

## Out of scope reminders

No shift signup board, no payroll, no GPS, no forced Event→Shift parent.
