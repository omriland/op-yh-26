# Shift-born events Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Type-counts on a shift create shared `origin=shift` events; crew fills treatment once; standalone events stay unchanged.

**Architecture:** Additive columns on `events`/`shifts`; `sync_shift_born_events` + `save_shift_born_event_fill` RPCs; client debrief calls sync after optimistic shift save; lists expand/group via `events.shift_id`.

**Tech Stack:** Vite + React + TS, Supabase (Postgres/RLS/RPC), Vitest, רשומה UI.

## Global Constraints

- Hebrew-only UI, full RTL
- Do not change standalone event create/fill/KM/path/road
- No fill-ready email for shift-born
- Optimistic save copy: `מישהו שמר לפניך — רעננו`
- Crew 1–3: `יש לשבץ בין כונן אחד לשלושה`
- Count decrease block: `לא ניתן להקטין — קיימים אירועים שמולאו`
- Patrol shift KM never in החזר דלק; רכב פרטי `total_km` → plate owner only

## File map

- Create: `src/lib/shiftBornEvents.ts`, `src/lib/shiftBornEvents.test.ts`, `src/lib/shiftBornFill.ts`, `src/pages/ShiftBornFillPage.tsx`, `supabase/migrations/20260816120000_shift_born_events.sql`
- Modify: `src/lib/shiftForm.ts`, `src/lib/shiftForm.test.ts`, `src/lib/shifts.ts`, `src/lib/events.ts`, `src/lib/fuelRefundReport.ts`, `src/lib/fuelRefundReport.test.ts`, `src/pages/ShiftFormPage.tsx`, `src/pages/ShiftDetailPage.tsx`, `src/pages/ShiftsPage.tsx`, `src/pages/EventsPage.tsx`, `src/pages/EventDetailPage.tsx`, `src/components/shifts/ShiftCard.tsx`, `src/components/events/EventCard.tsx`, `src/components/events/EventsTable.tsx`, `src/App.tsx`

## Tasks

### Task 1: Pure helpers (TDD)

Empty/filled, fill-state stamps, last-saved label, crew validation, fuel credits.

### Task 2: Migration + RPCs

`event_origin`, event/shift columns, treated-vehicle XOR, `sync_shift_born_events`, `save_shift_born_event_fill`, search via `events.shift_id`. Apply to project `rtvizpsfvtjowbimugns`.

### Task 3: Shift save path

Validate 1–3 crew; optimistic `updated_at`; drop linker + treated-vehicle writes; call sync RPC.

### Task 4: Shared fill UI

`ShiftBornFillPage` + EventDetail/ResponderFill branch when `origin=shift`.

### Task 5: Lists

Expand shift cards; group mine events under shift header; `ממשמרת` chip; fuel report load.

### Task 6: Verify

`npx vitest run` + `npx tsc --noEmit`.
