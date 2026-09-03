---
target: event creation and event logging forms
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 4
timestamp: 2026-08-20T18-47-02Z
slug: src-pages-eventformpage-tsx
---
Method: dual-agent (A design review · B detector+mechanical), both isolated. All load-bearing findings verified against source.

Targets: EventFormPage.tsx (shift-lead) · ResponderFillPage.tsx + ShiftBornFillPage.tsx (responder) + shared form layer.

## Design Health Score — 23/40 (Acceptable)

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 2 | Event form has live שומר…/נשמר; fill page has NO save state at all. |
| 2 | Match System / Real World | 3 | Canonical vocabulary, but מספר אירוע at position 2 is usually the last thing a lead learns. |
| 3 | User Control and Freedom | 1 | Plate removal unrecoverable; conflict overwrites typing; tab-bar tap discards everything. |
| 4 | Consistency and Standards | 2 | Same button toasts הטיוטה נשמרה vs האירוע נשמר. סיום vs סיום דיווח. Three save philosophies. |
| 5 | Error Prevention | 2 | Overnight confirm excellent; בוטל cancels a whole event from a bare checkbox with no confirm while removing one responder gets a dialog. |
| 6 | Recognition Rather Than Recall | 3 | Context ledger is the model answer; מד אוץ התחלה not prefilled from last odometer_end. |
| 7 | Flexibility and Efficiency | 3 | עכשיו, searchable roads, Enter-to-commit plates, Cmd+Enter, save-and-new. |
| 8 | Aesthetic and Minimalist Design | 3 | Tokens, hairlines, one stamp; two equal full-width footer buttons violate one-primary-per-section. |
| 9 | Error Recovery | 2 | Copy excellent; scroll-to-error is a no-op on first submit, focus never moves. |
| 10 | Help and Documentation | 2 | Nothing explains that ק״מ >= 60 freezes the fuel refund. |

## Design Specificity Verdict

Authored, with a hole where the ceremony should be. Identity reaches the LAYOUT of data entry and stops at its BEHAVIOR.

Specific: אחמ״ש as a read-only ledger row with dotted leader inside the form; ruled sections with heading on the hairline carrying חלק א׳/חלק ב׳; real dotted fill-in blank (border-block-end 1.5px dotted var(--accent) via data-blank) inherited by the custom select trigger; six-row always-visible context ledger on the fill screen.

Defaults: ShiftBornFillPage is the generic-CRUD screen — eight controls, zero required, zero dotted blanks, zero validation on סיום.

KEY FINDING: StampChip implements a `press` prop, the keyframes exist (components.css:451-453, 581-590), and NOTHING passes it. Verified zero occurrences. The one choreographed moment of the whole design system is unreachable code. The record is stamped in the database and never on screen.

Detector: exit 0, ZERO findings across 43 component files, confirmed unsuppressed via --no-config. Three CSS side-tab findings, all false positives (rule pattern-matches the logical property this system mandates; in RTL the rail is on the reading-leading edge). Zero true positives.

Browser: blocked at auth. No seed user, no seed.sql, no bypass flag, no e2e target. Nothing rests on a rendered view.

## What's Working

1. Save orchestration in the event form (EventFormPage.tsx:257-418) — serialised chain, post-save id merge onto the LATEST draft not the pre-await snapshot, queueMicrotask follow-up to avoid self-deadlock. Someone lost data here once and fixed it properly.
2. The overnight-end confirm (:1216-1248) — asks a question the data cannot answer, once, remembered per responder, re-asked only when times change.
3. Sticky footer pinned to the VISUAL viewport (base.css:9-16 + appViewport.ts:51-91), so שמירת טיוטה stays above the on-screen keyboard.

## Priority Issues

### [P0] Responder fill has no data floor
Verified zero lifecycle persistence: no autosave, no blur commit, no visibilitychange/pagehide, no localStorage, no beforeunload (ResponderFillPage.tsx:126-128). Mobile tab bar renders over the form and App.tsx:711 navigate() swaps eventSurface with no dirty check. Governing user, device, hour — and the field the product exists to capture (פירוט הטיפול). Twelve lines exist for the lead (EventFormPage.tsx:624-638) and were never written for the responder.
Fix: blur+debounced server draft, visibilitychange/pagehide flush, localStorage mirror keyed by assignment, restore on mount, clear on complete, and a טיוטה נשמרה HH:mm caption.

### [P0] A save conflict destroys the typist's work
ShiftBornFillPage.tsx:162-172 — on 'מישהו שמר לפניך — רעננו' it refetches and setDraft(next.draft), replacing everything typed, behind one 4s toast. Conflict detection exists to prevent loss; here it causes it, penalising the person actively working.
Fix: never overwrite a dirty draft; keep local, show a persistent banner and let the user choose.

### [P1] Error reveal never fires on first failed submit
setErrors(...) then synchronous document.querySelector('[aria-invalid="true"]') reads the pre-render DOM (ResponderFillPage.tsx:246-249, EventFormPage.tsx:286-296). First failure: nothing carries aria-invalid yet, querySelector returns null, scroll is a no-op. Appears to work only on a second submit.
Fix: reveal in an effect keyed on errors; resolve first errored field in declared order; .focus() it, not just scroll.

### [P1] ק״מ >= 60 silently freezes the fuel refund
event_matches_over_60km freezes any event with total_km >= 60 (20260820120000_event_freeze.sql). isEventFrozen is consumed by NINE read surfaces and ZERO write surfaces. Lead types 62, autosave fires on blur, volunteer's fuel money suspended with no signal.
Fix: inline caption at the threshold + render the freeze notice in the fill context ledger and event-form header.

### [P1] Dialogs do not trap, receive, or return focus, and ignore Escape
Dialog.tsx:17-57 has no effects at all. Worse than the audit stated: it declares aria-modal="true" while enforcing no modality, so it lies to AT; and the backdrop is a real <button> in the tab order AHEAD of the dialog content. Hardcoded id="dialog-title" collides when two dialogs mount.
Fix: one focus hook — focus on open, trap Tab, Escape to close, restore to invoker, useId for the title.

### [P1] Three completion bars for one record type
ResponderFillPage requires five fields; ShiftBornFillPage requires nothing (:252-325, no required props, no errors map). Two doors into the same treatment record; the emptier one shows no dotted blanks so nothing looks unfinished.
Fix: required + validation parity, and align copy to סיום דיווח / הדיווח הושלם / הטיוטה נשמרה.

### [P2] Lead ק״מ and responder odometers are the same number entered twice
Neither side sees the other; kmDiscrepancyReport.ts exists solely to reconcile them, and the 60km financial threshold sits on the lead's copy.

## Emotional journey

Peak: the נשמר caption — quiet, past-tense, no toast spam.
Trough: the responder types for eight minutes with no indication anything is kept, in a product whose principle is "created live, finished later". The vocabulary for this state (טיוטה נשמרה) exists and is never shown.
The end is missing: סיום דיווח shows a toast and navigates away in the same tick. The stamp never flips to הושלם in front of the user; they are teleported to a list where their event has vanished. Peak-end says the last thing they feel is what they remember, and it is disappearance, not completion.

## Binding-doc contradictions (four now, across the system)

1. 06-components.md:120 (inbox card -> fill) vs responder-fill.md:12 (card tap -> detail).
2. Stepper size: 06-components.md:56 says 36x36; 08-accessibility.md:20 mandates >=44 "including stepper buttons".
3. Exclamation marks: responder-fill.md prescribes שימו לב!; 01-identity.md forbids them outright.
4. Odometer rule: responder-fill.md says ">= start" in prose and quotes a strictly-greater error string in the same line; code implements strictly greater.

## Minor observations

- .form-section__counter renders font-weight 500 (components.css:1267-1270) where the display weight is licensed at 700 — the hierarchy is inverted against the 600 heading beside it.
- data-blank dotted accent + aria-invalid red override paint together muddily; decide whether "blank" or "wrong" owns the field.
- The נשמר pulse is aria-live=polite and re-announces on every blur — 24 announcements across eight fields.
- Both fill pages render EventListSkeleton (card skeletons) for a form; 06-components.md:166 says shape mirrors the real component.
- minHeight: 120 inline magic number duplicated in both fill pages.
- מספר אירוע is styled numeric (mono) on both pages but carries no inputMode, so the phone shows an alphabetic keyboard.
- .time-field__now is 28px tall; .stepper__btn is 36x36 — both under the mobile floor.
- eventForm.ts:546 is a bare .update().eq('id') with no expected_updated_at: two leads on one event during a live incident is silent last-write-wins.
- TREATED_PLATE_LEFTOVER_ERROR says "בתחתית" about a field that is not at the bottom.
- The responder picker declares role="listbox" on a div containing a search input and a ul of buttons — invalid ARIA, no arrow-key nav, unlike the properly built SelectField.
- ShiftBornFillPage shows a hardcoded draft-tone chip as decoration; 06-components.md:66 says stamps are statuses only.

## Questions to consider

1. If `press` has never fired, has anyone in the unit ever seen the stamp land? What else is beautifully specified and never rendered?
2. Why does the responder enter odometers and the lead enter kilometres, when you built a report to catch the disagreement and a freeze rule with financial consequences on top of the lead's number?
3. The photo persists instantly; the testimony persists never. Is that the intended priority?
4. The lead's form autosaves on every blur; the responder's does not. Only one of them is standing on a highway shoulder.
5. שמירת טיוטה is called the fill-later lifeline but needs a working connection. On "no offline sync", is a network-only lifeline a lifeline?
