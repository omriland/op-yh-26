# Event cancelled flag (בוטל)

Date: 2026-08-10  
Status: implemented  
Depends on: `2026-08-09-yahpaz-volunteers-events-design.md`, `2026-08-10-yahpaz-shifts-design.md`

## Goal

Stop using סוג אירוע `ביטול` as a fake event kind. Keep the real `event_type_id` for analytics, and mark cancellation with a per-event flag so treated vehicles cannot be logged on cancelled events.

## Decisions

- Cancelled is **orthogonal** to `events.status` (`draft` → `in_progress` → `partial` → `done` unchanged).
- Schema: `events.is_cancelled boolean not null default false` (no new status enum value).
- Real `event_type_id` stays required; cancelled is not a type.
- Checking **בוטל** is blocked until all treated-vehicle quantities on the event are already **0** (lead clears first; no auto-clear).
- When `is_cancelled`: treated-vehicle UI locked at 0; save must not persist treated rows.
- Who may set `false → true`: shift-lead and admin (same people who edit events).
- Who may set `true → false`: **admin only**.
- Enforcement: client save path + UI (no DB trigger in v1).
- Removing סוג `ביטול` from the closed list is **manual** (operator); no auto-migration of historical rows typed as `ביטול`.
- Approach: boolean + UI/client rules (not a new status; not DB-hard constraints in v1).

## Data model

| Field | Table | Notes |
|---|---|---|
| `is_cancelled` | `events` | `boolean not null default false` |

No change to `event_responders`, `event_treated_vehicles`, or status enums.

## UI

### Event form (create/edit)

- Checkbox **בוטל** with event-level fields (near סוג אירוע / date), not inside responder cards.
- Attempt to check while any treated quantity > 0: keep unchecked; message  
  `לא ניתן לסמן בוטל כל עוד רשומים רכבים שטופלו. נקו תחילה את הכמויות.`
- When checked: treated controls disabled/read-only at 0.
- Uncheck: enabled only for admin; shift-lead sees checked + disabled with hint that only admin can clear.
- סוג אירוע remains required and editable.

### Lists / detail

- Compact **בוטל** stamp/chip next to status (Hebrew, רשומה style).

### Responder fill

- Lead-owned treated vehicles unchanged. If event context is shown, also show **בוטל** when true.

## Permissions & save rules

1. Shift-lead / admin may set cancelled when treated totals are 0.
2. Only admin may clear cancelled; non-admin clear attempt → keep checked; message  
   `רק מנהל יכול לבטל סימון בוטל.`
3. Save with `is_cancelled` and any treated quantity > 0 → reject (same conflict copy).
4. Save with `is_cancelled` → treated sync writes zero rows.
5. Status derivation unchanged.

## Shift rollups

When refreshing/linking events on a shift:

- Event-type counts: **include** cancelled events under their real `event_type_id`.
- Separate **בוטל** count = linked events with `is_cancelled` (show **בוטל × N** when N > 0).
- Treated-vehicle rollup: existing logic (cancelled should contribute 0 if rules held).

## Copy (Hebrew)

| Situation | Copy |
|---|---|
| Checkbox / chip label | `בוטל` |
| Block check while treated > 0 | `לא ניתן לסמן בוטל כל עוד רשומים רכבים שטופלו. נקו תחילה את הכמויות.` |
| Non-admin clear | `רק מנהל יכול לבטל סימון בוטל.` |
| Shift summary | `בוטל × N` |

## Out of scope (v1)

- DB trigger/constraint forbidding treated rows when cancelled
- Dedicated events-list filter for cancelled-only
- Auto-migrate historical `ביטול` type rows
- Changing responder fill fields beyond an optional **בוטל** indicator

## Acceptance

1. Real type + **בוטל** with zero treated → saves; treated UI locked.
2. Treated > 0 → cannot mark **בוטל**.
3. Shift-lead cannot clear **בוטל**; admin can.
4. Event status still moves normally.
5. Linked shift shows type counts including that event **and** **בוטל × N**.
6. List/detail shows cancelled marker.
