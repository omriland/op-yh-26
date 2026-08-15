# Yahpaz — Revert auto odometer end; hide lead km from responder

Slice: on **השלמת הפרטים שלי**, restore editable `מד אוץ התחלה` / `מד אוץ סיום`. Stop deriving end from lead `total_km`. Never show lead kilometers to the responder on fill or on their own event-detail card. Platform km math stays lead-`total_km` only; responder odometers are for logging / future discrepancy checks.

**Supersedes** `2026-08-11-auto-odometer-end-design.md` for the fill form. Restores the editable-end intent of `2026-08-09-yahpaz-responder-fill-design.md` (labels remain `מד אוץ התחלה` / `מד אוץ סיום`).

## Decisions (locked)

| Topic | Choice |
|---|---|
| Approach | UI/validation revert + hide lead km from responder surfaces (no data migration, no RLS strip) |
| Fill odometers | Responder enters **both** start and end (editable) |
| Auto end | **Removed** — no `start + total_km`, no auto-hint copy |
| Lead km visibility (responder) | **Hidden** on fill context ledger and on own event-detail card |
| Lead km visibility (lead/admin) | Unchanged — event form, detail, reports |
| Platform km math | **Only** `event_responders.total_km` (lead-entered) |
| Responder odometers | Logging / future discrepancy only — never used in sums, refunds, or reports |
| Complete gate | Still requires `totalKm != null`; generic error — **does not** reveal the lead’s number |
| Draft | Start/end optional; invalid numbers → field error |
| Historical rows | Leave stored `odometer_end` as-is (may previously have been auto-filled) |
| Discrepancy UI | **Out of scope** this slice |

## Behavior

### Fill form (`ResponderFillPage` + `responderFill.ts` + Edge `responder-fill`)

**Load**

- Fetch assignment as today, including `total_km` for the complete-gate only.
- Paint stored `odometer_start` / `odometer_end` as saved — **do not** recompute end from lead km.
- Context ledger: תאריך · מספר אירוע · סוג אירוע · כביש · מיקום · אחמ״ש — **no** `קילומטרים (אחמ״ש)` row.

**Editing**

- Both odometer fields editable (digits-only, whole km, existing numeric chrome).
- Remove `readOnly` on end, `odometerEndAutoHint`, and any `computeOdometerEnd` / `withDerivedOdometerEnd` on change.
- Live range check unchanged: when both are numbers, end must be strictly greater than start.

**Draft (`שמירת טיוטה`)**

- Do not require lead `totalKm` or either odometer.
- Persist user-entered start/end (`null` if empty); never overwrite end with a derived value.

**Complete (`סיום דיווח`)**

- Required: plate, start, end, route, treatment_detail (end is **user input** again).
- If `totalKm == null` → field/form error (existing copy is fine):  
  `האחמ״ש טרם הזין קילומטרים לאירוע. לא ניתן לסיים את הדיווח.`  
  Do not show the lead’s numeric value anywhere on this screen.
- If end missing/invalid → `יש למלא מד אוץ סיום.`
- If both numbers and `end <= start` → `מד אוץ סיום חייב להיות גדול ממד אוץ התחלה`.
- `totalKm === 0` is allowed for the gate (`!= null`); range is solely from user odometers.

**Read-only (participation/event done)**

- Ledger shows stored start and end only — still no lead km.

### Event detail (responder card)

- Row `קילומטרים` (lead `total_km`) is shown **only** when the viewer is shift-lead or admin.
- Plain responder (including viewing own card): omit that row.
- Odometer start/end rows remain visible (responder-owned logging).

### Unchanged

- Shift-lead enters `total_km` on the event form.
- Fill-ready email still fires when lead `total_km` first becomes non-null.
- Fuel refund, KM exceptions, and any other km reports: lead `total_km` only.
- Shifts form odometer / computed shift km: out of scope.
- No schema migration; no bulk rewrite of historical `odometer_end`.

## Implementation touchpoints

- `src/lib/responderFill.ts` (+ unit tests): drop derive helpers from the live path; validate user-entered end; keep `totalKm` only for complete-gate.
- `src/pages/ResponderFillPage.tsx`: editable end; remove lead-km ledger + auto-hint.
- `supabase/functions/responder-fill/index.ts`: same validate/persist rules (no derived end).
- `src/pages/EventDetailPage.tsx`: gate `קילומטרים` on lead/admin.
- Project memory: update product decisions to match this spec.

## Out of scope

- Discrepancy report / UI (lead `total_km` vs `odometer_end - odometer_start`)
- Clearing or rewriting historical auto-filled ends
- Hiding `total_km` via RLS / API stripping for responders
- Shifts odometer behavior
- Changing how lead enters `total_km`

## Testing

- Unit: complete fails when `totalKm == null` without exposing a number; succeeds with user end when lead km present; draft does not require lead km or end.
- Unit: changing start does **not** change end; no derive helper required on the save path.
- Event detail: lead/admin see `קילומטרים`; plain responder does not.
- Manual smoke: fill both odometers, draft, complete after lead km set; confirm fill UI never shows lead km.
