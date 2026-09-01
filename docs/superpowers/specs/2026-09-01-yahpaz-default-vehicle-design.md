# Yahpaz — Default vehicle (רכב ראשי)

**Date:** 2026-09-01  
**Repo:** `yhpz-2026`  
**Status:** Applied on production (`vehicle_is_default`); profile starring + assignment/fill/shift defaults.  
**Depends on:** `vehicles` / `event_responders` / shifts personal plate (`2026-08-10-yahpaz-shifts-design.md`), רשומה profile (`design-system-design-instructions/screens/profile.md`)

## Problem

A responder can have several registered vehicles. Fill and assignment leave the plate empty whenever more than one car exists, so the volunteer re-picks the same car on every event. There is no way to mark which vehicle is the usual one.

## Goals (v1)

- Responder can mark **one** active vehicle as **רכב ראשי** on **פרופיל** (star / favorite)
- Star only appears when there are **two or more** active (non-archived) vehicles
- That vehicle is the default plate when:
  - a responder is **assigned** to a new event (`event_responders.vehicle_plate` on insert)
  - fill (web, fill-token, partner API) has no plate saved yet
  - a shift of type **רכב פרטי** has no plate chosen yet
- Hebrew-only RTL, רשומה
- One default per user (DB-enforced)

## Non-goals (v1)

- Admin user form starring (profile is the setter; admin add/archive still auto-promotes)
- Native Android UI (separate repo; DB default still applies to new assignments)
- Allowing zero defaults when the user still has an active vehicle
- Changing an already-saved fill plate when the star moves

## Schema

`public.vehicles.is_default boolean not null default false`

Partial unique index: one `is_default` row per `user_id`.

### Write rules (triggers)

- Archived row cannot stay default (`is_default` forced false).
- Setting `is_default = true` clears any other default for that user.
- After insert / archive / delete: if the user has active vehicles and none is default, promote the oldest active vehicle.
- Backfill: same promote rule for existing users.

### RPC

`public.set_default_vehicle(p_vehicle_id uuid)` — `security invoker`. Owner or admin (existing vehicles RLS). Rejects archived / missing rows with Hebrew errors.

### Assignment default

`public.default_vehicle_plate_for_user(uid)`:

1. Active vehicle with `is_default`
2. Else the only active vehicle
3. Else null

`BEFORE INSERT` on `event_responders`: if `vehicle_plate` is null, fill from that function. Does **not** run on update (fill must be able to change the plate).

## Client

### Profile

Ledger of vehicles unchanged for a single car. With 2+ active vehicles, each active row gets a 44×44 star at inline-end of the plate:

- Empty star: `הגדר כרכב ראשי`
- Filled star (`--accent`): `רכב ראשי` (`aria-pressed`)
- Caption: `לחצו על הכוכב כדי לבחור רכב ראשי לאירועים ולמשמרות.`
- Toast: `הרכב הראשי עודכן.`
- Archived rows: no star
- Tapping the current star is a no-op

### Fill

Selection order: saved plate (if still allowed) → starred default → only vehicle → empty.

### Shifts

When `vehicle_type = personal` and `personal_vehicle_id` is empty, pick the first assigned responder’s starred vehicle, else any star, else the only crew plate.

## Success

- Two cars on a profile: starring one, then creating an event and assigning that responder, stores that plate on the new `event_responders` row.
- Fill with no saved plate opens with the starred car selected.
- Personal shift with an empty plate select pre-fills the starred car of the first assigned responder who has one.
