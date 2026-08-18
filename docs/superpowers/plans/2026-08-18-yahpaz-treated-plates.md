# Treated vehicle plates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Responders log optional treated licence plates on fill (standalone + shift-born), lookup model/color from data.gov.il on commit, and show Israeli plate marks on fill and event detail.

**Architecture:** Pure `treatedPlates` + `plateLookup` helpers (web, iOS `YahpazDomain`, Android `:domain`). New table `event_treated_plates` with owner XOR (participation vs shift-born event). Clients replace the list on save; lookup is client-side and persisted. Lead kind-counts stay untouched.

**Tech Stack:** Vite + React + TS, Vitest, Supabase Postgres/RLS/RPC/Edge, SwiftUI + XCTest, Compose + JUnit. Hebrew RTL. רשומה tokens.

**Spec:** `docs/superpowers/specs/2026-08-18-yahpaz-treated-plates-design.md`

## Global Constraints

- Hebrew-only UI, full RTL (`lang=he`, `dir=rtl`)
- Do not kill/restart the user’s Vite server on `:5173`
- Do not change lead `event_treated_vehicles` kind-counts UI
- Volunteer `לוחית רישוי` select stays as-is
- Lookup: one sequential GET per commit to `https://data.gov.il/api/3/action/datastore_search`, resource `053cea08-09bc-40ec-8f7a-156f0677aff3`
- Copy: `מספרי כלי רכב` · `מספר רישוי` · `הוספה` · `יש להזין 7 או 8 ספרות.` · `מספר זה כבר נוסף.` · `השלימו או מחקו את המספר בתחתית.`
- GitHub user `omriland`. Touch web/DB once; port fill UX to **both** iOS and Android
- Native inbox event detail currently has no treatment fields — plates appear on native **fill** (edit + read-only). Web event detail shows the stack.

## File map

**Create (op-yh-26)**
- `src/lib/treatedPlates.ts` — commit, leftover, caption, replace payload
- `src/lib/treatedPlates.test.ts`
- `src/lib/plateLookup.ts` — URL + parse body + `lookupPlate`
- `src/lib/plateLookup.test.ts`
- `src/components/events/TreatedPlatesField.tsx` — repeating input
- `src/components/events/TreatedPlateStack.tsx` — read-only marks
- `supabase/migrations/20260818110000_event_treated_plates.sql`

**Modify (op-yh-26)**
- `src/lib/responderFill.ts` / `src/lib/responderFill.test.ts` — `treated_plates` + leftover on complete
- `src/pages/ResponderFillPage.tsx`
- `src/lib/shiftBornFill.ts` / `src/lib/shiftBornFill.test.ts`
- `src/pages/ShiftBornFillPage.tsx`
- `src/lib/events.ts` / `src/pages/EventDetailPage.tsx`
- `src/components/ui/LicensePlate.tsx` — comment: fill + detail too
- `src/styles/components.css`
- `design-system-design-instructions/06-components.md`
- `design-system-design-instructions/screens/responder-fill.md`
- `design-system-design-instructions/screens/event-detail.md`
- `supabase/functions/responder-fill/index.ts`

**Create/modify (yahpaz-ios)**
- `Sources/YahpazDomain/TreatedPlates.swift` + `PlateLookup.swift`
- `Tests/YahpazDomainTests/TreatedPlatesTests.swift` + `PlateLookupTests.swift`
- `App/Components/LicensePlateView.swift`
- `App/Screens/FillView.swift`, `App/API/YahpazAPI.swift`, `App/API/Models.swift`
- `Sources/YahpazDomain/FillValidation.swift`

**Create/modify (yahpaz-android)**
- `domain/src/main/kotlin/com/yahpz/domain/TreatedPlates.kt` + `PlateLookup.kt`
- `domain/src/test/kotlin/com/yahpz/domain/TreatedPlatesTest.kt` + `PlateLookupTest.kt`
- `app/.../LicensePlate.kt`, `FillScreen.kt`, `YahpazAPI.kt`, `Models.kt`
- `domain/.../Fill.kt`

---

### Task 1: Web treated-plate domain

**Files:**
- Create: `src/lib/treatedPlates.ts`
- Test: `src/lib/treatedPlates.test.ts`

**Interfaces:**
- Consumes: `formatPlate`, `plateDigits` from `src/lib/format.ts`
- Produces:

```ts
export type TreatedPlate = {
  plate_number: string
  model: string | null
  color: string | null
}

export const TREATED_PLATE_LENGTH_ERROR = 'יש להזין 7 או 8 ספרות.'
export const TREATED_PLATE_DUPLICATE_ERROR = 'מספר זה כבר נוסף.'
export const TREATED_PLATE_LEFTOVER_ERROR = 'השלימו או מחקו את המספר בתחתית.'

export function treatedPlateCaption(model: string | null, color: string | null): string | null
export function commitTreatedPlate(
  pending: string,
  plates: readonly TreatedPlate[],
): { ok: true; plate: TreatedPlate; plates: TreatedPlate[] } | { ok: false; error: string }
export function leftoverTreatedPlateError(
  pending: string,
  mode: 'draft' | 'complete',
): string | undefined
export function removeTreatedPlate(
  plates: readonly TreatedPlate[],
  plateDigitsKey: string,
): TreatedPlate[]
```

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import {
  TREATED_PLATE_DUPLICATE_ERROR,
  TREATED_PLATE_LEFTOVER_ERROR,
  TREATED_PLATE_LENGTH_ERROR,
  commitTreatedPlate,
  leftoverTreatedPlateError,
  removeTreatedPlate,
  treatedPlateCaption,
} from './treatedPlates'

describe('commitTreatedPlate', () => {
  it('formats 7 digits with hyphens and appends', () => {
    const result = commitTreatedPlate('1234567', [])
    expect(result).toEqual({
      ok: true,
      plate: { plate_number: '12-345-67', model: null, color: null },
      plates: [{ plate_number: '12-345-67', model: null, color: null }],
    })
  })

  it('formats 8 digits with hyphens', () => {
    const result = commitTreatedPlate('71386301', [])
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.plate.plate_number).toBe('713-86-301')
  })

  it('rejects 6 digits', () => {
    expect(commitTreatedPlate('123456', [])).toEqual({
      ok: false,
      error: TREATED_PLATE_LENGTH_ERROR,
    })
  })

  it('rejects duplicate by digits', () => {
    const existing = [{ plate_number: '12-345-67', model: null, color: null }]
    expect(commitTreatedPlate('1234567', existing)).toEqual({
      ok: false,
      error: TREATED_PLATE_DUPLICATE_ERROR,
    })
  })
})

describe('leftoverTreatedPlateError', () => {
  it('ignores leftover on draft', () => {
    expect(leftoverTreatedPlateError('123', 'draft')).toBeUndefined()
  })

  it('errors leftover digits on complete', () => {
    expect(leftoverTreatedPlateError('123', 'complete')).toBe(TREATED_PLATE_LEFTOVER_ERROR)
  })

  it('allows empty pending on complete', () => {
    expect(leftoverTreatedPlateError('', 'complete')).toBeUndefined()
  })
})

describe('treatedPlateCaption', () => {
  it('joins model and color', () => {
    expect(treatedPlateCaption('REXTON', 'שחור')).toBe('REXTON · שחור')
  })

  it('shows a single side when the other is missing', () => {
    expect(treatedPlateCaption('REXTON', null)).toBe('REXTON')
    expect(treatedPlateCaption(null, 'שחור')).toBe('שחור')
    expect(treatedPlateCaption(null, null)).toBeNull()
  })
})

describe('removeTreatedPlate', () => {
  it('drops by digit match', () => {
    const plates = [
      { plate_number: '12-345-67', model: null, color: null },
      { plate_number: '713-86-301', model: 'REXTON', color: 'שחור' },
    ]
    expect(removeTreatedPlate(plates, '1234567')).toEqual([plates[1]])
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL** (`treatedPlates` not found)

```bash
npx vitest run src/lib/treatedPlates.test.ts
```

- [ ] **Step 3: Implement `src/lib/treatedPlates.ts`**

```ts
import { formatPlate, plateDigits } from './format'

export type TreatedPlate = {
  plate_number: string
  model: string | null
  color: string | null
}

export const TREATED_PLATE_LENGTH_ERROR = 'יש להזין 7 או 8 ספרות.'
export const TREATED_PLATE_DUPLICATE_ERROR = 'מספר זה כבר נוסף.'
export const TREATED_PLATE_LEFTOVER_ERROR = 'השלימו או מחקו את המספר בתחתית.'

export function treatedPlateCaption(
  model: string | null,
  color: string | null,
): string | null {
  const nextModel = model?.trim() ?? ''
  const nextColor = color?.trim() ?? ''
  if (nextModel && nextColor) return `${nextModel} · ${nextColor}`
  if (nextModel) return nextModel
  if (nextColor) return nextColor
  return null
}

export function commitTreatedPlate(
  pending: string,
  plates: readonly TreatedPlate[],
): { ok: true; plate: TreatedPlate; plates: TreatedPlate[] } | { ok: false; error: string } {
  const digits = plateDigits(pending)
  if (digits.length !== 7 && digits.length !== 8) {
    return { ok: false, error: TREATED_PLATE_LENGTH_ERROR }
  }
  if (plates.some((row) => plateDigits(row.plate_number) === digits)) {
    return { ok: false, error: TREATED_PLATE_DUPLICATE_ERROR }
  }
  const plate: TreatedPlate = {
    plate_number: formatPlate(digits),
    model: null,
    color: null,
  }
  return { ok: true, plate, plates: [...plates, plate] }
}

export function leftoverTreatedPlateError(
  pending: string,
  mode: 'draft' | 'complete',
): string | undefined {
  if (mode !== 'complete') return undefined
  if (!plateDigits(pending)) return undefined
  return TREATED_PLATE_LEFTOVER_ERROR
}

export function removeTreatedPlate(
  plates: readonly TreatedPlate[],
  plateDigitsKey: string,
): TreatedPlate[] {
  const key = plateDigits(plateDigitsKey)
  return plates.filter((row) => plateDigits(row.plate_number) !== key)
}
```

- [ ] **Step 4: Re-run tests — expect PASS**

```bash
npx vitest run src/lib/treatedPlates.test.ts
```

- [ ] **Step 5: Commit** in `op-yh-26`

```bash
git add src/lib/treatedPlates.ts src/lib/treatedPlates.test.ts
git commit -m "Add treated-plate commit and leftover validation."
```

---

### Task 2: Web plate lookup parser

**Files:**
- Create: `src/lib/plateLookup.ts`, `src/lib/plateLookup.test.ts`

**Interfaces:**
- Produces:

```ts
export const PLATE_LOOKUP_RESOURCE_ID = '053cea08-09bc-40ec-8f7a-156f0677aff3'
export function plateLookupMispar(plate: string): number
export function plateLookupUrl(plate: string): string
export function parsePlateLookupBody(body: string): { model: string | null; color: string | null } | null
export async function lookupPlate(plate: string): Promise<{ model: string | null; color: string | null } | null>
```

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { parsePlateLookupBody, plateLookupMispar, plateLookupUrl } from './plateLookup'

describe('plateLookupMispar', () => {
  it('strips dashes and leading zeros via Number', () => {
    expect(plateLookupMispar('713-86-301')).toBe(71386301)
    expect(plateLookupMispar('01234567')).toBe(1234567)
  })
})

describe('parsePlateLookupBody', () => {
  it('reads model and color from a hit', () => {
    expect(
      parsePlateLookupBody(
        JSON.stringify({
          success: true,
          result: {
            records: [{ tzeva_rechev: 'שחור', kinuy_mishari: 'REXTON' }],
          },
        }),
      ),
    ).toEqual({ model: 'REXTON', color: 'שחור' })
  })

  it('returns null on empty records', () => {
    expect(
      parsePlateLookupBody(JSON.stringify({ success: true, result: { records: [] } })),
    ).toBeNull()
  })

  it('returns null on WAF HTML', () => {
    expect(parsePlateLookupBody('<html>blocked</html>')).toBeNull()
  })
})

describe('plateLookupUrl', () => {
  it('encodes the resource and numeric filter', () => {
    const url = plateLookupUrl('713-86-301')
    expect(url).toContain('resource_id=053cea08-09bc-40ec-8f7a-156f0677aff3')
    expect(url).toContain(encodeURIComponent('{"mispar_rechev":71386301}'))
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run src/lib/plateLookup.test.ts
```

- [ ] **Step 3: Implement**

```ts
export const PLATE_LOOKUP_RESOURCE_ID = '053cea08-09bc-40ec-8f7a-156f0677aff3'

export function plateLookupMispar(plate: string): number {
  return Number(String(plate).replace(/\D/g, ''))
}

export function plateLookupUrl(plate: string): string {
  const params = new URLSearchParams({
    resource_id: PLATE_LOOKUP_RESOURCE_ID,
    filters: JSON.stringify({ mispar_rechev: plateLookupMispar(plate) }),
    fields: 'tzeva_rechev,kinuy_mishari',
    limit: '1',
  })
  return `https://data.gov.il/api/3/action/datastore_search?${params.toString()}`
}

export function parsePlateLookupBody(
  body: string,
): { model: string | null; color: string | null } | null {
  if (!body.trimStart().startsWith('{')) return null
  try {
    const parsed = JSON.parse(body) as {
      result?: { records?: Array<{ tzeva_rechev?: unknown; kinuy_mishari?: unknown }> }
    }
    const row = parsed.result?.records?.[0]
    if (!row) return null
    const model = typeof row.kinuy_mishari === 'string' ? row.kinuy_mishari.trim() : ''
    const color = typeof row.tzeva_rechev === 'string' ? row.tzeva_rechev.trim() : ''
    return { model: model || null, color: color || null }
  } catch {
    return null
  }
}

export async function lookupPlate(
  plate: string,
): Promise<{ model: string | null; color: string | null } | null> {
  try {
    const res = await fetch(plateLookupUrl(plate))
    const body = await res.text()
    return parsePlateLookupBody(body)
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Tests PASS**

```bash
npx vitest run src/lib/plateLookup.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/plateLookup.ts src/lib/plateLookup.test.ts
git commit -m "Parse data.gov.il plate color and model without a live fetch."
```

---

### Task 3: Wire leftover into fill validation

**Files:**
- Modify: `src/lib/responderFill.ts` (`ResponderFillDraft`, `ResponderFillErrors`, `emptyResponderFillDraft`, `validateResponderFillDraft`)
- Modify: `src/lib/responderFill.test.ts`

**Interfaces:**
- Consumes: `TreatedPlate`, `leftoverTreatedPlateError` from Task 1
- `ResponderFillDraft.treated_plates: TreatedPlate[]`
- `ResponderFillDraft.treated_plate_pending: string`
- `ResponderFillErrors` adds `'treated_plates'`
- Complete mode: leftover pending → `errors.treated_plates = TREATED_PLATE_LEFTOVER_ERROR`
- Draft mode: leftover ignored; `treated_plates` never required

- [ ] **Step 1: Failing tests** in `responderFill.test.ts`

Add `treated_plates: []` and `treated_plate_pending: ''` to `emptyResponderFillDraft` usage via the real empty helper (the existing `draft()` helper spreads empty). Then:

```ts
it('complete mode errors when the open plate field has leftover digits', () => {
  const errors = validateResponderFillDraft(
    draft({
      vehicle_plate: '1234567',
      odometer_start: '100',
      odometer_end: '112',
      route: 'כביש 1',
      treatment_detail: 'טיפול',
      treated_plate_pending: '12',
    }),
    'complete',
    plates,
    12,
  )
  expect(errors.treated_plates).toBe('השלימו או מחקו את המספר בתחתית.')
})

it('complete mode allows zero treated plates', () => {
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
    12,
  )
  expect(errors.treated_plates).toBeUndefined()
})
```

- [ ] **Step 2: Run `npx vitest run src/lib/responderFill.test.ts` — leftover test FAIL**
- [ ] **Step 3: Add fields to draft/errors/empty; in `validateResponderFillDraft` after treatment_detail checks:**

```ts
const leftover = leftoverTreatedPlateError(draft.treated_plate_pending, mode)
if (leftover) errors.treated_plates = leftover
```

Existing complete tests must keep passing (empty helper now includes the new keys).

- [ ] **Step 4: Tests PASS**
- [ ] **Step 5: Commit** `Add leftover treated-plate check to fill complete validation.`

---

### Task 4: Migration, RLS, shift-born RPC

**Files:**
- Create: `supabase/migrations/20260818110000_event_treated_plates.sql`

**Interfaces:**
- Table `event_treated_plates` as in the spec (including generated `plate_digits`)
- Unique indexes:
  - `event_treated_plates_responder_digits_uidx` on `(event_responder_id, plate_digits) WHERE event_responder_id IS NOT NULL`
  - `event_treated_plates_event_digits_uidx` on `(event_id, plate_digits) WHERE event_id IS NOT NULL`
- Trigger `event_treated_plates_normalize_plate` → `normalize_plate_number(plate_number)`
- RLS SELECT: same visibility as treated vehicles (admin, shift_lead, assigned, peer via `is_assigned_to_event`) for both XOR legs
- RLS write (INSERT/UPDATE/DELETE), responder-keyed: `event_responders.responder_id = auth.uid()` AND participation `status <> 'done'` AND event `status <> 'done'`
- RLS write, event-keyed: `events.origin = 'shift'` AND assigned to event AND event `status <> 'done'`
- Recreate `save_shift_born_event_fill` with extra arg `p_plates jsonb default '[]'::jsonb` **after** existing params (keep `p_road_id` / `p_location` defaults working). After treated-kind replace: `DELETE FROM event_treated_plates WHERE event_id = p_event_id` then insert each `{plate_number, model, color}` with `sort_order`
- `shift_born_event_is_empty`: also true-filled when any `event_treated_plates` row exists for that `event_id`

Must `DROP FUNCTION` the current signature first (see `20260816190000_shift_born_event_location.sql`):

```sql
drop function if exists public.save_shift_born_event_fill(
  uuid, timestamptz, text, text, boolean, text, jsonb, boolean, uuid, text
);
```

New signature adds `p_plates jsonb default '[]'::jsonb` as the last argument so existing clients that omit it still compile until Task 5.

- [ ] **Step 1: Write the migration file** (no TDD for SQL). Include grants: `grant execute` of the new RPC to `authenticated`.
- [ ] **Step 2: Apply to project `yahpaz-2026` / `rtvizpsfvtjowbimugns`** via Supabase MCP `apply_migration` (name `event_treated_plates`) **or** `npx supabase db push` if the CLI is already linked. Do not invent a dashboard workaround if apply fails — stop and report.
- [ ] **Step 3: Commit** `Add event_treated_plates and save them on shift-born fill.`

---

### Task 5: Web load/save plates

**Files:**
- Modify: `src/lib/responderFill.ts` — `fetchResponderFillContext` nested select `treated_plates:event_treated_plates(plate_number, model, color, sort_order)`; map ordered into `draft.treated_plates`; `treated_plate_pending: ''`. After successful `event_responders` update in `saveParticipation`, `delete` + `insert` rows for `event_responder_id = assignmentId` with `sort_order` 0..n-1. Skip insert when the list is empty.
- Modify: `src/lib/shiftBornFill.ts` — `ShiftBornFillDraft.treated_plates`; load event-keyed rows (`eq('event_id', eventId)`); `save_shift_born_event_fill` pass `p_plates`; `shiftBornEventFillRowsFrom` map plates
- Modify: `src/lib/shiftBornFill.test.ts` — expect `treated_plates` on the mapped draft
- Modify: `src/lib/events.ts` — `EventResponderDetail.treated_plates`; `EventDetail.treated_plates` for event-keyed (shift-born). Nested:

```
treated_plates:event_treated_plates!event_treated_plates_event_responder_id_fkey(plate_number, model, color, sort_order)
```

and event-level:

```
shared_plates:event_treated_plates!event_treated_plates_event_id_fkey(plate_number, model, color, sort_order)
```

Use the actual FK names Postgres creates (`event_treated_plates_event_responder_id_fkey` / `event_treated_plates_event_id_fkey`). If PostgREST hint fails, split into a second query in `fetchEventDetail` / `fetchResponderFillContext` — do not guess embed names past one retry.

**Interfaces:**
- Save payload row: `{ event_responder_id, plate_number, model, color, sort_order }` XOR `{ event_id, ... }`
- `saveShiftBornEventFill` adds `p_plates: input.draft.treated_plates`

- [ ] **Step 1: Extend `shiftBornEventFillRowsFrom` test** to include `treated_plates: [{ plate_number: '12-345-67', model: 'REXTON', color: 'שחור' }]` on the source event and expect it on the draft. Run — FAIL.
- [ ] **Step 2: Implement mapper + load/save.** For `saveParticipation`, after the assignment update succeeds:

```ts
await supabase.from('event_treated_plates').delete().eq('event_responder_id', input.assignmentId)
if (input.draft.treated_plates.length > 0) {
  const { error: plateError } = await supabase.from('event_treated_plates').insert(
    input.draft.treated_plates.map((row, index) => ({
      event_responder_id: input.assignmentId,
      plate_number: row.plate_number,
      model: row.model,
      color: row.color,
      sort_order: index,
    })),
  )
  if (plateError) return { ok: false, error: 'שמירת הדיווח נכשלה. בדקו את החיבור ונסו שוב.' }
}
```

Sort loaded rows by `sort_order`.

- [ ] **Step 3: `npx vitest run src/lib/shiftBornFill.test.ts src/lib/responderFill.test.ts` PASS**
- [ ] **Step 4: Commit** `Save treated plates with responder and shift-born fill.`

---

### Task 6: Web fill UI

**Files:**
- Create: `src/components/events/TreatedPlatesField.tsx`, `src/components/events/TreatedPlateStack.tsx`
- Modify: `src/pages/ResponderFillPage.tsx`, `src/pages/ShiftBornFillPage.tsx`
- Modify: `src/styles/components.css`
- Modify: `src/components/ui/LicensePlate.tsx` comment (no longer profile-only)

**Interfaces:**
- `TreatedPlatesField` props: `{ plates, pending, error, disabled, onPendingChange, onCommit, onRemove }`
- On Enter (`event.key === 'Enter'` && !`metaKey` && !`ctrlKey`): `preventDefault` + `onCommit()`. Also button `הוספה`.
- After commit: call `lookupPlate(plate.plate_number)` then patch that row’s model/color (do not await before opening the next field). Never fire two lookups at once (queue or ignore until the in-flight one settles — simplest: await lookup for that row only; user can still type in the empty field because caption update is state).
- Read-only fill: `<TreatedPlateStack plates={draft.treated_plates} />` as the ledger value.

`TreatedPlateStack`:

```tsx
export function TreatedPlateStack({ plates }: { plates: TreatedPlate[] }) {
  if (plates.length === 0) return null
  return (
    <ul className="treated-plates">
      {plates.map((row) => (
        <li key={plateDigits(row.plate_number)} className="treated-plates__item">
          <LicensePlate plate={row.plate_number} />
          {treatedPlateCaption(row.model, row.color) ? (
            <span className="treated-plates__caption t-caption text-secondary">
              {treatedPlateCaption(row.model, row.color)}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  )
}
```

Place the field after פירוט הטיפול / before הערות (shift-born: after פירוט, before kind-count `רכבים שטופלו`? Spec: after פירוט הטיפול, before הערות). On shift-born, kind-counts stay; insert `מספרי כלי רכב` **after פירוט הטיפול and before the kind steppers**, then הערות — so both treated UIs are adjacent. Wait: spec says after פירוט before הערות. Kind steppers are currently between them. Keep kind steppers where they are; put plates **immediately after פירוט הטיפול**, then existing kind steppers, then הערות.

CSS (tokens only): `.treated-plates` column, gap `--space-2`; `.treated-plates__item` row, `align-items: center`, gap `--space-2`; remove button 44×44. `.ledger__value:has(.treated-plates)` allow wrap / stretch like profile plate rows.

- [ ] **Step 1: Implement components + wire both fill pages** (no component test harness — domain already tested). `digitsOnly` on the pending field. `inputMode="numeric"` `numeric` TextField.
- [ ] **Step 2: Manual HMR check is enough this task; `npx tsc --noEmit` must pass**
- [ ] **Step 3: Commit** `Add the treated-plates repeating field on both fill forms.`

---

### Task 7: Event detail + design system

**Files:**
- Modify: `src/pages/EventDetailPage.tsx` — standalone: after `רכבים שטופלו`, ledger `מספרי כלי רכב` with `<TreatedPlateStack plates={responder.treated_plates} />` (empty → undefined so ledger shows `—`). Shift-born: on the **event block** ledger, same row from `event.shared_plates` / `event.treated_plates`.
- Modify: `design-system-design-instructions/06-components.md` — plate mark allowed on profile **and** treated-plate lists
- Modify: `design-system-design-instructions/screens/responder-fill.md` — add the field row
- Modify: `design-system-design-instructions/screens/event-detail.md` — stack after `רכבים שטופלו`; shift-born on event block

- [ ] **Step 1: Wire detail + docs**
- [ ] **Step 2: `npx tsc --noEmit`**
- [ ] **Step 3: Commit** `Show treated plates as Israeli marks on event detail.`

---

### Task 8: Fill-token Edge

**Files:**
- Modify: `supabase/functions/responder-fill/index.ts`

**Interfaces:**
- `SaveBody.draft.treated_plates?: { plate_number: string; model: string | null; color: string | null }[]`
- `SaveBody.draft.treated_plate_pending?: string`
- Duplicate `leftoverTreatedPlateError` inline (Edge cannot import from `src/lib`) **or** copy the three error constants + digit leftover check into `validateDraft`
- Load context `draft.treated_plates` from `event_treated_plates` where `event_responder_id = assignment.id` order `sort_order`
- After assignment update: delete + insert plates (service role)

Keep token validation: leftover pending on complete → 400 `fieldErrors.treated_plates`.

- [ ] **Step 1: Implement load + save plates + leftover in `validateDraft`**
- [ ] **Step 2: Deploy Edge `responder-fill`** with the existing GitHub workflow / `supabase functions deploy responder-fill` if `SUPABASE_ACCESS_TOKEN` is available. If the secret is missing, commit the code and report that Edge is not live yet (same pattern as CORS).
- [ ] **Step 3: Commit** `Persist treated plates on the fill-token Edge path.`

---

### Task 9: iOS domain + fill

**Repo:** `/Users/omrilandman/CursorProjects/today-i/yahpaz-ios`

**Files:**
- Create: `Sources/YahpazDomain/TreatedPlates.swift`, `Sources/YahpazDomain/PlateLookup.swift`
- Create: `Tests/YahpazDomainTests/TreatedPlatesTests.swift`, `Tests/YahpazDomainTests/PlateLookupTests.swift`
- Create: `App/Components/LicensePlateView.swift` — port web mark (IL band + serial, 36pt height, Field plate colors)
- Modify: `Sources/YahpazDomain/FillValidation.swift` — `treatedPlates`, `treatedPlatePending`, `treatedPlates` error; leftover on `.complete`
- Modify: `App/API/Models.swift`, `App/API/YahpazAPI.swift` — load nested plates; after fill update, delete/insert `event_treated_plates`
- Modify: `App/Screens/FillView.swift` — repeating field after פירוט הטיפול; `הוספה`; Enter via `onSubmit`; lookup then patch caption

Port the **same tests** as Tasks 1–3 (Hebrew copy identical). `plateLookupMispar` uses `Int(digits)` after stripping non-digits.

Fill save: `validateResponderFillDraft` already includes leftover once FillValidation is updated. Then:

```swift
try await client.from("event_treated_plates")
    .delete()
    .eq("event_responder_id", value: context.assignmentId)
    .execute()
if !draft.treatedPlates.isEmpty {
    try await client.from("event_treated_plates")
        .insert(draft.treatedPlates.enumerated().map { index, row in
            TreatedPlateWrite(
                eventResponderId: context.assignmentId,
                plateNumber: row.plateNumber,
                model: row.model,
                color: row.color,
                sortOrder: index
            )
        })
        .execute()
}
```

Select on load: `treated_plates:event_treated_plates(plate_number, model, color, sort_order)` on the assignment row, or a second query `.from("event_treated_plates").eq("event_responder_id", mine.id).order("sort_order")`.

- [ ] **Step 1: Failing XCTest** `swift test --filter TreatedPlatesTests` from repo root (or Xcode scheme `YahpazDomain`)
- [ ] **Step 2: Implement domain until PASS**
- [ ] **Step 3: Failing PlateLookupTests → implement parser until PASS** (`swift test --filter PlateLookupTests`)
- [ ] **Step 4: FillValidation leftover test → implement**
- [ ] **Step 5: UI + API**
- [ ] **Step 6: `swift test` PASS**
- [ ] **Step 7: Commit in yahpaz-ios** `Log treated plates on responder fill.`

---

### Task 10: Android domain + fill

**Repo:** `/Users/omrilandman/CursorProjects/today-i/yahpaz-android`

Same behavior as Task 9. Files listed in the file map. Tests in `:domain` with identical Hebrew strings.

```bash
./gradlew :domain:test
./gradlew :app:assembleDebug
```

IME: number pad + `הוספה` button (no hardware Enter). `KeyboardType.Number` + `ImeAction.Done` can also call commit.

- [ ] **Step 1–7:** TDD domain (TreatedPlates, PlateLookup, leftover in `Fill.kt`) then API + `FillScreen` + `LicensePlate` composable
- [ ] **Commit in yahpaz-android** `Log treated plates on responder fill.`

---

### Task 11: Verify

- [ ] `cd /Users/omrilandman/CursorProjects/today-i/op-yh-26 && npx vitest run src/lib/treatedPlates.test.ts src/lib/plateLookup.test.ts src/lib/responderFill.test.ts src/lib/shiftBornFill.test.ts && npx tsc --noEmit`
- [ ] iOS: `swift test` (domain)
- [ ] Android: `./gradlew :domain:test`
- [ ] Smoke (web localhost already running): add two plates, leftover complete error, known plate `71386301` → `REXTON · שחור`, event detail marks, kind-counts unchanged
- [ ] Do not claim done if Edge deploy was skipped — say so

---

## Spec coverage (self-review)

| Spec item | Task |
|---|---|
| Optional 7/8 digit commit + duplicate | 1, 3, 9, 10 |
| Leftover on complete / ignore draft | 1, 3, 8, 9, 10 |
| data.gov.il lookup on commit, persist, miss keeps plate | 2, 6, 9, 10 |
| `event_treated_plates` XOR + RLS | 4 |
| Standalone save replace list | 5, 8, 9, 10 |
| Shift-born shared list + RPC | 4, 5, 6 |
| Fill UI Enter + הוספה + plate mark | 6, 9, 10 |
| Event detail stack (web) | 7 |
| Design-system plate-mark exception | 7 |
| Fill-token Edge | 8 |
| iOS + Android parity | 9, 10 |
| Lead kind-counts unchanged | 6 (no EventForm edits) |
