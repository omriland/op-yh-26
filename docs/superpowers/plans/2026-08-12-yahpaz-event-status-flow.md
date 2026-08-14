# Event Status Flow Trail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename event status labels app-wide, widen desktop unit Events by 20%, and show a full status trail in the Events table.

**Architecture:** Centralize Hebrew labels + trail step model in `src/lib/status.ts`. Render `EventStatusTrail` only in `EventsTable`. Apply existing `page--wide` when Command shows unit Events.

**Tech Stack:** React + TypeScript, Vitest, existing StampChip CSS tones, רשומה design tokens.

## Global Constraints

- Hebrew UI only; event enum values unchanged: `draft` | `in_progress` | `partial` | `done`
- Labels: `אירוע בהזנה` / `ממתין לתיעוד` / `תועד חלקית` / `הושלם`
- Table trail uses event status only (no participation override)
- Cancelled = separate בוטל stamp, not a 5th step
- Width: `page--wide` → `calc(var(--content-max) * 1.2)`
- Do not commit unless user asks

---

### Task 1: Status vocabulary + trail model

**Files:**
- Modify: `src/lib/status.ts`
- Create: `src/lib/status.test.ts`
- Modify: `design-system-design-instructions/05-rtl-language.md` (event rows only)
- Modify: `design-system-design-instructions/screens/event-list.md` (filter + status copy)
- Modify: `design-system-design-instructions/06-components.md` (stamp label table for events)

**Interfaces:**
- Produces: `EVENT_STATUS_ORDER: EventStatus[]`
- Produces: `eventStatusTrailSteps(status: EventStatus): Array<{ status: EventStatus; label: string; tone: StampTone; phase: 'past' | 'current' | 'future' }>`
- Produces: updated `EVENT_STAMPS` / `EVENT_FILTERS` labels

- [x] **Step 1: Write failing tests** for new labels + trail phases
- [x] **Step 2: Run tests — expect FAIL**
- [x] **Step 3: Update `status.ts` + design-system event vocabulary docs**
- [x] **Step 4: Run tests — expect PASS**

---

### Task 2: EventStatusTrail + EventsTable + CSS

**Files:**
- Create: `src/components/events/EventStatusTrail.tsx`
- Modify: `src/components/events/EventsTable.tsx`
- Modify: `src/styles/components.css` (trail styles; table cell height for status)

**Interfaces:**
- Consumes: `eventStatusTrailSteps`, `eventStamp`, `cancelledStamp`
- Produces: `<EventStatusTrail status={EventStatus} cancelled?: boolean />`

- [x] **Step 1: Implement trail component + CSS**
- [x] **Step 2: Wire EventsTable** — trail instead of StampChip; pass `event.status` + `is_cancelled`
- [x] **Step 3: Drop `stampFor` from table path (or keep unused only for cards)**

---

### Task 3: page--wide for unit Events

**Files:**
- Modify: `src/App.tsx` and/or `src/pages/EventsPage.tsx`

- [x] **Step 1:** When `commandShell && scope === 'unit' && onEvents`, wrap with `page--wide` (mirror users pattern)
- [x] **Step 2:** Update hard-coded event-status Hebrew strings in UI if any (EventFormPage captions that say טיוטה as status name — only where they mean event status stamp synonym)

---

### Task 4: Verify + memory

- [x] Run `npx vitest run src/lib/status.test.ts` and broader related tests
- [x] Run `npx tsc --noEmit`
- [ ] Update `.cursor/memory/MEMORY.md` event status labels (blocked by hook in session — do manually if needed)
- [x] Do not commit unless asked
