# Yahpaz — Responder fill flow (השלמת הפרטים שלי)

Slice: responder completes own participation fields per `design-system-design-instructions/screens/responder-fill.md`. Also wires mine-list / detail CTAs and lead shortcut `עריכת שדות אחמ״ש`.

## Decisions (locked)

| Topic | Choice |
|---|---|
| Architecture | Dedicated `ResponderFillPage` + `src/lib/responderFill.ts` |
| Event status after participation save | **Client recalc** — any open → `partial`; all `done` → `done` |
| Lead shortcut | In scope — detail ghost → event form with `focusResponderId` |
| Theme | Always **Field** for fill + mine list |

## Navigation

Extend `EventSurface`:

```ts
| { kind: 'fill'; eventId: string; returnTo: 'list' | 'detail' }
| { kind: 'form'; eventId?: string; focusResponderId?: string }
```

| Entry | Action |
|---|---|
| האירועים שלי — open card footer | Primary `השלמת הפרטים שלי` → fill (`returnTo: 'list'`) |
| Event detail — viewer’s own open card | Primary `השלמת הפרטים שלי` → fill (`returnTo: 'detail'`) |
| Event detail — shift-lead/admin on any card | Ghost `עריכת שדות אחמ״ש` → form with `focusResponderId` |
| Event detail — header | Existing `עריכת אירוע` unchanged |

Exit: back control and successful **סיום דיווח** return to `returnTo`. Draft save stays on the fill screen.

## Mine list (`scope: 'mine'`)

- Stamp = **participation** status (already).
- Open (`pending` / `in_progress`) sort first (already).
- Open cards: full-width footer primary `השלמת הפרטים שלי` (stop propagation so it does not open detail).
- Card body click still opens detail.
- Empty state when the mine list has **zero events**: icon check-circle, title `אין דיווחים שממתינים לך`, caption `כשתשובצו לאירוע, הוא יופיע כאן.` (Completed-only lists still render those cards; they are not treated as empty.)
- Desktop responder: centered max-width 720; no table.

## Fill screen (`ResponderFillPage`)

### Layout

1. Back + title `השלמת הפרטים שלי` + participation stamp (small, unrotated).
2. Context card — ledger always visible (no collapse): תאריך · מספר אירוע · סוג אירוע · כביש · מיקום · אחמ״ש.
3. Form section `הפרטים שלי` with fields below.
4. Sticky footer (same pattern as event form footer).

### Fields

| Field | Control | Required for complete | Notes |
|---|---|---|---|
| לוחית רישוי | select of user's linked vehicles | yes | Not free-text. Options from `vehicles` (plate · model). Prefill when exactly one. |
| קמ התחלה | numeric mono | yes | |
| קמ סיום | numeric mono | yes | Must be ≥ קמ התחלה; error `קמ סיום חייב להיות גדול מקמ התחלה` |
| נתיב נסיעה | text | yes | Placeholder `דרך צומת X וכביש Y וכו'` |
| פירוט הטיפול | textarea min-height 120 | yes | |
| הערות לטיפול | textarea | no | |

Empty required fields use dotted fill-in line (existing field error/empty chrome).

### Footer actions

- **סיום דיווח** (primary): validate all required; on success → participation `done`, recalc event status, toast `הדיווח הושלם`, navigate `returnTo`. Stamp-press when returning to a surface that shows the new stamp if cheap; otherwise toast is enough for v1.
- **שמירת טיוטה** (secondary): no required validation; participation → `in_progress` (from `pending` or stay `in_progress`); toast `הטיוטה נשמרה`; stay on screen.

### Read-only states

- Participation already `done`: ledger rows (no inputs), stamp `הושלם`, caption includes completion time when known + `רק אחמ״ש יכול לערוך לאחר סיום.` Responders cannot edit after `סיום דיווח` (UI + RLS `event_responders_self_update` blocks when participation or event is `done`). Shift-lead/admin correct via event form (`עריכת אירוע` / lead-owned fields).
- Event status `done` while somehow still editing: info banner `האירוע נסגר. לא ניתן לערוך את הדיווח.` + read-only (same as done).
- Not assigned / RLS deny: empty state `אין לך הרשאה לצפות באירוע זה או שהאירוע אינו קיים.` + back.

### Errors

- Save failure: toast `שמירת הדיווח נכשלה. בדקו את החיבור ונסו שוב.` (or reuse existing connection failure wording if shared); form data retained; buttons re-enabled.

## Data layer (`src/lib/responderFill.ts`)

### Load

- Fetch event summary + the viewer’s `event_responders` row (by `event_id` + `responder_id = auth.uid()`).
- Prefetch viewer vehicles for plate prefill.
- Return `null` if missing → deny UI.

### Save payload (responder-owned columns only)

`vehicle_plate`, `odometer_start`, `odometer_end`, `route`, `treatment_detail`, `treatment_notes`, `status`, `updated_at`.

Do **not** write lead-owned fields (`started_at`, `ended_at`, `total_km`, `emergency_means`, treated vehicles).

### Status helpers

```ts
function deriveEventStatusAfterParticipation(
  currentEventStatus: EventStatus,
  participationStatuses: ParticipationStatus[],
): EventStatus
```

Rules:

- If every participation is `done` → `done`.
- Else if at least one participation exists and not all done → `partial` (unless current is `draft` with zero responders — N/A here).
- Never force `draft` after a responder save.
- If current is `draft` but responders exist → prefer `partial` when any done/open mix, else `in_progress`.

After successful participation update: `events.update({ status, updated_at })` with derived status when it differs.

### Validation

- Complete: non-empty plate (digits), both odometers finite numbers, `odometer_end >= odometer_start`, non-empty route + treatment_detail.
- Draft: accept partial; still reject non-numeric odometer strings if provided.

## Event form focus

`EventFormPage` accepts optional `focusResponderId`. On load/ready: expand the matching assignment row (`expanded: true`) and scroll it into view once.

## Out of scope

- Lead editing **responder-owned** fields (לוחית / קמ / נתיב / פירוט) after done — still out of form per `event-form.md`; lead edits lead-owned fields via form. If product later needs lead to fix plate/route/etc., add an explicit lead path.
- True URL routing / deep links.
- DB trigger for event status (client only this slice).
- Changing treated-vehicle / overnight behavior (separate bugs already addressed).

## Files (expected)

- `src/lib/responderFill.ts` — load/save/validate/status
- `src/pages/ResponderFillPage.tsx` — UI
- `src/App.tsx` — surface wiring
- `src/pages/EventsPage.tsx` / `EventCard.tsx` — mine footer CTA + empty copy
- `src/pages/EventDetailPage.tsx` — fill + lead CTAs
- `src/pages/EventFormPage.tsx` — `focusResponderId`
- Styles: reuse event-form footer / field patterns; minimal new CSS if needed

## Acceptance

1. Responder opens mine → `השלמת הפרטים שלי` → fills → טיוטה → returns later → סיום דיווח → toast → list; stamp `הושלם`.
2. Last open responder completes → event status becomes `done`.
3. Mid-complete (others still open) → event status `partial`.
4. Lead on detail → `עריכת שדות אחמ״ש` opens form with that responder expanded.
5. Done participation opens read-only fill with completion caption.
6. Offline/error save keeps local form values and shows toast.
