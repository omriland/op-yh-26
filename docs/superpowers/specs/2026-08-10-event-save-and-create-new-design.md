# Save event and create another

Date: 2026-08-10  
Status: implemented

## Goal

From the event form, save the current event and immediately open a blank create form for the next one (batch entry).

## Decisions

- Button label: `שמירת אירוע ויצירת חדש` (secondary), next to primary `שמירת אירוע`
- After success: toast `האירוע נשמר`, reset to `emptyEventDraft` (today + lead only — no field carry-over)
- Parent surface stays on create form (`{ kind: 'form' }` without `eventId`), not detail
- Works from create and edit
- ⌘/Ctrl+Enter remains primary save → detail only
