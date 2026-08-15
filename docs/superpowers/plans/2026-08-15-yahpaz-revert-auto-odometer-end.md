# Revert Auto Odometer End — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore editable responder odometer start/end on fill; stop deriving end from lead `total_km`; never show lead kilometers to responders on fill or event detail; keep platform km math and complete-gate on lead `total_km` only.

**Architecture:** Remove derive helpers from the live fill path in `responderFill.ts` and Edge `responder-fill`; validate user-entered end; keep `totalKm` in context only for the complete gate. Hide lead-km UI on fill ledger and gate the event-detail `קילומטרים` row to shift-lead/admin.

**Tech Stack:** Vite + React + TS, Vitest, Supabase Edge (Deno), existing `TextField` / `Ledger`.

## Global Constraints

- Hebrew-only UI; no English product strings
- Spec: `docs/superpowers/specs/2026-08-15-yahpaz-revert-auto-odometer-end-design.md`
- Platform km math: **only** lead `event_responders.total_km` (unchanged)
- Never render lead `total_km` / `formatNumber(totalKm)` to the responder on fill
- Complete still requires `totalKm != null` with existing generic error copy
- No schema migration; no rewrite of historical `odometer_end`
- Discrepancy UI out of scope

---

## File map

| File | Responsibility |
|---|---|
| `src/lib/responderFill.ts` | Validate user end; load/save without derive; keep `totalKm` for gate only |
| `src/lib/responderFill.test.ts` | Unit tests for validate + removed derive behavior |
| `src/pages/ResponderFillPage.tsx` | Editable end; no lead-km ledger / hints |
| `supabase/functions/responder-fill/index.ts` | Same validate/persist rules for token fill |
| `src/pages/EventDetailPage.tsx` | Show `קילומטרים` only for lead/admin |
| `.cursor/memory/MEMORY.md` | Product decision update |

---

### Task 1: Validation + load/save without derived end (TDD)

**Files:**
- Modify: `src/lib/responderFill.test.ts`
- Modify: `src/lib/responderFill.ts`
- Test: `src/lib/responderFill.test.ts`

**Interfaces:**
- Consumes: existing `ResponderFillDraft`, `validateResponderFillDraft(draft, mode, allowedPlates, totalKm)`
- Produces: `validateResponderFillDraft` uses **user** `draft.odometer_end` always (no `computeOdometerEnd` in validate/save/load); `totalKm` only gates complete when `null`. Remove or stop exporting live use of `computeOdometerEnd` / `odometerEndAutoHint` / `withDerivedOdometerEnd`.

- [ ] **Step 1: Rewrite failing tests for the new contract**

Replace the `computeOdometerEnd`, `odometerEndAutoHint`, and “derived end” cases in `src/lib/responderFill.test.ts` with:

```ts
import { describe, expect, it } from 'vitest'
import {
  deriveEventStatusAfterParticipation,
  emptyResponderFillDraft,
  validateResponderFillDraft,
  type ResponderFillDraft,
} from './responderFill'

function draft(patch: Partial<ResponderFillDraft> = {}): ResponderFillDraft {
  return { ...emptyResponderFillDraft(), ...patch }
}

describe('deriveEventStatusAfterParticipation', () => {
  it('keeps draft-only progress as in_progress, not partial', () => {
    expect(deriveEventStatusAfterParticipation(['pending', 'in_progress'])).toBe('in_progress')
  })

  it('uses partial only when someone has completed', () => {
    expect(deriveEventStatusAfterParticipation(['done', 'pending'])).toBe('partial')
  })

  it('marks done when every participation is done', () => {
    expect(deriveEventStatusAfterParticipation(['done', 'done'])).toBe('done')
  })
})

describe('validateResponderFillDraft (user-entered odometer end)', () => {
  const plates = ['1234567']

  it('draft mode does not require totalKm or end', () => {
    const errors = validateResponderFillDraft(
      draft({ odometer_start: '100' }),
      'draft',
      plates,
      null,
    )
    expect(errors.odometer_end).toBeUndefined()
  })

  it('complete mode errors when totalKm is missing (generic copy, no number)', () => {
    const errors = validateResponderFillDraft(
      draft({
        vehicle_plate: '1234567',
        odometer_start: '100',
        odometer_end: '112',
        route: 'כביש 1',
        treatment_detail: 'טיפול',
      }),
      'complete',
      plates,
      null,
    )
    expect(errors.odometer_end).toBe(
      'האחמ״ש טרם הזין קילומטרים לאירוע. לא ניתן לסיים את הדיווח.',
    )
    expect(JSON.stringify(errors)).not.toMatch(/\d{2,}/)
  })

  it('complete mode requires user-entered end even when totalKm is set', () => {
    const errors = validateResponderFillDraft(
      draft({
        vehicle_plate: '1234567',
        odometer_start: '100',
        odometer_end: '',
        route: 'כביש 1',
        treatment_detail: 'טיפול',
      }),
      'complete',
      plates,
      12,
    )
    expect(errors.odometer_end).toBe('יש למלא מד אוץ סיום.')
  })

  it('complete mode accepts user end when totalKm is present', () => {
    const errors = validateResponderFillDraft(
      draft({
        vehicle_plate: '1234567',
        odometer_start: '100',
        odometer_end: '115',
        route: 'כביש 1',
        treatment_detail: 'טיפול',
      }),
      'complete',
      plates,
      12,
    )
    expect(errors).toEqual({})
  })

  it('complete mode allows totalKm of 0 when user end > start', () => {
    const errors = validateResponderFillDraft(
      draft({
        vehicle_plate: '1234567',
        odometer_start: '100',
        odometer_end: '110',
        route: 'כביש 1',
        treatment_detail: 'טיפול',
      }),
      'complete',
      plates,
      0,
    )
    expect(errors).toEqual({})
  })

  it('rejects end <= start', () => {
    const errors = validateResponderFillDraft(
      draft({
        vehicle_plate: '1234567',
        odometer_start: '100',
        odometer_end: '100',
        route: 'כביש 1',
        treatment_detail: 'טיפול',
      }),
      'complete',
      plates,
      12,
    )
    expect(errors.odometer_end).toBe('מד אוץ סיום חייב להיות גדול ממד אוץ התחלה')
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npm test -- src/lib/responderFill.test.ts`

Expected: FAIL on cases that still derive end / expect old zero-km behavior (e.g. “requires user-entered end”, “allows totalKm of 0”).

- [ ] **Step 3: Implement minimal library changes**

In `src/lib/responderFill.ts`:

1. Update `ResponderFillContext.totalKm` comment to: lead km for complete-gate only; never shown on fill UI.
2. Delete `computeOdometerEnd`, `odometerEndAutoHint`, and `withDerivedOdometerEnd`.
3. In `validateResponderFillDraft`, parse end from `draft.odometer_end` only:

```ts
  const start = parseOptionalNumber(draft.odometer_start)
  const end = parseOptionalNumber(draft.odometer_end)
```

Keep the complete-gate `if (totalKm == null)` error as today; then require user end; keep range check.

4. In `fetchResponderFillContext`, always seed end from stored value (editable and done):

```ts
  const odometerEnd =
    mine.odometer_end != null ? String(mine.odometer_end) : ''
```

(Remove the `participationDone ? … : computeOdometerEnd(…)` branch.)

5. In `saveResponderFillDraft` / `completeResponderFill`, validate and save `input.draft` directly — no `withDerivedOdometerEnd`.

- [ ] **Step 4: Run tests — expect PASS**

Run: `npm test -- src/lib/responderFill.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/responderFill.ts src/lib/responderFill.test.ts
git commit -m "fix(fill): stop deriving odometer end from lead km"
```

---

### Task 2: Fill page UI — editable end, hide lead km

**Files:**
- Modify: `src/pages/ResponderFillPage.tsx`
- Consumes: Task 1 APIs (`validateResponderFillDraft` / save helpers without derive; no `computeOdometerEnd` / `odometerEndAutoHint` exports)

- [ ] **Step 1: Update imports and odometer handlers**

Remove imports of `computeOdometerEnd` and `odometerEndAutoHint`.

Replace `patchOdometerStart` with independent start/end patches that do not rewrite the other field:

```tsx
  function patchOdometerStart(value: string) {
    if (!draft) return
    patchDraft({ odometer_start: value })
    const rangeError = odometerRangeError(value, draft.odometer_end)
    setErrors((current) => ({
      ...current,
      odometer_start: undefined,
      odometer_end: rangeError,
    }))
  }

  function patchOdometerEnd(value: string) {
    if (!draft) return
    patchDraft({ odometer_end: value })
    const rangeError = odometerRangeError(draft.odometer_start, value)
    setErrors((current) => ({
      ...current,
      odometer_end: rangeError,
    }))
  }
```

- [ ] **Step 2: Remove lead-km ledger row and auto-hint UI**

In the context `Ledger`, delete the `LedgerRow` with label `קילומטרים (אחמ״ש)`.

In read-only mode, delete the `<p className="t-caption text-muted">{odometerEndAutoHint(...)}</p>`.

In edit mode, make end editable:

```tsx
                <TextField
                  label='מד אוץ סיום'
                  required
                  numeric
                  inputMode="numeric"
                  value={draft.odometer_end}
                  error={errors.odometer_end}
                  onChange={(event) =>
                    patchOdometerEnd(digitsOnly(event.target.value))
                  }
                />
```

(Remove `readOnly`, `placeholder="יחושב אוטומטית"`, and `hint={odometerEndAutoHint(...)}`.)

Keep passing `totalKm: ctx.totalKm` into save/complete (gate only) — do not display it.

- [ ] **Step 3: Typecheck / build**

Run: `npm run build`

Expected: SUCCESS (no leftover imports of deleted helpers).

- [ ] **Step 4: Commit**

```bash
git add src/pages/ResponderFillPage.tsx
git commit -m "fix(fill): editable odometer end; hide lead km from fill UI"
```

---

### Task 3: Edge `responder-fill` — match client rules

**Files:**
- Modify: `supabase/functions/responder-fill/index.ts`

**Interfaces:**
- Same validate/persist contract as Task 1: user `odometer_end`; `totalKm` only for complete when null; load context paints stored end.

- [ ] **Step 1: Remove derive from validate + load + save**

1. Delete `computeOdometerEnd`.
2. In `validateDraft`, use `draft.odometer_end` directly (same logic as client `validateResponderFillDraft`).
3. In context load, set:

```ts
  const odometerEnd =
    assignment.odometer_end != null ? String(assignment.odometer_end) : "";
```

4. In save handler, stop overwriting end:

```ts
  const draft = {
    vehicle_plate: trim(body.draft.vehicle_plate),
    odometer_start: trim(body.draft.odometer_start),
    odometer_end: trim(body.draft.odometer_end),
    route: typeof body.draft.route === "string" ? body.draft.route : "",
    treatment_detail:
      typeof body.draft.treatment_detail === "string" ? body.draft.treatment_detail : "",
    treatment_notes:
      typeof body.draft.treatment_notes === "string" ? body.draft.treatment_notes : "",
  };
```

Keep returning `totalKm` on context for the client complete-gate (UI must not render it). Do not add auto-hint strings to any response.

- [ ] **Step 2: Sanity check**

Run: `npm test -- src/lib/responderFill.test.ts && npm run build`

Expected: PASS (Edge is Deno; client tests remain the contract mirror).

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/responder-fill/index.ts
git commit -m "fix(fill-token): persist user odometer end; stop lead-km derive"
```

---

### Task 4: Event detail — hide lead km from plain responders

**Files:**
- Modify: `src/pages/EventDetailPage.tsx`

- [ ] **Step 1: Pass visibility flag into `ResponderCard`**

Near other role flags:

```tsx
  const canSeeLeadKm = roles.includes('admin') || roles.includes('shift_lead')
```

Pass `showLeadKm={canSeeLeadKm}` into each `<ResponderCard … />`.

- [ ] **Step 2: Conditionally render `קילומטרים`**

Add prop `showLeadKm: boolean` to `ResponderCard`. Wrap the lead-km `LedgerRow` so it only renders when `showLeadKm` is true:

```tsx
        {showLeadKm ? (
          <LedgerRow
            label="קילומטרים"
            value={
              responder.total_km != null ? (
                <>
                  <span className="mono">{formatNumber(responder.total_km)}</span> ק״מ
                </>
              ) : undefined
            }
          />
        ) : null}
```

Odometer start/end rows stay as they are.

- [ ] **Step 3: Build**

Run: `npm run build`

Expected: SUCCESS

- [ ] **Step 4: Commit**

```bash
git add src/pages/EventDetailPage.tsx
git commit -m "fix(events): show lead km on detail only to lead/admin"
```

---

### Task 5: Memory + PR

**Files:**
- Modify: `.cursor/memory/MEMORY.md`

- [ ] **Step 1: Update product decisions**

Replace the auto-odometer bullet(s) under Product decisions with:

```md
- **Kilometers for calculations / refunds:** only `event_responders.total_km` (lead-entered). `odometer_start` / `odometer_end` are logging / future discrepancy only — never use them for sums, reports, or refunds.
- **Responder fill odometer:** user enters both `odometer_start` and `odometer_end`. Lead `total_km` is never shown on fill or to plain responders on event detail; complete still requires lead `total_km != null` (generic error). Spec: `2026-08-15-yahpaz-revert-auto-odometer-end-design.md` (supersedes auto-odometer-end).
```

- [ ] **Step 2: Commit + push**

```bash
git add .cursor/memory/MEMORY.md
git commit -m "docs: record revert of auto odometer end and lead-km hide"
git push -u origin HEAD
```

- [ ] **Step 3: Update PR body** to note implementation complete vs design-only.

---

## Spec coverage (self-review)

| Spec requirement | Task |
|---|---|
| Editable start + end | 2 |
| No auto end / hints | 1, 2, 3 |
| Hide lead km on fill | 2 |
| Hide lead km on event detail for plain responder | 4 |
| Complete requires `totalKm != null`, generic error | 1, 3 |
| Draft without lead km / end | 1 |
| Persist user end; no derive on save/load | 1, 3 |
| Platform math unchanged | (no code change; memory Task 5) |
| Historical ends left as-is | (no migration) |
| Discrepancy UI out of scope | — |
