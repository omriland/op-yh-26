# Screen — My Events & Complete My Section (האירועים שלי · השלמת הפרטים שלי)

The responder's world. Optimized for one job: finish your part of the record, often later, from a phone. Always **Field** theme — this is the daylight document surface, on every device width.

## האירועים שלי (list)

Same event-card list component as `event-list.md`, filtered to the viewer's assignments, with one change: **the card's stamp reflects MY participation status**, not the event status. Shown to responders and to shift-lead/admin who also have a mine list.

- Insight strip at top (accent rail + subtle tint): loud mono open-count only (no caption under the digit) + eyebrow `האירועים שלי` + `שלום, {first name}` + sentence `יש לך N אירועים לתעד.` (zero → `אין אירועים שממתינים לתיעוד.`).
- List is grouped by logging state, not by date: `אירועים ממתינים לתיעוד` (always shown; empty copy `מברוק! אין לך עוד אירועים לתעד כרגע`) then `אירועים שתועדו` (last 30 days; secondary `הצג 30 יום נוספים` loads another 30-day window).
- Card gains a footer row when open (full-width primary): `השלמת הפרטים שלי` when participation is `pending`; `המשך מילוי הפרטים` after `שמירת טיוטה` (`in_progress`). Stamp becomes `טיוטה נשמרה`.
- Desktop responder-only: same list centered, max-width 720. No table view — this surface stays personal, not managerial.

## השלמת הפרטים שלי (fill flow)

Entry: from the card button or from the responder's own card on event detail.

### Layout

- Read-only context header first — a compact event summary card with all key ledger rows always visible (no collapse): תאריך · מספר אירוע · סוג אירוע · כביש · מיקום · אחמ״ש — so the responder is certain which event they're completing.
- Then one form section: `הפרטים שלי`.

| Field | Control | Notes |
|---|---|---|
| לוחית רישוי | select | Options = vehicles linked to this user only (plate · model). Not free-text. Prefill when exactly one vehicle. Empty roster → helper to contact admin. |
| מד אוץ התחלה | numeric, mono | |
| מד אוץ סיום | numeric, mono | must be ≥ מד אוץ התחלה — error: `מד אוץ סיום חייב להיות גדול ממד אוץ התחלה` |
| נתיב נסיעה | text | placeholder `דרך צומת X וכביש Y וכו'` |
| פירוט הטיפול | textarea | the main narrative field — min-height 120 |
| הערות לטיפול | textarea | optional |

Empty required fields show the dotted fill-in line — the blank on the form.

### Footer actions (sticky, mobile-first)

- Primary: `סיום דיווח` — validates ALL required fields; on success participation → `done`, stamp-press animation on the updated stamp, toast `הדיווח הושלם`, return to previous screen.
- Secondary: `שמירת טיוטה` — saves whatever exists, participation → `in_progress`, no validation blocking, toast `הטיוטה נשמרה`. This is the fill-later lifeline; it must always be one tap away.

### States

- **Already done:** the flow opens read-only (ledger rows, no inputs) with stamp `הושלם` and caption `הדיווח הושלם ב־09.08.2026, 14:30. רק אחמ״ש יכול לערוך לאחר סיום.` Editing after completion is not available to responders (RLS + UI). Shift-lead/admin correct via `עריכת אירוע` (lead-owned fields).
- **Connection failure on save:** error toast + data retained in the form; `סיום דיווח` re-enabled. No silent loss, ever.
- **The event closed meanwhile** (edge): show info banner `האירוע נסגר. לא ניתן לערוך את הדיווח.` and render read-only.
