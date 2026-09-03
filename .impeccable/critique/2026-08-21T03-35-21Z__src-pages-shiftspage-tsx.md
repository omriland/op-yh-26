---
target: the shifts page
total_score: 17
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 3
timestamp: 2026-08-21T03-35-21Z
slug: src-pages-shiftspage-tsx
---
Method: dual-agent (A design review · B detector+mechanical), both isolated. All load-bearing findings verified against source.

Targets: src/pages/ShiftsPage.tsx (413, serves scope 'mine' and 'unit') · ShiftDetailPage.tsx (363) · ShiftFormPage.tsx · src/components/shifts/.

## Design Health Score — 17/40 (Poor)

Lowest of the three surfaces reviewed this session (events list 24, forms 23).

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 1 | shiftStamp()/SHIFT_FILTERS have ZERO consumers; status frozen at 'draft'; desktop table has no status or odometer column. |
| 2 | Match System / Real World | 2 | Column labelled שם משמרת renders shift_kind (בוקר/צהריים). Primary reads תיעוד משמרת on documented AND future shifts. |
| 3 | User Control and Freedom | 1 | No card route to detail; one all-or-nothing שמירה; no dirty guard; no URL. |
| 4 | Consistency and Standards | 1 | Seventeen divergences from events, five of them defects fixed on events today. |
| 5 | Error Prevention | 1 | No odometer_end >= start rule; computeTotalKm writes a negative total_km into the fuel reports. |
| 6 | Recognition Rather Than Recall | 2 | Pending card never shows the odometer — the field that makes it pending. |
| 7 | Flexibility and Efficiency | 2 | Phone משמרות has no search and no filter chips over an unbounded list. |
| 8 | Aesthetic and Minimalist Design | 2 | Every card carries an enabled primary; ten shifts = ten primaries. |
| 9 | Error Recovery | 3 | DS-exact load-failure copy + רענון; honest partial-search degradation; real optimistic concurrency. |
| 10 | Help and Documentation | 2 | "last 200" hint desktop-only; empty state drops the DS-required caption. |

## Design Specificity Verdict

A competent generic list wearing the events surface's clothes.

VERIFIED: shiftStamp() and SHIFT_FILTERS (status.ts:122-139) have ZERO consumers anywhere in src/. The design system's signature element was authored FOR shifts and never wired.

VERIFIED: shiftForm.ts:331 `const nextStatus: ShiftStatus = 'draft'`, used on insert (:357); the update path never touches status. No shift has ever been anything but draft, and none can become anything else by any route. The de facto state is a derived predicate (odometer missing) that drives the nav dot and bucketing and is never rendered.

The tell: ShiftCard.tsx:61 puts assignment-card--open (a class authored for the shift FORM's assignment card) onto a .card. Copy-paste, not authorship.

Better than events (change the blueprint, not the code): hebrewWeekdayLetter on every date; three always-visible sections (pending/future/archive) instead of hidden tabs, which handles משמרות עתידיות in a way the two-tab model cannot express.

Detector: exit 0, ZERO findings across target components, confirmed unsuppressed via --no-config. Three CSS side-tab findings, all false positives (the rule penalises the 3px inline-start rail that 06-components.md:122-123,157 mandates). Zero true positives — and the detector MISSED the exclamation-mark violation a human found by hand.

Browser: blocked at auth. Note correction: .env.local does hold project keys; what is absent is any USER credential. Every measurement here is declared, never computed.

## Where the events lessons did not land — five defects fixed on events TODAY, still live here

| Defect | Events (fixed) | Shifts (live) |
|---|---|---|
| Card path unbounded | EventsPage.tsx:103 capped with a comment | ShiftsPage.tsx:73 fetchShifts(asTable ? {limit} : undefined) — phone gets every shift ever with nested born_events/responders/linked_events/treated |
| Mine fetch unbounded | fetchMyEvents split so the cap lands on the archive only | fetchMyShifts uncapped on every surface; the 30-day window is display-only over already-downloaded rows |
| No focus to first error | fixed via useRevealFirstError | absent entirely — no focus(), no scrollIntoView in the form |
| מספר אירוע missing inputMode | fixed | still missing — alphabetic keyboard for a digits-only id |
| style={{ width: 280 }} | replaced with a class | ShiftsPage.tsx:192 still inline |

## What's Working

1. Three-section mine list beats the events tab model for real domain reasons (ShiftsPage.tsx:166-170 supplies a three-way bucket including 'future'). This is the shape the events inbox should adopt.
2. SHIFT_TOO_EARLY_MESSAGE is stated identically in all three places it can be met and reaches screen readers via aria-label (ShiftCard.tsx:99-104) — a disabled control that explains itself, not a hover-only tooltip.
3. Search hydration is a genuine peer of events: debounce, id-search, gap detection, chunked hydration, merge, and honest degradation with a truthful toast (ShiftsPage.tsx:114-144).

## Priority Issues

### [P0] ShiftDetailPage is unreachable from every card list
ShiftCard.tsx:105 calls (onFill ?? onOpen); App.tsx:909 always supplies onFill, so onOpen never fires. Only the desktop table row reaches it — and that row is a <tr onClick> with no tabIndex or key handler, so it is pointer-only. A 363-line read surface may have been seen by almost nobody. Reading a shift means opening the editor that can overwrite it.
Fix: whole-card tap -> onOpen (detail), matching EventCard.tsx:52. Reserve the primary for the fill action and render it only when the shift is actually pending. Add tabIndex/keyboard to the table row.

### [P0] A reversed odometer saves a negative total_km into the reports
validateShiftSave (shiftForm.ts:85-103) omits the odometer_end >= start rule that responder-fill.md mandates verbatim for the sibling flow. computeTotalKm (:24-30) returns the negative; it is written to total_km (:264) and surfaces months later in km-exception and fuel-refund reporting. Compounding: the odometer TextFields are passed NO error prop, so even a produced odometer error is dropped from the field.
Fix: add the canonical error string, block the save, wire error props on both fields.

### [P1] Shift status was designed, encoded, and never connected
Fix: advance status on save (closed when both odometers present, in_progress otherwise), render shiftStamp() on the card head, as a סטטוס column, and as the detail header stamp; wire SHIFT_FILTERS into FilterChips.

### [P1] The phone's unit list is uncapped, unsearchable, unfiltered
And asTable sits in the effect deps (ShiftsPage.tsx:85), so crossing 1025px silently re-fetches unbounded.

### [P1] No draft save, no dirty guard, no URL
~24 controls behind one שמירה, with a 1-to-3 crew rule revealed only at submit. An Android back gesture discards it silently. Shift documentation is the MORE interruptible flow — the volunteer is often still standing at the vehicle.

### [P2] מברוק! אין לך עוד משמרות לתעד כרגע (ShiftsPage.tsx:245)
Exclamation mark and celebratory register, forbidden by 01-identity.md:59 and 05-rtl-language.md:55. A bare <p>, not the DS EmptyState. And because the mine path never reaches ListEmptyState, this is the FIRST-RUN screen for a volunteer with zero shifts — congratulated for finishing nothing.

## Emotional journey

Peak-end fails completely. There is no closing: status never leaves draft, the toast says המשמרת נשמרה (a save, not a completion), and the stamp press cannot fire because there is no stamp to press. Then the user is dropped on a detail page they had no other way to reach, which on desktop has just lost its sidebar. Back on the list, the card has silently moved between headings with the same button on it.

## Minor observations

- The hover rule added earlier today is scoped to .event-card-shell, which NO shift screen renders — ShiftsTable.tsx:115, ShiftCard.tsx:121, ShiftDetailPage.tsx:297 use bare .event-card, so grid-area: body is inert and there is no hover state.
- .table--shifts (ShiftsTable.tsx:43) has no CSS anywhere.
- The expansion <tr> inherits cursor:pointer and an accent hover it cannot honor; the .is-static opt-out exists and is unapplied.
- The form is not a <form> and submit is type="button", so the four required attributes are decorative and Enter never submits.
- Submit-failure banner is aria-live="polite" where 08-accessibility.md:30 requires assertive/role="alert". The crew error is a plain <p> with no wiring.
- Both ShiftDetailPage and ShiftFormPage sink NETWORK failures into their permission-denied empty state, so a dropped connection reads as "you don't have access", with no retry.
- הצג 30 יום נוספים resets to one window on any refresh, discarding months of paging.
- Skeletons: card skeleton has no button block (cards grow on load); detail skeleton shows 1 card where 3 render; the form gets card skeletons for a four-section form.
- בתהליך (shiftBornEvents.ts:44) is not in the canonical status vocabulary.
- למחוק את המשמרת? omits the object identifier the DS requires.
- 1 כוננים · 1 אירועים — unpluralized and un-mono, while shiftGroupPendingCaption pluralizes correctly elsewhere.
- treated_vehicle_counts is selected and typed and never rendered.

## Root cause

There is NO screens/shifts.md. Every other major surface has a blueprint and 00-how-to-use.md:15 instructs reading it. Almost every finding above is what happens when a surface is assembled from a neighbour's component kit with no spec of its own: the vocabulary exists in status.ts but nothing says where to render it, and the events lessons live in comments on the events files and never crossed over.

## Decisions taken (2026-08-21)

Omri chose: start with the two P0s; IMPLEMENT the status transition (not the derived-state shortcut, not deletion); and add both שמירת טיוטה + dirty guard AND inline odometer entry on the pending card.
