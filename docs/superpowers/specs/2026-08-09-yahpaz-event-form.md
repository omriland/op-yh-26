# Yahpaz — Event create / edit form

Slice: shift-lead (and admin) create & edit events per `design-system-design-instructions/screens/event-form.md`.

## Behavior

- **Autosave** on field blur / select / assign / remove / stepper / toggle; also on tab hide / page hide / back.
- **Single footer action:** `שמירת אירוע` → flush + toast + detail.
- **Status:** `draft` iff zero responders assigned; otherwise `in_progress` (preserve `partial` / `done`).
- Incomplete fields always allowed.

## Scope shipped

- `EventFormPage` + `src/lib/eventForm.ts` (`deriveEventStatus`, `saveEventForm`)
- Entry: **אירוע חדש** / **עריכת אירוע**
- Field paper panel (`data-theme="field"`)

## Out of scope

- Responder-owned fill flow
- Soft-delete / admin overflow on detail
