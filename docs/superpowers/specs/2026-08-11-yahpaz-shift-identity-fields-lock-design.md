# Yahpaz — Lock shift identity fields for responders

Date: 2026-08-11  
Status: approved (approach C)  
Related: `2026-08-10-yahpaz-shifts-design.md`

## Problem

Assigned responders may edit a shift on/after `shift_date`. Today the form and RLS allow them to change **identity** fields that should only be set by a shift lead or admin: date, shift name, vehicle type, and personal plate.

## Goal

Regular responders cannot change shift identity fields. `admin` and `shift_lead` retain full edit. Enforcement is UI + client save + database (not UI-only).

## Permissions

| Field | HE label | Responder | Admin / shift_lead |
|---|---|---|---|
| `shift_date` | תאריך | read-only | editable |
| `shift_kind` | שם משמרת | read-only | editable |
| `vehicle_type` | סוג רכב | read-only | editable |
| `personal_vehicle_id` | לוחית | read-only | editable |

**Unchanged for assigned responders** (on/after `shift_date`): odometer, notes, linked events, event-type counts, treated-vehicle counts.

**Unchanged elsewhere:** create shift = lead/admin only; responder assignment = lead/admin only; delete = admin only.

Combo roles: a user with `shift_lead` or `admin` may edit identity even if also assigned as responder.

## UI

On `ShiftFormPage`, when `!(admin || shift_lead)`:

- Disable the four identity controls (`TextField` / `SelectField` `disabled`).
- Values still display; לוחית still shown when `vehicle_type === 'personal'`.
- No new copy required beyond existing disabled field affordance.

Lead/admin: no visual change.

## Client save

Extend `saveShiftForm` with an option such as `canEditIdentity` (default `true` for create; form passes `canManageLead` on edit).

When `canEditIdentity` is false and updating an existing shift:

- UPDATE payload **must not** include `shift_date`, `shift_kind`, `vehicle_type`, `personal_vehicle_id`.
- Still may update odometer fields, `total_km`, `notes`, and sync join tables as today (`syncResponders: false` for responders).

When `canEditIdentity` is true: current full payload behavior.

Prefer a small pure helper (e.g. `buildShiftUpdatePayload(draft, { canEditIdentity })`) so unit tests cover the split without mocking Supabase.

## Database

New migration: `BEFORE UPDATE` trigger on `public.shifts` (fires on every update; cheap OLD/NEW compare).

Logic:

1. If `has_role(auth.uid(), 'admin')` OR `has_role(auth.uid(), 'shift_lead')` → allow.
2. Else if `NEW.shift_date IS DISTINCT FROM OLD.shift_date` OR same for `shift_kind` / `vehicle_type` / `personal_vehicle_id` → `raise exception` with Hebrew message: `אין הרשאה לשנות פרטי משמרת`.
3. Else → allow (responder may still update other columns under existing `shifts_update_assigned` RLS).

Assigned-responder UPDATE RLS policy remains; the trigger is the column guard RLS cannot express.

## Errors

- Trigger / forbidden identity change → surface as form/toast Hebrew: `אין הרשאה לשנות פרטי משמרת` (map from Postgres message when present).
- Other save failures unchanged.

## Testing

- Unit: helper builds full identity columns for lead; omits them for responder.
- Unit (optional pure): identity-change detection rules if extracted.
- After migration: manual smoke — responder cannot change date/kind/vehicle/plate in UI; forged UPDATE of those columns fails; lead can still change them; responder can still save odometer/notes.

## Out of scope

- Locking odometer, notes, or event links for responders
- Changing list/detail screens beyond form disabled state
- Shift create/delete policy changes
