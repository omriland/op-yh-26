# Yahpaz — Event status vocabulary + table flow trail

Date: 2026-08-12  
Status: approved for implementation planning

## Goal

1. Widen the desktop Command **אירועים** (unit Events) page by ~20%.
2. In that page’s table, replace the single status stamp with a full graphical pipeline showing all event steps and highlighting the current one.
3. Rename event status labels app-wide to the approved Hebrew vocabulary.

## Non-goals

- Changing event status derivation / DB enum values (`draft` | `in_progress` | `partial` | `done`)
- Changing participation statuses or their labels
- Changing shift statuses
- Adding **בוטל** as a pipeline step (cancelled remains `is_cancelled` + separate stamp)
- Showing the full trail on mobile cards, mine list, event detail header, or event form (those keep a single stamp chip with the new labels)

## Vocabulary (app-wide)

| Code | Hebrew label |
|---|---|
| `draft` | אירוע בהזנה |
| `in_progress` | ממתין לתיעוד |
| `partial` | תועד חלקית |
| `done` | הושלם |

Update every product surface that shows event-level status text, including but not limited to:

- `EVENT_STAMPS` / `EVENT_FILTERS` in `src/lib/status.ts`
- Desktop Events table
- Mobile unit event cards
- Event detail / form stamps
- Filter chips on Events
- Design-system canonical vocabulary note in `design-system-design-instructions/05-rtl-language.md` (and any filter lists in `screens/event-list.md` that still use old names)

Participation labels stay unchanged (e.g. ממתין למילוי פרטים, טיוטה נשמרה, ממתין לכונן).

## Layout — +20% width

On desktop Command when rendering the unit Events list (`asTable` / unit scope), wrap the page content with the existing `page--wide` class so:

```css
max-width: calc(var(--content-max) * 1.2);
```

Same pattern already used for Admin Users. Do not invent a second width token.

## Status column — compact pipeline + current label (Events table only)

Revised from full-label trail (too dense in the table) to approach B.

Pipeline order (RTL UI; logical order below):

1. אירוע בהזנה  
2. ממתין לתיעוד  
3. תועד חלקית  
4. הושלם  

Visual:

- Compact 4-node track (dots + connectors) showing past / current / future position.
- Current node uses the status tone color; past filled muted; future outline only.
- Below the track: current step label (no stamp outline), under the active node.
- Hovering the status label (for `in_progress` / `partial`) shows who is **הושלם** / **טיוטה נשמרה** / **ממתין לתיעוד** (instant Command tip; empty groups omitted).
- Event `partial` requires at least one participation `done`. A draft save alone stays `in_progress` (RPC + client aligned; migration `20260812140000_event_partial_requires_done.sql`).
- Always use **event** `status` — no viewer-relative participation override in this column.

Cancelled:

- Do **not** show בוטל in the status column. Cancelled stays on the event-type cell (`EventTypeLabel`) as today. Trail still reflects underlying `event.status`.

Accessibility:

- Expose a single clear accessible name for the cell = current event label (new vocabulary).
- Color is not the only channel: stamp text carries the status; nodes are decorative (`aria-hidden`).

## Surfaces that keep a single stamp

- Mobile event cards (unit + mine)
- האירועים שלי (any viewport)
- Event detail header stamp
- Event form stamp

These use the **new** labels via shared `eventStamp` / filters, but not the multi-step trail.

## Implementation sketch (for planning)

- Centralize labels in `src/lib/status.ts` (single source).
- New presentational component e.g. `EventStatusTrail` used only by `EventsTable`.
- Wire `page--wide` for unit Events in `App.tsx` (or EventsPage root) when Command table is shown.
- Unit tests for label map + trail current/past/future classification; update any snapshots/tests that assert old Hebrew strings.

## Acceptance

1. Desktop unit Events page is ~20% wider than default content max.
2. Table status column shows all four steps with current emphasized; matches event `status`.
3. Standalone old event labels (`טיוטה`, `בטיפול`, `ממתין לתיעוד`, `הושלם חלקית`) no longer appear as the event status name; the new four labels are used instead (note: `ממתין לתיעוד` remains only as part of the new `in_progress` phrase).
4. Cancelled events still show בוטל without becoming a fifth pipeline step.
5. Mine list / participation stamps unchanged in meaning and copy.
