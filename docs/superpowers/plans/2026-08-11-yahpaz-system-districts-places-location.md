# System שלוחות + Google Places location — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) or subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock the single system district `תחנה / אחר / משוכפל` and require Places-assisted מיקום (HE) with free-text-first when selected.

**Architecture:** DB `districts.code` + trigger lock; `events` place columns; pure helpers for system detection / clear-on-switch / validation; client Places Autocomplete (Maps JS) behind `LocationPlacesField`; admin UI hides edit/delete for system rows.

**Tech Stack:** Supabase Postgres, Vite React TS, Google Maps JavaScript API + Places (browser key).

## Global Constraints

- Hebrew-only UI, full RTL
- Visual SoT: `design-system-design-instructions/`
- No secrets in repo (key via `VITE_GOOGLE_MAPS_API_KEY`)
- Spec: `docs/superpowers/specs/2026-08-11-yahpaz-system-districts-places-location-design.md`

## File map

| File | Responsibility |
|---|---|
| `supabase/migrations/20260811140000_system_districts_places_location.sql` | code column, seed, trigger, event place columns |
| `src/lib/systemDistricts.ts` | codes, `isSystemDistrictCode`, clear helpers |
| `src/lib/systemDistricts.test.ts` | unit tests |
| `src/lib/closedLists.ts` | `code` on items; block update/delete for system |
| `src/lib/closedLists.test.ts` | guard tests (pure helpers) |
| `src/lib/eventForm.ts` | draft place fields, validate, save payload, district switch |
| `src/lib/googlePlaces.ts` | script load, autocomplete, place details |
| `src/components/events/LocationPlacesField.tsx` | combobox UI |
| `src/pages/EventFormPage.tsx` | wire Places vs plain field |
| `src/pages/AdminListsPage.tsx` | hide menus; מערכת caption |
| `src/styles/components.css` | places dropdown styles |
| `.cursor/memory/MEMORY.md` | record feature |

### Task 1: Pure helpers + tests (TDD)

- [ ] Add `systemDistricts.ts` with codes and helpers
- [ ] Tests: detection, clear-on-switch, required location gate
- [ ] Extend `eventForm` validation/draft types using helpers

### Task 2: Migration

- [ ] Create + apply migration (code, seed, trigger, event columns)

### Task 3: Closed lists + admin UI

- [ ] Select `code`; block client update/delete for system
- [ ] Admin UI: no edit/delete; caption `מערכת`

### Task 4: Places field + event form wire

- [ ] `googlePlaces.ts` + `LocationPlacesField`
- [ ] Event form: Places mode, save place fields, clear on switch

### Task 5: Verify + MEMORY

- [ ] `npm test` + `npm run build`
- [ ] Update MEMORY.md
