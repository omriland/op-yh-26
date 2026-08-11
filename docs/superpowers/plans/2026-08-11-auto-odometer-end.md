# Auto-calculated odometer end — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On responder fill, compute read-only `ק"מ סיום` as `odometer_start + total_km` (lead km); draft OK without lead km; complete requires `total_km > 0`.

**Architecture:** Pure helpers + validation in `src/lib/responderFill.ts`; UI wires `readOnly` end field and recomputes on start change in `ResponderFillPage.tsx`. Fetch `total_km` in fill context.

**Tech Stack:** Vite + React + TS, Vitest, existing `TextField` (`readOnly` via native input props).

## Global Constraints

- Hebrew-only UI copy; no English product strings
- Persist both `odometer_start` and computed `odometer_end` on `event_responders`
- Refunds still use lead `total_km` only (unchanged)
- Spec: `docs/superpowers/specs/2026-08-11-auto-odometer-end-design.md`

---

## File map

| File | Responsibility |
|---|---|
| `src/lib/responderFill.ts` | `computeOdometerEnd`, context `totalKm`, validate with totalKm, recompute before save |
| `src/lib/responderFill.test.ts` | Unit tests for compute + validate |
| `src/pages/ResponderFillPage.tsx` | Read-only end field, recompute on start change, hint |

---

### Task 1: Pure compute + validation (TDD)

**Files:** `src/lib/responderFill.test.ts` (new), `src/lib/responderFill.ts`

- [ ] Write failing tests for `computeOdometerEnd(start, totalKm)`:
  - `('', 12)` / `(null-ish, 12)` / `('100', null)` → `''`
  - `('100', 12)` → `'112'`
  - `('100', 0)` → `'100'`
- [ ] Write failing tests for `validateResponderFillDraft(draft, mode, plates, totalKm)`:
  - draft: no totalKm required
  - complete + `totalKm == null` → error message from spec
  - complete + start + `totalKm: 12` → no odometer_end “empty” error; end derived
  - complete + `totalKm: 0` → range / end≤start error
- [ ] Implement `computeOdometerEnd` and extend validate/save to accept `totalKm`, recompute end before validate
- [ ] Run `npm test -- src/lib/responderFill.test.ts` — pass
- [ ] Commit

### Task 2: Fetch `total_km` + UI wiring

**Files:** `src/lib/responderFill.ts`, `src/pages/ResponderFillPage.tsx`

- [ ] Select `total_km` on assignment; set `totalKm` on context; seed draft end via `computeOdometerEnd` when loading editable form
- [ ] Pass `totalKm` into save/complete helpers
- [ ] `patchOdometer`: only start is editable; recompute end; clear end when start empty or totalKm null
- [ ] End `TextField`: `readOnly`, hint `מחושב לפי הקילומטרים שהזין האחמ״ש`, no `onChange` that writes user input
- [ ] Run tests + `npm run build`
- [ ] Commit

### Task 3: Memory + PR

- [ ] Update `.cursor/memory/MEMORY.md` with the decision
- [ ] Push + update PR body
