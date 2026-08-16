# Shift-lead cockpit (קוקפיט)

Date: 2026-08-16

## Problem

During a shift, אחמ״ש needs an inbox for live events: scan the last two hours, open one, create the next, and keep typing without hunting Save or leaving the page.

## Decision

New desktop sidebar item **הקוקפיט** under כלים לאחמ״ש (`shift_lead` + `admin`). Opening it hides the app sidebar (top chrome stays) and shows a full-bleed split. The top app bar wordmark is **אבן דרך - הקוקפיט** in `--font-brand`. Every גלגלת row shows a bin as part of the selected row. Delete is blocked only while responders are allocated (`יש כוננים משובצים. הסירו אותם תחילה.`). After they are removed, two-click delete works (`לחצו שוב למחיקה.`). RLS: `shift_lead` may delete a cockpit-window event with no `event_responders`; admin already could.

- **גלגלת** (inline-start / visual right in RTL): events with `created_at` in the last 2 hours, newest first, plus **אירוע חדש**.
- **Stage**: the existing event form. Click a row or create → that form fills the rest of the page.

## Behavior

- **אירוע חדש** inserts a `draft` row immediately (`shift_lead_id` + today's Jerusalem date) and selects it.
- Form variant `cockpit`: no Back, no Save / Save-and-new, no ⌘/Ctrl+Enter submit. Caption is the live pulse (`שומר…` / `נשמר`).
- Autosave on edit with 800ms debounce, plus the existing blur / hide flushes. Partial drafts persist (`event_type_id` / `road_id` may be null).
- Switching גלגלת rows remounts the form (flush on unmount). Persist refreshes the reel titles.
- Empty reel: short copy in the list. Nothing selected: empty state that points at **אירוע חדש**. If the reel has rows on first load, select the newest.

## URL

Real paths: `/cockpit` and `/cockpit/:eventId`. Refresh restores the same selected event. Entering the cockpit `push`es; switching events `replace`s; leaving replaces back to `/`. Netlify already SPA-fallbacks `/*` → `index.html`.

## Out of scope

Filters/search on the גלגלת, extra schema, volunteer/reports work, hiding the top app bar, a dedicated mobile tab (desktop sidebar only).

## Proof

- Unit: 2-hour window, reel title, Jerusalem clock, partial persist payload.
- Shift-lead on localhost: open קוקפיט, create, edit without Save, list updates.
