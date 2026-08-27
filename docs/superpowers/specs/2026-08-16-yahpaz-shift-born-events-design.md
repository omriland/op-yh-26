# Yahpaz — Shift-born events (אירועים ממשמרת)

**Date:** 2026-08-16  
**Repo:** `yhpz-2026`  
**Status:** Approved in brainstorming (Approach 1: shared fill on the event)  
**Depends on:** `2026-08-10-yahpaz-shifts-design.md`, `2026-08-11-yahpaz-shift-identity-fields-lock-design.md`, `2026-08-10-yahpaz-fuel-refund-report-design.md`, `2026-08-09-yahpaz-volunteers-events-design.md`

## Problem

A shift is the real unit of work: a lead assigns a date, a vehicle, and 1–3 responders. After the shift, the crew logs odometer and **how many events of each type** they treated (תקוע × 2, תאונה × 1). Today those type-counts are numbers only. Events are created separately (often by a lead) and carry their own KM, path, road, and location — which is wrong for shift work.

Responders need the system to create those events, attach them to the shift, and let **either** crew member fill treatment + מספר אירוע once, without path/KM, and without silently overwriting each other.

## Goals

- Lead/admin creates a shift (before or after the day) with date, vehicle / רכב פרטי, and 1–3 responders
- Assigned responders see today + history; future shifts are view-only (already true)
- Responder debrief: shift KM + type-counts. **No** “רכבים שטופלו” on the shift
- Saving counts creates/updates **shift-born** `events` attached to the shift
- Shift-born events have **no** KM or path. Responders fill כביש + מיקום on the shared event (optional; not required to save).
- Shared fill once per event (treatment block + מספר אירוע) by any assigned crew member
- Optimistic concurrency: stale save rejected; show who last saved
- Grouped UI: expand a shift on המשמרות שלי; group shift-born events under the shift on האירועים שלי
- Standalone (manual) events are **unchanged**
- החזר דלק: patrol shifts never count; a רכב פרטי shift’s `total_km` counts for the **plate owner** only

## Non-goals

- Changing standalone event create, fill, KM, path, road, or location
- Manual “קישור אירוע” to a shift (picker removed)
- Per-responder treatment copies on shift-born events
- Fill-ready email for shift-born events
- Claim/lock while editing
- Open signup, payroll, GPS, money math
- Splitting shift KM across the crew

## Approach

**Shift-born events with a shared fill on the event.**  
`events.origin = manual | shift`. Counts on the shift stay the source of truth. An RPC creates/deletes matching empty events and assigns the whole crew. Treatment + מספר אירוע live once on the event. Standalone rows and the standalone fill path are not modified.

## Locked decisions

| Topic | Decision |
|---|---|
| Standalone events | Untouched (`origin = manual`) |
| Who fills | Either assigned crew member, once for the shift and once per shift-born event |
| Overwrite | Optimistic save (`updated_at`); second saver sees «מישהו שמר לפניך — רעננו» |
| Count changes | Live sync: increase creates empty events; decrease deletes **empty** only; block if a filled event would be dropped |
| Shift KM / refunds | Patrol: logging only, not in החזר דלק. רכב פרטי: `total_km` added to the plate owner |
| Shift-born fill fields | Current responder treatment block **minus** path and KM: מספר אירוע, כביש, מיקום, פירוט טיפול, רכבים שטופלו, אמצעי חירום, הערות |
| Manual link | Removed. New shift events come only from type-counts |
| Crew size | 1–3 responders |
| Identity fields | Unchanged lock: responders cannot change date / שם משמרת / vehicle / plate |

## Data model

### `events` (additive)

| Column | Type | Notes |
|---|---|---|
| `origin` | `manual` \| `shift` | Default `manual`. Existing rows = `manual` |
| `shift_id` | uuid, nullable FK → `shifts` | Required iff `origin = shift`. An event belongs to at most one shift |
| `treatment_detail` | text, nullable | Shared fill; used when `origin = shift` |
| `emergency_means` | boolean, not null, default false | Shared fill; used when `origin = shift` |
| `treatment_notes` | text, nullable | Shared fill; used when `origin = shift` |
| `last_saved_by` | uuid, nullable FK → `profiles` | Who last saved the shared fill |

`police_event_id` already exists (מספר אירוע).

Check: `(origin = 'manual' AND shift_id IS NULL) OR (origin = 'shift' AND shift_id IS NOT NULL)`.

**Shift-born defaults on create:** `event_date = shifts.shift_date`, `event_type_id` from the count row, `shift_lead_id = shifts.shift_lead_id` (NOT NULL leftover; **not shown or used** as identity — who the אחמ״ש is does not matter), `road_id` / `location` / `district_id` / `location_*` = null, `status = in_progress`. Road and location start empty and are filled on the shared event; they are **not** required to save when `origin = shift`.

**Standalone create/update validation is unchanged** (date, type, road, location when the system district is selected).

### Treated vehicles

Extend `event_treated_vehicles`:

- `event_responder_id` becomes nullable
- add `event_id` nullable FK → `events` ON DELETE CASCADE
- check: exactly one of `event_responder_id`, `event_id` is set
- unique (`event_id`, `vehicle_kind_id`) when `event_id` is set

Standalone writes keep using `event_responder_id` only. Shift-born shared fill writes `event_id` only.

### `shifts`

| Column | Notes |
|---|---|
| `last_saved_by` | uuid, nullable FK → `profiles` — who last saved the debrief |

`updated_at` already exists and is the concurrency token.

### Unchanged / leftover

- `shift_event_type_counts` remains the stepper source of truth
- `shift_treated_vehicle_counts` stays in the DB but is **removed from the UI** and is no longer written
- `shift_events` is **not** written for new shift-born events. Existing historical link rows stay; the new UI ignores them (expand/group uses `events.shift_id` + `origin = shift` only)
- Search RPCs that join `shift_events` must also resolve via `events.shift_id`

### Empty vs filled (live sync)

A shift-born event is **empty** iff all of:

- `police_event_id` is null or blank
- `treatment_detail` is null or blank
- `treatment_notes` is null or blank
- `road_id` is null
- `location` is null or blank
- `emergency_means` is false
- no `event_treated_vehicles` rows with that `event_id`

Anything else is **filled** and must not be auto-deleted.

## Sync RPC

`sync_shift_born_events(p_shift_id uuid)` — `SECURITY DEFINER`, `authenticated`.

**Allowed if** the caller is `admin`, `shift_lead`, or an assigned `shift_responders` row. Assigned responders may call it only when `shift_date <=` Jerusalem today (same rule as `canEditShiftByDate`).

**Behavior:**

1. Read `shift_event_type_counts` for the shift (missing type = 0)
2. For each event type, compare desired count to existing `events` with `origin = shift` AND `shift_id` AND that `event_type_id`
3. Desired > existing → insert the difference as empty events; assign all current `shift_responders` as `event_responders` (no `total_km`, odometer, or `route`)
4. Desired < existing → delete extra **empty** events, newest empty first (keep older stubs). If not enough empty events, `raise exception` with: `לא ניתן להקטין — קיימים אירועים שמולאו`
5. Reconcile participations on **all** remaining shift-born events for this shift: add missing crew, remove responders no longer on the shift (delete their `event_responders` row only — shared fill lives on the event)

Responders must not be able to insert a `manual` event through this RPC.

Call the RPC after a successful shift debrief save that may have changed counts or crew. Lead/admin crew edits also call it so assignments stay aligned.

**Shift delete (admin):** `ON DELETE CASCADE` from `shifts` to shift-born `events` via `shift_id`.

## Fill flow

### Create shift (admin / shift_lead)

Date, שם משמרת, vehicle (רכב פרטי → plate of an assigned responder), **1–3** responders. No event linker. No “רכבים שטופלו”. Save stays a single **שמירה** (no start/close lifecycle).

Hebrew if crew size invalid: `יש לשבץ בין כונן אחד לשלושה`.

### Shift debrief (assigned responder, date ≤ today)

Shared: מד אוץ התחלה / סיום, computed קילומטרים, הערות, type-count steppers. Identity fields stay disabled for non-lead/admin.

Save: optimistic update on `shifts`, then `sync_shift_born_events`. Future shifts: view-only, including expand.

### Shift-born event fill (any assigned crew member)

Fields: מספר אירוע, כביש, מיקום, פירוט טיפול, רכבים שטופלו, אמצעי חירום, הערות. No path or KM. כביש is the closed-list select; מיקום is free text (Places not required — shift-born events have no שלוחה).

- **שמירה** updates the shared event columns + treated-vehicle rows; status stays `in_progress` unless already `done`
- **סיום** marks the event `done` and all its participations `done`
- No lead `total_km` gate (there is none)
- After `done`, responders are read-only (same as standalone fill). Admin / shift_lead may still edit
- Assigned responders may fill only when `shift_date <=` Jerusalem today (same gate as the debrief). Admin / shift_lead may fill earlier
- No fill-ready email (`origin = shift` never sets participation `total_km`; do not add a new notify path)

Standalone `ResponderFillPage` / token fill is unchanged.

### Optimistic concurrency

Used on **shift** debrief and **shift-born** event fill.

1. Load `updated_at` + `last_saved_by`
2. `UPDATE … SET …, last_saved_by = auth.uid(), updated_at = now() WHERE id = $id AND updated_at = $loaded`
3. 0 rows → do not write; show `מישהו שמר לפניך — רעננו` and reload
4. Lists/forms show `נשמר ע״י {full_name}` when `last_saved_by` is set

Opening a half-filled event is allowed — that is how a teammate sees that someone already started.

## Lists and grouping

Fill states on a shift-born event: **ממתין למילוי פרטים** / **טיוטה נשמרה** (not empty, not `done`) / **הושלם** (`status = done`).

**המשמרות שלי** — existing buckets (pending / future / logged). Shift card expands to its shift-born events: type, מספר אירוע or `ללא מספר`, fill state, optional `נשמר ע״י …`. Tap event → shared fill. Tap shift header / `מילוי משמרת` → debrief. Future: expand for view only.

**האירועים שלי** — buckets by logging state. Standalone cards unchanged. Shift-born events sit under a shift subheader (`משמרת` · date · שם משמרת · רכב), collapsed by default; tap to expand. Tap event → shared fill.

**אירועים (unit, lead/admin)** — shift-born rows appear with chip **ממשמרת**. Open → shared fill, not the standalone event form. No “link to shift”.

**משמרות (unit)** — same expand as המשמרות שלי.

## החזר דלק

Standalone rule unchanged: sum `event_responders.total_km` on **manual** events in the existing `events.created_at` range. Shift-born participations have null KM and must not enter that sum.

**Add:** each `shifts` row in range where `vehicle_type = personal` AND `personal_vehicle_id` is set AND `total_km IS NOT NULL` adds `total_km` to the **plate owner** (`vehicles.user_id` of `personal_vehicle_id`). Filter these by `shift_date` in the same inclusive from/to as the report. `0` counts; `null` excluded. Missing plate → skip (cannot attribute). ניידת צפון / ניידת מרכז never add. Other crew members get nothing from that shift.

The report’s **אירועים** column stays a count of **manual** event participations with KM — a private shift does not increment it.

## Roles & RLS (intent)

| Actor | Shift-born |
|---|---|
| `admin` / `shift_lead` | Create/edit shift; run sync; fill or view any shift-born event |
| Assigned responder | Edit debrief on/after `shift_date`; run sync; fill shared event fields on assigned shift-born events |
| Other authenticated | No access beyond existing peer/unit visibility |

Responders still cannot insert `origin = manual` events. Shift-born inserts happen only inside the RPC.

## Errors (Hebrew)

| Case | Copy |
|---|---|
| Stale save | `מישהו שמר לפניך — רעננו` |
| Count decrease would drop a filled event | `לא ניתן להקטין — קיימים אירועים שמולאו` |
| Crew not 1–3 | `יש לשבץ בין כונן אחד לשלושה` |
| Personal plate not on an assigned responder | existing: `הרכב הפרטי חייב להיות של כונן משובץ למשמרת` |
| Forbidden | `אין הרשאה` |
| Identity edit by responder | existing: `אין הרשאה לשנות פרטי משמרת` |

## Testing

- `tsc` + production build
- Live sync: create empties; delete newest empty; block decrease when only filled remain
- Optimistic save: stale `updated_at` rejected on shift and on shift-born event
- Crew 1–3; crew change re-assigns participations without wiping shared fill
- Fuel report: patrol ignored; private plate-owner KM added; standalone sums unchanged; shift-born participations add 0
- RLS/RPC: assigned responder can sync and fill; cannot create a manual event via this path
- Standalone event form and standalone responder fill still require the same fields as today

## Relation to older shift spec

`2026-08-10-yahpaz-shifts-design.md` optional event links + “רכבים שטופלו” on the shift + suggested rollups from linked events are **superseded** for new work. Identity lock and date-gated responder edit remain.

Fuel refund spec non-goal “shift km” is **amended**: private-vehicle shift `total_km` for the plate owner is in scope; patrol shift KM is still out.

## Out of scope reminders

No fill-ready mail for shift-born, no claim lock, no KM split, no manual linker, no standalone form changes.
