# Odometer fields — whole numbers only

Date: 2026-08-10  
Status: approved

## Goal

`ק"מ התחלה` and `ק"מ סיום` accept whole numbers only — digits never share the cell with letters, decimals, or signs.

## Scope

| In | Out |
|---|---|
| Shift form odometer start/end | Computed `קילומטרים` (read-only) |
| Responder fill odometer start/end | Plate / other numeric fields |
| Shared digit-strip helper | DB/schema change (`numeric` columns stay) |

## Behavior

1. Inputs keep design-system `numeric` styling and use `inputMode="numeric"` (integer keypad on mobile).
2. On every change, strip non-digit characters (`/\D/g`) before updating draft state — letters, `.`, `-`, `+`, spaces never appear.
3. Empty value remains valid until existing required / complete validation fires.
4. Existing range rule unchanged: when both are numbers, `odometer_end` must be strictly greater than `odometer_start`.
5. Shared helper (e.g. `digitsOnly`) used by both forms so behavior stays identical.

## Approach

**A — Strip non-digits on change** (chosen). Not native `type="number"` (spinners / RTL / `e` quirks). Not blur-only validation (letters would still show in the cell).

## Success

- Typing `12a3.5` yields `1235` (or progressive digit-only string) in both forms.
- Mobile shows numeric keypad.
- Range and required errors still work as today.
