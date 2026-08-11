# Yahpaz — Auto-calculated odometer end (responder fill)

Slice: on **השלמת הפרטים שלי**, responder enters only `ק"מ התחלה`; `ק"מ סיום` is shown read-only as `start + total_km` (shift-lead kilometers).

Supersedes the editable end field in `2026-08-09-yahpaz-responder-fill-design.md` for the fill form only. Event form / lead editing of `total_km` and odometers elsewhere is unchanged.

## Decisions (locked)

| Topic | Choice |
|---|---|
| Approach | Derive end in the fill form from lead `total_km` (client-side) |
| End control | Keep field visible; **not editable** (`readOnly`) |
| Formula | `odometer_end = odometer_start + total_km` (integers; whole km) |
| Draft save | Allowed with start only; end may be empty if start empty or `total_km` null |
| Complete | Requires start **and** non-null `total_km` with `total_km > 0` so end &gt; start |
| Persistence | Still store both `odometer_start` and computed `odometer_end` on `event_responders` |
| Refunds / reports | Unchanged — only lead `total_km` counts for km math |

## Behavior

### Load

- Fetch the assignment’s `total_km` with the existing responder fill context query.
- Expose `totalKm: number | null` on `ResponderFillContext`.
- If draft already has `odometer_start` and `totalKm != null`, prefer **recomputed** end over a stale saved `odometer_end` when painting the editable form (so changing lead km later is reflected while the fill is still open).

### Editing

- User edits only `ק"מ התחלה` (digits-only, existing numeric chrome).
- On each start change (and when context has `totalKm`):
  - If start parseable and `totalKm != null` → set draft `odometer_end` to `String(start + totalKm)`.
  - Else → clear draft `odometer_end` to `''`.
- End `TextField`: `readOnly`, still labeled `ק"מ סיום`, still marked required for complete UX; hint: `מחושב לפי הקילומטרים שהזין האחמ״ש`.
- Live range check unchanged: when both numbers present, end must be &gt; start (equivalent to `totalKm > 0`).

### Save draft (`שמירת טיוטה`)

- Same as today for non-odometer fields.
- Odometer: allow empty start; if start invalid → field error.
- Do **not** require `totalKm` for draft.
- Persist computed end when available; otherwise `odometer_end: null`.

### Complete (`סיום דיווח`)

- Required: plate, start, route, treatment_detail (unchanged).
- End is required as a **derived** value, not as user input:
  - If `totalKm == null` → form/field error: `האחמ״ש טרם הזין קילומטרים לאירוע. לא ניתן לסיים את הדיווח.`
  - If `totalKm === 0` (or computed end ≤ start) → `ק"מ סיום חייב להיות גדול מק"מ התחלה` (or equivalent clear copy).
- Before validate/save, ensure draft end is recomputed from current start + `totalKm`.

### Read-only (participation/event done)

- Ledger still shows stored start and end (no inputs). No change to post-complete display.

## Out of scope

- Changing how shift-lead enters `total_km` on the event form
- Auto-sync when lead changes `total_km` after participation is already `done`
- Shifts form odometer fields
- Schema migration (columns already exist)

## Testing

- Unit: helper `computeOdometerEnd(start, totalKm)` — null/empty cases, happy path, zero km.
- Unit: `validateResponderFillDraft` complete mode requires `totalKm` (new arg or context); draft mode does not.
- UI smoke (manual or component): end field not editable; typing start updates end when `totalKm` present.
