# Responder Fill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship responder fill flow (השלמת הפרטים שלי) with mine/detail CTAs, event status recalc, and lead `עריכת שדות אחמ״ש` focus.

**Architecture:** Dedicated `ResponderFillPage` + `src/lib/responderFill.ts`; extend `EventSurface`; client-side event status after participation save.

**Tech Stack:** Vite + React + TS, Supabase client/RLS, existing UI components (Field theme).

## Global Constraints

- Hebrew-only UI, full RTL
- Design SoT: `design-system-design-instructions/screens/responder-fill.md`
- Spec: `docs/superpowers/specs/2026-08-09-yahpaz-responder-fill-design.md`
- No Netlify Functions; no new UI libraries
- No git commit unless user asks

---

## Task 1: Data layer

- [x] Add `src/lib/responderFill.ts`: types, `deriveEventStatusAfterParticipation`, validate, load, saveDraft, complete
- [x] RPC migration `apply_event_status_from_participations` (responders cannot UPDATE events directly)
- [x] `npm run build` passes

## Task 2: Fill page UI

- [x] Add `src/pages/ResponderFillPage.tsx` per spec (context card, fields, sticky footer, read-only states)
- [x] Minimal CSS reuse of `event-form__footer` patterns if needed
- [x] `npm run build` passes

## Task 3: Wire navigation + CTAs

- [x] `App.tsx` — fill surface + form `focusResponderId`
- [x] `EventCard` / `EventsPage` — mine footer CTA + empty copy
- [x] `EventDetailPage` — fill + lead CTAs
- [x] `EventFormPage` — expand/scroll `focusResponderId`
- [x] `npm run build` passes

## Task 4: Verify

- [x] Typecheck/build clean
- [ ] Manual acceptance checklist against spec (user)
