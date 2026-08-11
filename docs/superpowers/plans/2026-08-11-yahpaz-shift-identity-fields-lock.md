# Shift Identity Fields Lock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent regular responders from editing shift identity fields (date, kind, vehicle type, plate); only `admin` / `shift_lead` may change them, enforced in UI, client save, and DB.

**Architecture:** Pure helper builds update payloads with/without identity columns. Form disables identity controls when `!canManageLead`. Postgres `BEFORE UPDATE` trigger rejects identity column changes unless updater has admin or shift_lead.

**Tech Stack:** Vite + React + TS, Vitest, Supabase Postgres RLS/triggers

## Global Constraints

- Hebrew-only UI strings; identity lock error: `אין הרשאה לשנות פרטי משמרת`
- Roles: `admin` | `shift_lead` may edit identity; responder alone may not
- Spec: `docs/superpowers/specs/2026-08-11-yahpaz-shift-identity-fields-lock-design.md`
- Do not commit unless user asks

---

### Task 1: `buildShiftUpdatePayload` helper + unit tests

**Files:**
- Modify: `src/lib/shiftForm.ts`
- Create: `src/lib/shiftForm.test.ts`

**Interfaces:**
- Produces: `buildShiftUpdatePayload(draft: ShiftFormDraft, options: { canEditIdentity: boolean }): Record` — when `canEditIdentity` true includes identity + body fields; when false omits `shift_date`, `shift_kind`, `vehicle_type`, `personal_vehicle_id`. Always includes odometer, total_km, notes, updated_at. Personal plate null when vehicle is not personal (only when identity included).

- [x] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { buildShiftUpdatePayload, type ShiftFormDraft } from './shiftForm'

const baseDraft: ShiftFormDraft = {
  id: 's1',
  shift_date: '2026-08-11',
  shift_kind: 'morning',
  vehicle_type: 'personal',
  personal_vehicle_id: 'v1',
  responder_ids: [],
  event_ids: [],
  odometer_start: 100,
  odometer_end: 150,
  total_km: 50,
  notes: '  hi  ',
  event_type_counts: [],
  treated_vehicle_counts: [],
  cancelled_count: 0,
}

describe('buildShiftUpdatePayload', () => {
  it('includes identity fields when canEditIdentity', () => {
    const payload = buildShiftUpdatePayload(baseDraft, { canEditIdentity: true })
    expect(payload).toMatchObject({
      shift_date: '2026-08-11',
      shift_kind: 'morning',
      vehicle_type: 'personal',
      personal_vehicle_id: 'v1',
      odometer_start: 100,
      odometer_end: 150,
      total_km: 50,
      notes: 'hi',
    })
    expect(payload).toHaveProperty('updated_at')
  })

  it('omits identity fields when !canEditIdentity', () => {
    const payload = buildShiftUpdatePayload(baseDraft, { canEditIdentity: false })
    expect(payload).not.toHaveProperty('shift_date')
    expect(payload).not.toHaveProperty('shift_kind')
    expect(payload).not.toHaveProperty('vehicle_type')
    expect(payload).not.toHaveProperty('personal_vehicle_id')
    expect(payload).toMatchObject({
      odometer_start: 100,
      odometer_end: 150,
      total_km: 50,
      notes: 'hi',
    })
  })

  it('nulls personal_vehicle_id when vehicle is not personal (lead path)', () => {
    const payload = buildShiftUpdatePayload(
      { ...baseDraft, vehicle_type: 'patrol_north', personal_vehicle_id: 'v1' },
      { canEditIdentity: true },
    )
    expect(payload.personal_vehicle_id).toBeNull()
  })
})
```

- [x] **Step 2: Run tests — expect FAIL** (export missing)

Run: `npm test -- src/lib/shiftForm.test.ts`

- [x] **Step 3: Implement helper + wire `saveShiftForm`**

Extract payload building into `buildShiftUpdatePayload`. Extend options:

```ts
options?: { syncResponders?: boolean; canEditIdentity?: boolean }
```

Default `canEditIdentity` to `true`. On update use helper; on insert always use full identity payload (create is lead-only). Map Postgres message containing `אין הרשאה לשנות פרטי משמרת` to that exact error string on update failure.

- [x] **Step 4: Run tests — expect PASS**

Run: `npm test -- src/lib/shiftForm.test.ts`

---

### Task 2: Disable identity fields on form for responders

**Files:**
- Modify: `src/pages/ShiftFormPage.tsx`

**Interfaces:**
- Consumes: `canManageLead` as `canEditIdentity`
- Passes `canEditIdentity: canManageLead` into `saveShiftForm`

- [x] **Step 1: Disable four identity controls when `!canManageLead`**

`disabled={!canManageLead}` on תאריך, שם משמרת, סוג רכב, לוחית.

- [x] **Step 2: Pass `canEditIdentity: canManageLead` to `saveShiftForm`**

```ts
await saveShiftForm(current, user.id, {
  syncResponders: canManageLead,
  canEditIdentity: canManageLead,
})
```

- [x] **Step 3: Smoke via existing page load (no new component test required)**

---

### Task 3: DB trigger migration

**Files:**
- Create: `supabase/migrations/20260811140000_shift_identity_fields_lock.sql`

- [x] **Step 1: Write migration**

```sql
create or replace function public.enforce_shift_identity_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.has_role(auth.uid(), 'admin')
     or public.has_role(auth.uid(), 'shift_lead') then
    return new;
  end if;

  if new.shift_date is distinct from old.shift_date
     or new.shift_kind is distinct from old.shift_kind
     or new.vehicle_type is distinct from old.vehicle_type
     or new.personal_vehicle_id is distinct from old.personal_vehicle_id then
    raise exception 'אין הרשאה לשנות פרטי משמרת';
  end if;

  return new;
end;
$$;

drop trigger if exists shifts_enforce_identity_edit on public.shifts;

create trigger shifts_enforce_identity_edit
before update on public.shifts
for each row
execute function public.enforce_shift_identity_edit();

revoke all on function public.enforce_shift_identity_edit() from public;
```

- [x] **Step 2: Apply migration to remote** (via Supabase MCP `apply_migration` or CLI) when ready

---

### Task 4: Memory + verification

**Files:**
- Modify: `.cursor/memory/MEMORY.md`

- [ ] **Step 1: Note identity lock in Shifts section of MEMORY.md** (blocked by preToolUse hook — retry manually)
- [x] **Step 2: Run `npm test -- src/lib/shiftForm.test.ts` and `npx tsc --noEmit`**

---

## Spec coverage

| Spec requirement | Task |
|---|---|
| UI disable 4 fields | 2 |
| Client omit identity on responder save | 1 |
| DB trigger | 3 |
| Hebrew error | 1 + 3 |
| Combo roles lead/admin | 2 + 3 |
| Out of scope preserved | — |
