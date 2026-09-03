# Yahpaz — Secondary אחמ״ש on events

**Date:** 2026-09-03  
**Repo:** `yhpz-2026` (`op-yh-26` + `yahpaz-android`)  
**Status:** Implementation (decisions locked)  
**iOS:** skipped (on hold)

## Problem

Each event has one creator/lead (`events.shift_lead_id`). Other אחמ״ש who take over a live event are invisible, still hit the foreign-edit confirm (correct), and cannot be recorded as co-leads.

## Model

- **Main** = `events.shift_lead_id` (existing column — not a parallel owner).
- **Secondaries** = `event_secondary_leads` (`event_id`, `user_id`, `locked`, `added_at`).
- A user is main XOR secondary, never both. Exactly one main (column NOT NULL).

## Who can add / remove / reassign

- Add secondary: `shift_lead` OR `admin` OR `super_admin`. Picker = active users with `shift_lead` only.
- Remove secondary: same roles, **unlocked only**. Locked rows: nobody removes (including super_admin).
- Change main **at create** (row not yet having secondaries, current main = viewer): creating אחמ״ש may pick another shift_lead as main; creator becomes secondary (manual, removable).
- Change main **after that**: `admin` or `super_admin` only. New main is pulled out of secondaries; old main becomes secondary (manual unless already locked).

## Auto-secondary + lock

If a user with `shift_lead` **persists a real field or crew change** (autosave or save) and is not already main: upsert them as secondary with `locked = true`.

Does **not** add: open, cancel, foreign-edit **ביטול**, confirm-without-change, main viewing their own event.

If already secondary: stay; set `locked` if this persist is what added them or they were already locked.

## Foreign-edit popup

Skip only when the viewer **is the main**. Secondary and any other אחמ״ש still get the current confirm (`הוזן על ידי {שם}` of the **main**).

## Surfaces

Hebrew: `אחמ״ש` / `אחמ״ש ראשי` (main), `אחמ״ש משני` (secondaries). Desktop unit/location lists: main `שם · או״ק` + `+N`; hover lists secondary names. Mobile unit cards omit אחמ״ש; location cards show main only. Detail / form / cockpit reel keep full secondary names.

Web: event form (page + cockpit), cockpit reel, event detail, unit list.  
Android: event form, cockpit detail, unit event detail.  
iOS: not in this slice.

## Non-goals

- Changing who may **delete** an event (still main / admin).
- Changing unit-list “own created” filter (still `shift_lead_id`).
- Shifts (משמרות) secondary leads.
