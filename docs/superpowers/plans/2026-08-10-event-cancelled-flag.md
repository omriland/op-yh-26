# Event cancelled flag (בוטל) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `events.is_cancelled` so events keep their real type while blocking treated vehicles when cancelled.

**Architecture:** Boolean column + pure validation helpers in `eventForm.ts` / `shiftForm.ts`; Event form checkbox with admin-only clear; list/detail בוטל chip; shift rollups keep type counts and add computed `cancelled_count` (not persisted).

**Tech Stack:** Vite + React + TS, Supabase migrations, Vitest.

## Global Constraints

- Hebrew-only UI, full RTL
- Cancelled orthogonal to `event_status`
- No DB trigger in v1
- Copy from `docs/superpowers/specs/2026-08-10-event-cancelled-flag-design.md`

## File map

- Create: `supabase/migrations/20260810210000_events_is_cancelled.sql`
- Create: `src/lib/eventCancelled.test.ts`
- Modify: `src/lib/eventForm.ts` — draft field, validation, save
- Modify: `src/lib/events.ts` — list/detail select `is_cancelled`
- Modify: `src/lib/shiftForm.ts` — `cancelled_count` in suggest/refresh
- Modify: `src/lib/status.ts` — `cancelledStamp()` helper
- Modify: `src/pages/EventFormPage.tsx` — checkbox + treated lock
- Modify: `src/pages/EventsPage.tsx`, `src/components/events/EventsTable.tsx` — chip
- Modify: `src/pages/EventDetailPage.tsx`, `src/pages/ResponderFillPage.tsx` — chip/row
- Modify: `src/pages/ShiftFormPage.tsx`, `src/pages/ShiftDetailPage.tsx` — בוטל × N
- Modify: `.cursor/memory/MEMORY.md`

---

### Task 1: Pure cancelled rules + rollup count (TDD)

**Files:**
- Create: `src/lib/eventCancelled.test.ts`
- Modify: `src/lib/eventForm.ts`
- Modify: `src/lib/shiftForm.ts`
- Test: `src/lib/eventCancelled.test.ts` (+ extend existing shift tests if any; else cover in same file)

**Interfaces:**
- Produces:
  - `CANCELLED_TREATED_BLOCK`, `CANCELLED_CLEAR_ADMIN_ONLY` string constants
  - `totalTreatedQuantity(responders): number`
  - `applyCancelledChange({ next, current, treatedTotal, isAdmin }): { ok: true; is_cancelled } | { ok: false; error }`
  - `validateCancelledSave({ is_cancelled, treatedTotal, isAdmin, previousIsCancelled }): EventFormErrors | null` (sets `form` error)
  - `suggestRollupsFromLinkedEvents` also returns `cancelled_count: number` from `cancelledFlags?: boolean[]`

- [ ] **Step 1: Write failing tests** in `src/lib/eventCancelled.test.ts` covering: treated block, admin-only clear, save validation, rollup cancelled_count while still counting types.

- [ ] **Step 2: Run** `npm test -- src/lib/eventCancelled.test.ts` — expect FAIL.

- [ ] **Step 3: Implement helpers** in `eventForm.ts` / extend `suggestRollupsFromLinkedEvents` + `refreshRollups` (select `is_cancelled`).

- [ ] **Step 4: Run tests** — expect PASS.

- [ ] **Step 5: Commit** only if user asked; otherwise skip.

---

### Task 2: Migration + wire event load/save

**Files:**
- Create: `supabase/migrations/20260810210000_events_is_cancelled.sql`
- Modify: `src/lib/eventForm.ts` (`EventFormDraft.is_cancelled`, empty/load/save payload, force zero treated when cancelled)
- Modify: `src/lib/events.ts` (list + detail select)

```sql
alter table public.events
  add column if not exists is_cancelled boolean not null default false;
```

- [ ] **Step 1: Add migration**
- [ ] **Step 2: Wire draft/load/save** — `saveEventForm` accepts `isAdmin` + uses `previousIsCancelled` from draft load; reject clear if !admin; reject cancelled+treated; when cancelled, sync treated as empty.
- [ ] **Step 3: Apply migration** via `npx supabase db push` or project’s usual path if available; if CLI unavailable, leave migration file for deploy.
- [ ] **Step 4: `npx tsc --noEmit` / `npm run build`** green for touched types.

---

### Task 3: Event form UI

**Files:**
- Modify: `src/pages/EventFormPage.tsx`

- [ ] **Step 1:** Import `Checkbox`, `applyCancelledChange`, constants.
- [ ] **Step 2:** Place **בוטל** checkbox after סוג אירוע; onChange via `applyCancelledChange`; show error hint; disable uncheck when cancelled && !admin; disable treated steppers when `draft.is_cancelled`.
- [ ] **Step 3:** Pass `isAdmin` into `saveEventForm`; keep `previousIsCancelled` from loaded draft.
- [ ] **Step 4:** Show `cancelledStamp` chip next to status when cancelled.

---

### Task 4: List / detail / responder / shifts UI

**Files:**
- Modify: `src/lib/status.ts` — `cancelledStamp(): StampDescriptor` → `{ label: 'בוטל', tone: 'draft' }` (or `partial` if draft reads wrong)
- Modify: Events list table + mobile cards, EventDetailPage, ResponderFillPage context, ShiftForm/Detail rollup display `בוטל × N`

- [ ] **Step 1:** Add stamp helper
- [ ] **Step 2:** Surface chip wherever status stamp already shows for events
- [ ] **Step 3:** Shift rollup UI shows cancelled count when > 0
- [ ] **Step 4:** `npm test` + `npm run build`
- [ ] **Step 5:** Update MEMORY.md

---

## Spec coverage

| Spec item | Task |
|---|---|
| `is_cancelled` column | 2 |
| Orthogonal status | 2–3 (no status enum change) |
| Block check if treated > 0 | 1, 3 |
| Admin-only clear | 1, 3 |
| Zero treated on cancelled save | 2 |
| List/detail chip | 4 |
| Shift type + בוטל count | 1, 4 |
| Manual ביטול type removal | out of scope (operator) |
